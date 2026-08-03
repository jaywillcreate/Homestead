import { cookies } from "next/headers";
import crypto from "crypto";
import { q, qOne, run } from "./db";
import type { Role, User } from "./types";
import { can, type Capability } from "./permissions";

const COOKIE = "homestead_session";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return qOne<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [token]
  );
}

/** Sign in as a household member. Returns the session token to set as a cookie. */
export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  await run("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, userId]);
  await touch(userId);
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token = $1", [token]);
}

export const SESSION_COOKIE = COOKIE;

export class PermissionError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/**
 * Server-side gate used by every mutating API route.
 * Throws PermissionError (401/403) which route handlers convert to a response.
 */
export async function requirePermission(capability: Capability): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new PermissionError("Not signed in", 401);
  if (!can(user.role as Role, capability))
    throw new PermissionError(`Your role (${user.role}) cannot perform this action`);
  await touch(user.id);
  return user;
}

async function touch(userId: number) {
  await q(
    `UPDATE users SET last_active = to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1`,
    [userId]
  );
}

export function permissionResponse(err: unknown): Response | null {
  if (err instanceof PermissionError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}

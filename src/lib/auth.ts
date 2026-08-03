import { cookies } from "next/headers";
import crypto from "crypto";
import { getDb } from "./db";
import type { Role, User } from "./types";
import { can, type Capability } from "./permissions";

const COOKIE = "homestead_session";

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    )
    .get(token) as User | undefined;
  return row ?? null;
}

/** Sign in as a household member. Returns the session token to set as a cookie. */
export function createSession(userId: number): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, userId);
  db.prepare("UPDATE users SET last_active = datetime('now') WHERE id = ?").run(userId);
  return token;
}

export function destroySession(token: string) {
  getDb().prepare("DELETE FROM sessions WHERE token = ?").run(token);
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
  db_touch(user.id);
  return user;
}

function db_touch(userId: number) {
  getDb().prepare("UPDATE users SET last_active = datetime('now') WHERE id = ?").run(userId);
}

export function permissionResponse(err: unknown): Response | null {
  if (err instanceof PermissionError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}

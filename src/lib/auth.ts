import { cookies } from "next/headers";
import { cache } from "react";
import { q, qOne, run } from "./db";
import type { Role, User } from "./types";
import { can, type Capability } from "./permissions";
import { newToken, sha256, LINK_TTL_DAYS } from "./password";

const COOKIE = "homestead_session";
const SESSION_DAYS = 30;
const NOW = `to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

/** Columns safe to hand around — never the password hash or link tokens. */
const USER_COLS = `u.id, u.name, u.email, u.role, u.last_active, u.theme_prefs,
  u.phone, u.phone_verified, u.status`;

/**
 * The signed-in user, or null. A session only counts when it is unexpired and
 * the account is active — disabling a person takes effect on their next request.
 * Memoized per server render so layouts and pages share one lookup.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return qOne<User>(
    `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at IS NOT NULL AND s.expires_at > ${NOW}
       AND u.status = 'active'`,
    [sha256(token)]
  );
});

/** Start a session. Returns the raw token to set as the cookie (only its hash is stored). */
export async function createSession(userId: number): Promise<string> {
  const { raw, hash } = newToken();
  await run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES ($1, $2, to_char(now() at time zone 'utc' + interval '${SESSION_DAYS} days', 'YYYY-MM-DD HH24:MI:SS'))`,
    [hash, userId]
  );
  // Opportunistic cleanup of expired sessions.
  await run(`DELETE FROM sessions WHERE expires_at IS NULL OR expires_at <= ${NOW}`);
  await touch(userId);
  return raw;
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(token: string): Promise<void> {
  await run("DELETE FROM sessions WHERE token = $1", [sha256(token)]);
}

/** Sign a person out everywhere (password change, disable, removal). */
export async function destroyUserSessions(userId: number): Promise<void> {
  await run("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

/**
 * Mint a one-time set-password link for a user (invite or reset).
 * Returns the app-relative path; the caller prefixes the site origin.
 */
export async function issuePasswordLink(userId: number): Promise<string> {
  const { raw, hash } = newToken();
  await run(
    `UPDATE users SET invite_token_hash = $1,
       invite_expires = to_char(now() at time zone 'utc' + interval '${LINK_TTL_DAYS} days', 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $2`,
    [hash, userId]
  );
  return `/invite/${raw}`;
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
 * Server-side gate used by every API route.
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

/** Any signed-in, active member. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new PermissionError("Not signed in", 401);
  return user;
}

async function touch(userId: number) {
  // At most one write every few minutes per person, not one per request.
  await q(
    `UPDATE users SET last_active = ${NOW}
     WHERE id = $1 AND (last_active IS NULL
       OR last_active < to_char(now() at time zone 'utc' - interval '5 minutes', 'YYYY-MM-DD HH24:MI:SS'))`,
    [userId]
  );
}

export function permissionResponse(err: unknown): Response | null {
  if (err instanceof PermissionError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  return null;
}

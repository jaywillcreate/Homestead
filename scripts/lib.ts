/** Shared helpers for the command-line scripts. */
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { run } from "../src/lib/db.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { newToken, LINK_TTL_DAYS } from "../src/lib/password.ts";

/** Mint a one-time set-password link for a user and return its app-relative path. */
export async function mintPasswordLink(userId: number): Promise<string> {
  const { raw, hash } = newToken();
  await run(
    `UPDATE users SET invite_token_hash = $1,
       invite_expires = to_char(now() at time zone 'utc' + interval '${LINK_TTL_DAYS} days', 'YYYY-MM-DD HH24:MI:SS')
     WHERE id = $2`,
    [hash, userId]
  );
  return `/invite/${raw}`;
}

export function printLink(name: string, email: string, path: string): void {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log(`\nOne-time set-password link for ${name} <${email}> (valid ${LINK_TTL_DAYS} days):\n`);
  console.log(`  ${base}${path}\n`);
  if (!process.env.APP_URL) {
    console.log("  On the deployed site, swap http://localhost:3000 for your site's address");
    console.log("  (or set APP_URL when running this script).\n");
  }
}

/** Which database this run will touch — host and name only, never credentials. */
export function describeDatabase(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return `${u.hostname}${u.pathname}`;
  } catch {
    return "(DATABASE_URL not set or unreadable)";
  }
}

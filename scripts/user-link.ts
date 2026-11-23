/**
 * Print a one-time set-password link for an existing account — the way back in
 * when an owner is locked out, since Homestead sends no email itself.
 * Run: npm run user:link -- person@example.com
 */
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { qOne } from "../src/lib/db.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { mintPasswordLink, printLink, describeDatabase } from "./lib.ts";

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run user:link -- person@example.com");
  console.log(`Database: ${describeDatabase()}`);
  const user = await qOne<{ id: number; name: string; email: string; status: string }>(
    "SELECT id, name, email, status FROM users WHERE lower(email) = $1",
    [email]
  );
  if (!user) throw new Error(`No account with the email ${email}`);
  if (user.status === "disabled") throw new Error(`${user.name}'s account is disabled — restore access first.`);
  printLink(user.name, user.email, await mintPasswordLink(user.id));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

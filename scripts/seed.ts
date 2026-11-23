/**
 * First-run setup. Safe to run any number of times — it never deletes anything.
 * Run: npm run db:seed          (uses DATABASE_URL from .env.local)
 *
 *  - creates the owner account if no users exist
 *      (override with OWNER_NAME / OWNER_EMAIL);
 *  - creates one starter property if none exist;
 *  - prints a one-time link for the owner to set a password, if they have none.
 *
 * For made-up sample data to explore the app, see `npm run db:seed:demo`.
 */
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { qOne, run } from "../src/lib/db.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { mintPasswordLink, printLink, describeDatabase } from "./lib.ts";

async function main() {
  console.log(`Database: ${describeDatabase()}`);
  const name = process.env.OWNER_NAME ?? "Jason Williams";
  const email = (process.env.OWNER_EMAIL ?? "jaywillcreate@gmail.com").toLowerCase();

  let owner = await qOne<{ id: number; name: string; email: string; has_password: boolean }>(
    `SELECT id, name, email, (password_hash IS NOT NULL) AS has_password
     FROM users WHERE role = 'owner' AND status != 'disabled' ORDER BY id LIMIT 1`
  );
  if (!owner) {
    const anyUser = await qOne("SELECT id FROM users LIMIT 1");
    if (anyUser) throw new Error("Users exist but none is an enabled owner — fix that in the database first.");
    const id = (await run(
      "INSERT INTO users (name, email, role, status) VALUES ($1, $2, 'owner', 'invited') RETURNING id",
      [name, email]
    ))!;
    owner = { id, name, email, has_password: false };
    console.log(`Created owner account: ${name} <${email}>`);
  }

  const property = await qOne<{ id: number }>("SELECT id FROM properties ORDER BY id LIMIT 1");
  if (!property) {
    const pid = (await run(
      "INSERT INTO properties (label, owner_id) VALUES ('Primary residence', $1) RETURNING id",
      [owner.id]
    ))!;
    await run(
      "INSERT INTO user_properties (user_id, property_id) SELECT id, $1 FROM users ON CONFLICT DO NOTHING",
      [pid]
    );
    console.log("Created a starter property: Primary residence");
  }

  if (!owner.has_password) {
    printLink(owner.name, owner.email, await mintPasswordLink(owner.id));
  } else {
    console.log("Owner already has a password — nothing else to do.");
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

/**
 * Remove the demo data and every person except one owner.
 *
 *   npm run db:cleanup                  → dry run: shows what would be removed
 *   npm run db:cleanup -- --yes         → actually removes it (cannot be undone)
 *   npm run db:cleanup -- --yes --keep you@example.com
 *
 * Removes: all contractors and their documents, jobs, invoices, job photos,
 * the schedule and recurring tasks, bid requests and bids, material estimates,
 * notifications, the activity log, and every user except the one kept.
 * Keeps:   that user (default jaywillcreate@gmail.com), properties with their
 * photos / inventory / documents, and app branding.
 * Uploaded files for the removed records are deleted from storage too.
 */
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { q, qOne, run } from "../src/lib/db.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { deleteUpload } from "../src/lib/storage.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { mintPasswordLink, printLink, describeDatabase } from "./lib.ts";

// Children before parents, so foreign keys never block a delete.
const TABLES = [
  "activity_log", "notifications", "login_attempts", "material_estimates", "bids", "bid_requests",
  "scheduled_events", "maintenance_tasks", "job_photos", "invoice_line_items", "invoices", "jobs",
  "contractor_documents", "contractors",
];

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes("--yes");
  const keepIdx = args.indexOf("--keep");
  const keepEmail = (keepIdx >= 0 ? args[keepIdx + 1] ?? "" : "jaywillcreate@gmail.com").trim().toLowerCase();

  console.log(`Database: ${describeDatabase()}`);
  const keep = await qOne<{ id: number; name: string; email: string; has_password: boolean }>(
    "SELECT id, name, email, (password_hash IS NOT NULL) AS has_password FROM users WHERE lower(email) = $1",
    [keepEmail]
  );
  if (!keep) throw new Error(`No account with the email ${keepEmail} — nothing was changed. Use --keep <email>.`);

  const others = await q<{ name: string; email: string }>(
    "SELECT name, email FROM users WHERE id != $1 ORDER BY id",
    [keep.id]
  );
  console.log(`\nKeeping:  ${keep.name} <${keep.email}> (set as owner)`);
  console.log(`Removing ${others.length} other user(s)${others.length ? ": " + others.map((u) => u.name).join(", ") : ""}`);
  for (const t of TABLES) {
    const n = (await qOne<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t}`))!.n;
    if (n) console.log(`Removing ${String(n).padStart(5)} row(s) from ${t}`);
  }

  if (!confirmed) {
    console.log("\nDry run — nothing was changed. Re-run with `-- --yes` to remove all of the above.");
    return;
  }

  // Collect stored files before their rows disappear.
  const files = [
    ...(await q<{ f: string | null }>("SELECT stored_path AS f FROM job_photos")),
    ...(await q<{ f: string | null }>("SELECT source_file AS f FROM invoices")),
    ...(await q<{ f: string | null }>("SELECT stored_path AS f FROM contractor_documents")),
  ].map((r) => r.f).filter((f): f is string => Boolean(f));

  for (const t of TABLES) await q(`DELETE FROM ${t}`);

  // People: everything that points at a user is re-pointed at the keeper, then the rest go.
  await run("UPDATE users SET role = 'owner' WHERE id = $1", [keep.id]);
  await run("UPDATE users SET status = 'active' WHERE id = $1 AND status = 'disabled'", [keep.id]);
  await run("UPDATE properties SET owner_id = $1 WHERE owner_id IS DISTINCT FROM $1", [keep.id]);
  await run("UPDATE property_photos SET uploaded_by = $1 WHERE uploaded_by IS NOT NULL AND uploaded_by != $1", [keep.id]);
  await run("UPDATE property_documents SET uploaded_by = $1 WHERE uploaded_by IS NOT NULL AND uploaded_by != $1", [keep.id]);
  await run("DELETE FROM users WHERE id != $1", [keep.id]);
  await run(
    "INSERT INTO user_properties (user_id, property_id) SELECT $1, id FROM properties ON CONFLICT DO NOTHING",
    [keep.id]
  );

  for (const f of files) await deleteUpload(f);
  console.log(`\nDone. Removed ${others.length} user(s), the demo records, and ${files.length} stored file(s).`);

  if (!keep.has_password) printLink(keep.name, keep.email, await mintPasswordLink(keep.id));
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

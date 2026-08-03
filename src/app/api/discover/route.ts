import { z } from "zod";
import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { discoverLocalPros } from "@/lib/discovery";

/** GET ?q=... — search nearby pros (Google Places when configured, sample otherwise). */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (!q.trim()) return Response.json({ pros: [], source: "none" });
    const db = getDb();
    const property = db.prepare("SELECT address FROM properties LIMIT 1").get() as
      | { address: string | null } | undefined;
    const result = await discoverLocalPros(q.trim(), property?.address ?? "San Antonio, TX");
    return Response.json(result);
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

const requestSchema = z.object({
  title: z.string().min(1).max(200),
  scope: z.string().max(4000).optional(),
  invite: z
    .array(z.object({ vendor_name: z.string(), rating: z.number().nullable(), review_count: z.number().nullable(), review_excerpt: z.string().nullable(), meta: z.string().nullable() }))
    .max(10)
    .default([]),
});

/** POST → open a new bid request and invite pros. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_bids");
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const { title, scope, invite } = parsed.data;
    const db = getDb();
    const reqId = db
      .prepare(
        `INSERT INTO bid_requests (property_id, title, scope, posted_at, closes_at, status)
         VALUES ((SELECT id FROM properties LIMIT 1), ?, ?, date('now'), date('now', '+7 days'), 'open')`
      )
      .run(title, scope ?? null).lastInsertRowid as number;
    const ins = db.prepare(
      `INSERT INTO bids (bid_request_id, vendor_name, meta, rating, review_count, review_excerpt, badge, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Awaiting bid', 'awaiting')`
    );
    for (const p of invite) ins.run(reqId, p.vendor_name, p.meta, p.rating, p.review_count, p.review_excerpt);
    logActivity("bid", `Bid request opened: ${title}`);
    return Response.json({ id: reqId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

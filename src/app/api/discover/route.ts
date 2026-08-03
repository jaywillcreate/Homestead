import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { discoverLocalPros } from "@/lib/discovery";

/** GET ?q=...&zip=78230 — search nearby pros, geolocated to a US ZIP when given. */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const params = new URL(req.url).searchParams;
    const q = params.get("q") ?? "";
    const zip = (params.get("zip") ?? "").trim();
    if (!q.trim()) return Response.json({ pros: [], source: "none", location: null });
    if (zip && !/^\d{5}$/.test(zip)) {
      return Response.json({ error: "ZIP code must be 5 digits" }, { status: 400 });
    }
    const property = await qOne<{ address: string | null }>(
      "SELECT address FROM properties LIMIT 1"
    );
    const result = await discoverLocalPros(
      q.trim(),
      property?.address ?? "San Antonio, TX",
      zip || undefined
    );
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
    const reqId = await run(
      `INSERT INTO bid_requests (property_id, title, scope, posted_at, closes_at, status)
       VALUES ((SELECT id FROM properties LIMIT 1), $1, $2,
         to_char(now() at time zone 'utc','YYYY-MM-DD'),
         to_char(now() at time zone 'utc' + interval '7 days','YYYY-MM-DD'), 'open') RETURNING id`,
      [title, scope ?? null]
    );
    for (const p of invite) {
      await run(
        `INSERT INTO bids (bid_request_id, vendor_name, meta, rating, review_count, review_excerpt, badge, status)
         VALUES ($1,$2,$3,$4,$5,$6,'Awaiting bid','awaiting') RETURNING id`,
        [reqId, p.vendor_name, p.meta, p.rating, p.review_count, p.review_excerpt]
      );
    }
    await logActivity("bid", `Bid request opened: ${title}`);
    return Response.json({ id: reqId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

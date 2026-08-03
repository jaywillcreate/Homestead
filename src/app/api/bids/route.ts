import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const createSchema = z.object({
  bid_request_id: z.number().int().optional(),
  /** Used to open a fresh request when none is open. */
  title: z.string().trim().min(1).max(200).optional(),
  vendor_name: z.string().trim().min(1).max(200),
  meta: z.string().max(200).nullable().optional(),
  rating: z.number().nullable().optional(),
  review_count: z.number().int().nullable().optional(),
  review_excerpt: z.string().max(300).nullable().optional(),
});

/** POST → invite a discovered local pro to bid (adds it to the bids section). */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_bids");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // Resolve the target request: explicit id → latest open → create from title.
    let request = d.bid_request_id
      ? await qOne<{ id: number; title: string; status: string }>(
          "SELECT id, title, status FROM bid_requests WHERE id = $1",
          [d.bid_request_id]
        )
      : await qOne<{ id: number; title: string; status: string }>(
          "SELECT id, title, status FROM bid_requests WHERE status = 'open' ORDER BY posted_at DESC, id DESC LIMIT 1"
        );
    if (!request) {
      if (!d.title) {
        return Response.json(
          { error: "No open bid request — provide a job title to start one", needs_title: true },
          { status: 400 }
        );
      }
      const id = await run(
        `INSERT INTO bid_requests (property_id, title, posted_at, closes_at, status)
         VALUES ((SELECT id FROM properties LIMIT 1), $1,
           to_char(now() at time zone 'utc','YYYY-MM-DD'),
           to_char(now() at time zone 'utc' + interval '7 days','YYYY-MM-DD'), 'open') RETURNING id`,
        [d.title]
      );
      request = { id: id!, title: d.title, status: "open" };
      await logActivity("bid", `Bid request opened: ${d.title}`);
    }

    const dupe = await qOne(
      "SELECT id FROM bids WHERE bid_request_id = $1 AND lower(vendor_name) = lower($2)",
      [request.id, d.vendor_name]
    );
    if (dupe) {
      return Response.json({ error: `${d.vendor_name} is already in this request` }, { status: 409 });
    }

    const bidId = await run(
      `INSERT INTO bids (bid_request_id, vendor_name, meta, rating, review_count, review_excerpt, badge, status)
       VALUES ($1,$2,$3,$4,$5,$6,'Awaiting bid','awaiting') RETURNING id`,
      [request.id, d.vendor_name, d.meta ?? null, d.rating ?? null, d.review_count ?? null, d.review_excerpt ?? null]
    );
    await logActivity("bid", `${d.vendor_name} invited to bid on "${request.title}"`);
    return Response.json({ id: bidId, bid_request_id: request.id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

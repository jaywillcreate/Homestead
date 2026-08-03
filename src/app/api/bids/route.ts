import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const createSchema = z.object({
  bid_request_id: z.number().int().optional(),
  /** Used to open a fresh request when none is open. */
  title: z.string().trim().min(1).max(200).optional(),
  /** Attach a contractor from the book directly; vendor_name then optional. */
  contractor_id: z.number().int().optional(),
  vendor_name: z.string().trim().min(1).max(200).optional(),
  meta: z.string().max(200).nullable().optional(),
  price: z.coerce.number().min(0).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rating: z.number().nullable().optional(),
  review_count: z.number().int().nullable().optional(),
  review_excerpt: z.string().max(300).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  favorable: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
});

/** POST → add a bid: invite a discovered pro, or enter one manually. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_bids");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    // A contractor from the book supplies its own identity.
    let bookContractor: { id: number; business_name: string; trade: string; rating: number | null } | null = null;
    if (d.contractor_id) {
      bookContractor = await qOne(
        "SELECT id, business_name, trade, rating FROM contractors WHERE id = $1 AND status != 'archived'",
        [d.contractor_id]
      );
      if (!bookContractor) return Response.json({ error: "Contractor not found" }, { status: 404 });
    }
    const vendorName = bookContractor?.business_name ?? d.vendor_name;
    if (!vendorName) {
      return Response.json({ error: "Provide a vendor name or a contractor" }, { status: 400 });
    }

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
      [request.id, vendorName]
    );
    if (dupe) {
      return Response.json({ error: `${vendorName} is already in this request` }, { status: 409 });
    }

    // A known contractor entered by name links to the book automatically.
    const known =
      bookContractor ??
      (await qOne<{ id: number; trade: string; rating: number | null }>(
        "SELECT id, trade, rating FROM contractors WHERE lower(business_name) = lower($1) AND status != 'archived'",
        [vendorName]
      ));

    const hasPrice = d.price != null;
    const bidId = await run(
      `INSERT INTO bids (bid_request_id, contractor_id, vendor_name, meta, price, start_date,
         rating, review_count, review_excerpt, badge, status, notes, favorable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [
        request.id, known?.id ?? null, vendorName,
        d.meta ?? (known ? `Known contractor · ${known.trade}` : "Added manually"),
        d.price ?? null, d.start_date ?? null,
        d.rating ?? known?.rating ?? null, d.review_count ?? null, d.review_excerpt ?? null,
        known ? "In your book" : hasPrice ? null : "Awaiting bid",
        hasPrice ? "received" : "awaiting",
        d.notes ?? null, d.favorable ?? null,
      ]
    );
    await logActivity("bid", `${vendorName} added to bids on "${request.title}"`);
    return Response.json({ id: bidId, bid_request_id: request.id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

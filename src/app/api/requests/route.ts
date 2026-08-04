import { z } from "zod";
import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { TRADES } from "@/lib/types";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  scope: z.string().max(4000).nullable().optional(),
  category: z.enum(TRADES).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).nullable().optional(),
  budget: z.coerce.number().min(0).nullable().optional(),
  closes_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  property_id: z.number().int().nullable().optional(),
});

/** POST → open a new bid request. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_bids");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const id = await run(
      `INSERT INTO bid_requests (property_id, title, scope, category, priority, budget, posted_at, closes_at, status)
       VALUES (COALESCE($7, (SELECT id FROM properties LIMIT 1)), $1, $2, $3, $4, $5,
         to_char(now() at time zone 'utc','YYYY-MM-DD'),
         COALESCE($6, to_char(now() at time zone 'utc' + interval '7 days','YYYY-MM-DD')), 'open') RETURNING id`,
      [d.title, d.scope ?? null, d.category ?? null, d.priority ?? "normal", d.budget ?? null, d.closes_at ?? null, d.property_id ?? null]
    );
    await logActivity("bid", `Bid request opened: ${d.title}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

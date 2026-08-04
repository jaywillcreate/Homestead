import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { listMaterialEstimates } from "@/lib/queries";

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  spec: z.string().max(200),
  unit_price: z.coerce.number().min(0),
  quantity: z.coerce.number().min(0),
  note: z.string().max(200).nullable().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  query: z.string().max(300).nullable().optional(),
  items: z.array(itemSchema).min(1).max(40),
  source: z.string().max(40).nullable().optional(),
  bid_request_id: z.number().int().nullable().optional(),
  bid_id: z.number().int().nullable().optional(),
});

export async function GET() {
  try {
    await requirePermission("view_records");
    return Response.json(await listMaterialEstimates());
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/** POST → save an estimate, optionally attached to a request and/or bid. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_bids");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    if (d.bid_request_id) {
      const reqRow = await qOne("SELECT id FROM bid_requests WHERE id = $1", [d.bid_request_id]);
      if (!reqRow) return Response.json({ error: "Request not found" }, { status: 404 });
    }
    if (d.bid_id) {
      const bidRow = await qOne<{ bid_request_id: number }>(
        "SELECT bid_request_id FROM bids WHERE id = $1",
        [d.bid_id]
      );
      if (!bidRow) return Response.json({ error: "Bid not found" }, { status: 404 });
      if (d.bid_request_id && bidRow.bid_request_id !== d.bid_request_id) {
        return Response.json({ error: "That bid belongs to a different request" }, { status: 400 });
      }
    }
    const total = d.items.reduce((a, i) => a + i.unit_price * i.quantity, 0);
    const id = await run(
      `INSERT INTO material_estimates (bid_request_id, bid_id, title, query, items, total, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        d.bid_request_id ?? null, d.bid_id ?? null, d.title, d.query ?? null,
        JSON.stringify(d.items), Math.round(total * 100) / 100, d.source ?? null,
      ]
    );
    await logActivity("bid", `Materials estimate saved: ${d.title}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  action: z.enum(["accept", "decline"]).optional(),
  price: z.coerce.number().min(0).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  favorable: z.union([z.literal(0), z.literal(1)]).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const bid = await qOne<{ id: number; bid_request_id: number; vendor_name: string; status: string }>(
      "SELECT id, bid_request_id, vendor_name, status FROM bids WHERE id = $1",
      [Number(id)]
    );
    if (!bid) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const d = parsed.data;

    // Field edits (notes, favorability, manual price/date corrections).
    const fields: Record<string, unknown> = {};
    for (const key of ["price", "start_date", "notes", "favorable"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      // A bid that gains a price is no longer just awaiting.
      if (fields.price != null && bid.status === "awaiting") fields.status = "received";
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE bids SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        bid.id,
      ]);
    }

    if (d.action === "accept") {
      await run("UPDATE bids SET status = 'accepted' WHERE id = $1", [bid.id]);
      await run(
        "UPDATE bids SET status = 'declined' WHERE bid_request_id = $1 AND id != $2 AND status != 'accepted'",
        [bid.bid_request_id, bid.id]
      );
      await run("UPDATE bid_requests SET status = 'accepted' WHERE id = $1", [bid.bid_request_id]);
      await logActivity("bid", `Accepted ${bid.vendor_name}'s bid`);
    } else if (d.action === "decline") {
      await run("UPDATE bids SET status = 'declined' WHERE id = $1", [bid.id]);
    }
    return Response.json(await qOne("SELECT * FROM bids WHERE id = $1", [bid.id]));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const bid = await qOne<{ id: number; vendor_name: string }>(
      "SELECT id, vendor_name FROM bids WHERE id = $1",
      [Number(id)]
    );
    if (!bid) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM bids WHERE id = $1", [bid.id]);
    await logActivity("bid", `${bid.vendor_name} removed from bids`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

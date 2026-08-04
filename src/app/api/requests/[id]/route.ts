import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { TRADES } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  scope: z.string().max(4000).nullable().optional(),
  category: z.enum(TRADES).nullable().optional(),
  priority: z.enum(["low", "normal", "high"]).nullable().optional(),
  budget: z.coerce.number().min(0).nullable().optional(),
  closes_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  property_id: z.number().int().nullable().optional(),
  /** 'accepted' is set only through accepting a bid, never directly. */
  status: z.enum(["open", "closed"]).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const existing = await qOne<{ id: number; title: string; status: string }>(
      "SELECT id, title, status FROM bid_requests WHERE id = $1",
      [Number(id)]
    );
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    if (d.status && existing.status === "accepted") {
      return Response.json({ error: "An accepted request's status can't be changed" }, { status: 400 });
    }
    const fields: Record<string, unknown> = {};
    for (const key of ["title", "scope", "category", "priority", "budget", "closes_at", "property_id", "status"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE bid_requests SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
      await logActivity("bid", `Bid request updated: ${d.title ?? existing.title}`);
    }
    return Response.json(await qOne("SELECT * FROM bid_requests WHERE id = $1", [Number(id)]));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const existing = await qOne<{ id: number; title: string }>(
      "SELECT id, title FROM bid_requests WHERE id = $1",
      [Number(id)]
    );
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    // Bids cascade with the request (FK ON DELETE CASCADE).
    await run("DELETE FROM bid_requests WHERE id = $1", [Number(id)]);
    await logActivity("bid", `Bid request deleted: ${existing.title}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

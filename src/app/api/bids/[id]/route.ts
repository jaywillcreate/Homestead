import { z } from "zod";
import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const db = getDb();
    const bid = db.prepare("SELECT * FROM bids WHERE id = ?").get(Number(id)) as
      | { id: number; bid_request_id: number; vendor_name: string } | undefined;
    if (!bid) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });

    if (parsed.data.action === "accept") {
      db.prepare("UPDATE bids SET status = 'accepted' WHERE id = ?").run(bid.id);
      db.prepare(
        "UPDATE bids SET status = 'declined' WHERE bid_request_id = ? AND id != ? AND status != 'accepted'"
      ).run(bid.bid_request_id, bid.id);
      db.prepare("UPDATE bid_requests SET status = 'accepted' WHERE id = ?").run(bid.bid_request_id);
      logActivity("bid", `Accepted ${bid.vendor_name}'s bid`);
    } else {
      db.prepare("UPDATE bids SET status = 'declined' WHERE id = ?").run(bid.id);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

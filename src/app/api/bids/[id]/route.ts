import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const bid = await qOne<{ id: number; bid_request_id: number; vendor_name: string }>(
      "SELECT id, bid_request_id, vendor_name FROM bids WHERE id = $1",
      [Number(id)]
    );
    if (!bid) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });

    if (parsed.data.action === "accept") {
      await run("UPDATE bids SET status = 'accepted' WHERE id = $1", [bid.id]);
      await run(
        "UPDATE bids SET status = 'declined' WHERE bid_request_id = $1 AND id != $2 AND status != 'accepted'",
        [bid.bid_request_id, bid.id]
      );
      await run("UPDATE bid_requests SET status = 'accepted' WHERE id = $1", [bid.bid_request_id]);
      await logActivity("bid", `Accepted ${bid.vendor_name}'s bid`);
    } else {
      await run("UPDATE bids SET status = 'declined' WHERE id = $1", [bid.id]);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

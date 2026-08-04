import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_bids");
    const { id } = await params;
    const existing = await qOne("SELECT id FROM material_estimates WHERE id = $1", [Number(id)]);
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM material_estimates WHERE id = $1", [Number(id)]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

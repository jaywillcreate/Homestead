import { z } from "zod";
import { getDb } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ role: z.enum(["owner", "manager", "viewer"]) });

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requirePermission("manage_users");
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const db = getDb();
    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(id)) as
      | { id: number; role: string } | undefined;
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });
    // Never demote the last owner — the household would lock itself out.
    if (target.role === "owner" && parsed.data.role !== "owner") {
      const owners = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").get() as { n: number }).n;
      if (owners <= 1) return Response.json({ error: "Cannot demote the last owner" }, { status: 400 });
    }
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(parsed.data.role, Number(id));
    return Response.json({ ok: true, self: actor.id === Number(id) });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { z } from "zod";
import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({ role: z.enum(["owner", "manager", "viewer"]) });

export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requirePermission("manage_users");
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const target = await qOne<{ id: number; role: string }>(
      "SELECT id, role FROM users WHERE id = $1",
      [Number(id)]
    );
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });
    // Never demote the last owner — the household would lock itself out.
    if (target.role === "owner" && parsed.data.role !== "owner") {
      const owners = (await qOne<{ n: number }>(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner'"
      ))!.n;
      if (owners <= 1) return Response.json({ error: "Cannot demote the last owner" }, { status: 400 });
    }
    await run("UPDATE users SET role = $1 WHERE id = $2", [parsed.data.role, Number(id)]);
    return Response.json({ ok: true, self: actor.id === Number(id) });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

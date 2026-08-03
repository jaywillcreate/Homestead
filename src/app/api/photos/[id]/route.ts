import { z } from "zod";
import { getDb } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  caption: z.string().max(300).nullable().optional(),
  stage: z.enum(["before", "during", "after", "record"]).optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const db = getDb();
    if (parsed.data.caption !== undefined)
      db.prepare("UPDATE job_photos SET caption = ? WHERE id = ?").run(parsed.data.caption, Number(id));
    if (parsed.data.stage)
      db.prepare("UPDATE job_photos SET stage = ? WHERE id = ?").run(parsed.data.stage, Number(id));
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    getDb().prepare("DELETE FROM job_photos WHERE id = ?").run(Number(id));
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

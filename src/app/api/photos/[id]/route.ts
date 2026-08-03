import { z } from "zod";
import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";

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
    if (parsed.data.caption !== undefined)
      await run("UPDATE job_photos SET caption = $1 WHERE id = $2", [parsed.data.caption, Number(id)]);
    if (parsed.data.stage)
      await run("UPDATE job_photos SET stage = $1 WHERE id = $2", [parsed.data.stage, Number(id)]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const photo = await qOne<{ stored_path: string }>(
      "SELECT stored_path FROM job_photos WHERE id = $1",
      [Number(id)]
    );
    await run("DELETE FROM job_photos WHERE id = $1", [Number(id)]);
    await deleteUpload(photo?.stored_path);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

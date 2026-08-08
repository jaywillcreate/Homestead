import { z } from "zod";
import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  caption: z.string().max(300).nullable().optional(),
  stage: z.enum(["before", "during", "after", "record"]).optional(),
  /** Move the photo to another section (job). */
  job_id: z.number().int().optional(),
  sort_order: z.number().int().nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const photo = await qOne<{ id: number }>("SELECT id FROM job_photos WHERE id = $1", [Number(id)]);
    if (!photo) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const d = parsed.data;
    if (d.job_id !== undefined) {
      const job = await qOne("SELECT id FROM jobs WHERE id = $1", [d.job_id]);
      if (!job) return Response.json({ error: "Target section not found" }, { status: 404 });
    }
    const fields: Record<string, unknown> = {};
    for (const key of ["caption", "stage", "job_id", "sort_order"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE job_photos SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
    }
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

import { z } from "zod";
import { run, q, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  contractor_id: z.number().int().nullable().optional(),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const job = await qOne<{ id: number }>("SELECT id FROM jobs WHERE id = $1", [Number(id)]);
    if (!job) return Response.json({ error: "Section not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const d = parsed.data;
    const fields: Record<string, unknown> = {};
    for (const key of ["title", "contractor_id", "performed_on", "location"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE jobs SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/** Delete a section and every photo in it. Blocked when an invoice is attached. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const job = await qOne<{ id: number; title: string }>(
      "SELECT id, title FROM jobs WHERE id = $1",
      [Number(id)]
    );
    if (!job) return Response.json({ error: "Section not found" }, { status: 404 });
    const invoice = await qOne("SELECT id FROM invoices WHERE job_id = $1", [Number(id)]);
    if (invoice) {
      return Response.json(
        { error: `"${job.title}" has an invoice attached — its photos can be removed individually, but the section stays` },
        { status: 409 }
      );
    }
    const photos = await q<{ stored_path: string }>(
      "SELECT stored_path FROM job_photos WHERE job_id = $1",
      [Number(id)]
    );
    await run("DELETE FROM jobs WHERE id = $1", [Number(id)]); // photos cascade
    for (const p of photos) await deleteUpload(p.stored_path);
    await logActivity("photo", `Photo section deleted: ${job.title} (${photos.length} photo${photos.length === 1 ? "" : "s"})`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

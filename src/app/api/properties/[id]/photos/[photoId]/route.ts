import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";

type Params = { params: Promise<{ id: string; photoId: string }> };

const patchSchema = z.object({ caption: z.string().max(200).nullable() });

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id, photoId } = await params;
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const photo = await qOne<{ id: number }>(
      "SELECT id FROM property_photos WHERE id = $1 AND property_id = $2",
      [Number(photoId), Number(id)]
    );
    if (!photo) return Response.json({ error: "Not found" }, { status: 404 });
    await run("UPDATE property_photos SET caption = $1 WHERE id = $2", [
      parsed.data.caption?.trim() || null,
      photo.id,
    ]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id, photoId } = await params;
    const photo = await qOne<{ id: number; stored_path: string }>(
      "SELECT id, stored_path FROM property_photos WHERE id = $1 AND property_id = $2",
      [Number(photoId), Number(id)]
    );
    if (!photo) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM property_photos WHERE id = $1", [photo.id]);
    await deleteUpload(photo.stored_path);
    await logActivity("property", "Property photo removed");
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Delete failed" }, { status: 500 });
  }
}

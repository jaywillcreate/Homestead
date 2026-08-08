import crypto from "crypto";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { saveUpload, deleteUpload } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
const MAX_BYTES = 20 * 1024 * 1024;

/** POST multipart { file } → replace a photo's image, keeping its metadata. */
export async function POST(req: Request, { params }: Params) {
  try {
    await requirePermission("upload_photos");
    const { id } = await params;
    const photo = await qOne<{ id: number; stored_path: string }>(
      "SELECT id, stored_path FROM job_photos WHERE id = $1",
      [Number(id)]
    );
    if (!photo) return Response.json({ error: "Not found" }, { status: 404 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (20 MB max)" }, { status: 413 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: "Unsupported image type" }, { status: 415 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
    const stored = await saveUpload(
      Buffer.from(await file.arrayBuffer()),
      `photos/${crypto.randomBytes(6).toString("hex")}-${safeName}`,
      file.type
    );
    await run(
      "UPDATE job_photos SET stored_path = $1, original_name = $2 WHERE id = $3",
      [stored, file.name, photo.id]
    );
    await deleteUpload(photo.stored_path);
    await logActivity("photo", "Photo image replaced");
    return Response.json({ stored_path: stored });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Replace failed" }, { status: 500 });
  }
}

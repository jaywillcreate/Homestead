import crypto from "crypto";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
const MAX_BYTES = 20 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/** POST multipart { file, caption? } → adds a property photo. */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requirePermission("upload_photos");
    const { id } = await params;
    const property = await qOne<{ id: number; label: string }>(
      "SELECT id, label FROM properties WHERE id = $1",
      [Number(id)]
    );
    if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    const caption = String(form.get("caption") ?? "");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (20 MB max)" }, { status: 413 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: "Unsupported image type" }, { status: 415 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
    const stored = await saveUpload(
      Buffer.from(await file.arrayBuffer()),
      `property-photos/${crypto.randomBytes(6).toString("hex")}-${safeName}`,
      file.type
    );

    const photoId = await run(
      `INSERT INTO property_photos (property_id, stored_path, original_name, caption, uploaded_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [property.id, stored, file.name, caption || null, user.id]
    );
    await logActivity("property", `Photo added to ${property.label}`);
    return Response.json({ id: photoId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

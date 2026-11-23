import crypto from "crypto";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { documentMetaSchema } from "@/lib/property-schema";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
const MAX_BYTES = 25 * 1024 * 1024;

type Params = { params: Promise<{ id: string }> };

/** POST multipart { file, kind?, title?, expires_on? } → file a document in the property's vault. */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await requirePermission("edit_property_records");
    const { id } = await params;
    const property = await qOne<{ id: number; label: string }>(
      "SELECT id, label FROM properties WHERE id = $1",
      [Number(id) || 0]
    );
    if (!property) return Response.json({ error: "Property not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (25 MB max)" }, { status: 413 });
    if (!ALLOWED.has(file.type)) {
      return Response.json({ error: "Use a PDF or an image (JPG, PNG, WebP, HEIC, GIF)" }, { status: 415 });
    }
    const meta = documentMetaSchema.safeParse({
      title: form.get("title") ? String(form.get("title")) : null,
      kind: form.get("kind") ? String(form.get("kind")) : undefined,
      expires_on: form.get("expires_on") ? String(form.get("expires_on")) : null,
    });
    if (!meta.success) return Response.json({ error: "Check the document type and date" }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
    const stored = await saveUpload(
      Buffer.from(await file.arrayBuffer()),
      `property-docs/${crypto.randomBytes(6).toString("hex")}-${safeName}`,
      file.type
    );
    const docId = await run(
      `INSERT INTO property_documents (property_id, filename, title, size, kind, stored_path, expires_on, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [property.id, file.name, meta.data.title || null, file.size, meta.data.kind ?? "other", stored,
       meta.data.expires_on ?? null, user.id]
    );
    await logActivity("property", `Document filed for ${property.label}: ${meta.data.title || file.name}`);
    return Response.json({ id: docId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

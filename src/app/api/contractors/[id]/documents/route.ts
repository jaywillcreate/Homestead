import crypto from "crypto";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";

const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
]);
const MAX_BYTES = 25 * 1024 * 1024;
const KINDS = new Set(["insurance", "license", "warranty", "other"]);

type Params = { params: Promise<{ id: string }> };

/** POST multipart { file, kind? } → stores a contractor document (image or PDF). */
export async function POST(req: Request, { params }: Params) {
  try {
    await requirePermission("edit_contractors");
    const { id } = await params;
    const contractor = await qOne<{ id: number; business_name: string }>(
      "SELECT id, business_name FROM contractors WHERE id = $1",
      [Number(id)]
    );
    if (!contractor) return Response.json({ error: "Contractor not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "other");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (25 MB max)" }, { status: 413 });
    if (!ALLOWED.has(file.type)) {
      return Response.json({ error: "Use an image (JPG, PNG, WebP, HEIC, GIF) or a PDF" }, { status: 415 });
    }
    if (!KINDS.has(kind)) return Response.json({ error: "Invalid document kind" }, { status: 400 });

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "document";
    const storedName = `${crypto.randomBytes(6).toString("hex")}-${safeName}`;
    const stored = await saveUpload(
      Buffer.from(await file.arrayBuffer()),
      `contractor-docs/${storedName}`,
      file.type
    );

    const docId = await run(
      `INSERT INTO contractor_documents (contractor_id, filename, size, kind, stored_path)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [contractor.id, file.name, file.size, kind, stored]
    );
    await logActivity("contractor", `Document added to ${contractor.business_name}`);
    return Response.json({ id: docId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

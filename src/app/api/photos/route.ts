import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getDb, logActivity, UPLOADS_DIR } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic"]);
const MAX_BYTES = 20 * 1024 * 1024;

/** POST multipart { file, job_id, caption?, stage? } → stores a job photo. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission("upload_photos");
    const form = await req.formData();
    const file = form.get("file");
    const jobId = Number(form.get("job_id"));
    const caption = String(form.get("caption") ?? "");
    const stage = String(form.get("stage") ?? "record");
    if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
    if (!jobId) return Response.json({ error: "job_id required" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "File too large (20 MB max)" }, { status: 413 });
    if (!ALLOWED.has(file.type)) return Response.json({ error: "Unsupported image type" }, { status: 415 });
    if (!["before", "during", "after", "record"].includes(stage)) {
      return Response.json({ error: "Invalid stage" }, { status: 400 });
    }
    const db = getDb();
    const job = db.prepare("SELECT id, title FROM jobs WHERE id = ?").get(jobId) as { id: number; title: string } | undefined;
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });

    const dir = path.join(UPLOADS_DIR, "photos");
    fs.mkdirSync(dir, { recursive: true });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "photo";
    const storedName = `${crypto.randomBytes(6).toString("hex")}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));

    const id = db
      .prepare(
        `INSERT INTO job_photos (job_id, stored_path, original_name, caption, stage, taken_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, date('now'), ?)`
      )
      .run(jobId, `photos/${storedName}`, file.name, caption || null, stage, user.id).lastInsertRowid;
    logActivity("photo", `Photo added to ${job.title}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

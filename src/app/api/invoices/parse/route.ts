import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getDb, logActivity, UPLOADS_DIR } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { parseInvoiceFile } from "@/lib/invoice-parser";
import { getInvoice } from "@/lib/queries";

export const maxDuration = 120;

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart/form-data { file } →
 * stores the scan, runs extraction, creates a DRAFT invoice + line items,
 * and returns the draft for the user to confirm.
 */
export async function POST(req: Request) {
  try {
    const user = await requirePermission("upload_invoices");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: "File too large (25 MB max)" }, { status: 413 });
    }
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED.has(mime)) {
      return Response.json({ error: `Unsupported file type ${mime}. Use PDF, JPG, HEIC or WebP.` }, { status: 415 });
    }

    let buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "invoice";
    const dir = path.join(UPLOADS_DIR, "invoices");
    fs.mkdirSync(dir, { recursive: true });
    let storedName = `${crypto.randomBytes(6).toString("hex")}-${safeName}`;
    let effectiveMime = mime;

    // HEIC isn't accepted by the vision API — convert with macOS sips when available.
    if (mime === "image/heic") {
      const heicPath = path.join(dir, storedName);
      fs.writeFileSync(heicPath, buffer);
      const jpegPath = heicPath.replace(/\.[^.]*$/, "") + ".jpg";
      try {
        const { execFileSync } = await import("child_process");
        execFileSync("sips", ["-s", "format", "jpeg", heicPath, "--out", jpegPath], { stdio: "ignore" });
        buffer = fs.readFileSync(jpegPath);
        effectiveMime = "image/jpeg";
        storedName = path.basename(jpegPath);
        fs.unlinkSync(heicPath);
      } catch {
        effectiveMime = "image/heic"; // parse will fall back to manual entry
      }
    } else {
      fs.writeFileSync(path.join(dir, storedName), buffer);
    }

    const storedPath = `invoices/${storedName}`;
    const result =
      effectiveMime === "image/heic"
        ? { extraction: null, matched_contractor_id: null, error: "HEIC could not be converted — enter fields manually." }
        : await parseInvoiceFile(buffer, effectiveMime);

    const db = getDb();
    const e = result.extraction;
    const invId = db
      .prepare(
        `INSERT INTO invoices (contractor_id, vendor, invoice_number, invoice_date, due_date, total,
           category, warranty_months, payment_status, source_file, source_filename, parse_confidence,
           parsed_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, datetime('now'), 'draft')`
      )
      .run(
        result.matched_contractor_id, e?.vendor ?? null, e?.invoice_number ?? null,
        e?.invoice_date ?? null, e?.due_date ?? null, e?.total ?? 0, e?.category ?? null,
        e?.warranty_months ?? null, storedPath, file.name, e?.confidence ?? null
      ).lastInsertRowid as number;

    if (e) {
      const insertLine = db.prepare(
        "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)"
      );
      for (const li of e.line_items) insertLine.run(invId, li.description, li.type, li.amount);
      logActivity(
        "invoice",
        `Invoice ${e.invoice_number ?? file.name} parsed${result.matched_contractor_id ? " and matched to " + e.vendor : ""} by ${user.name}`
      );
    }

    return Response.json({ invoice: getInvoice(invId), parse_error: result.error }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

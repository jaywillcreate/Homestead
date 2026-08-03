import crypto from "crypto";
import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { saveUpload } from "@/lib/storage";
import { parseInvoiceFile } from "@/lib/invoice-parser";
import { getInvoice } from "@/lib/queries";

export const maxDuration = 120;

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * POST multipart/form-data { file } →
 * stores the scan (Vercel Blob or local disk), runs extraction, creates a
 * DRAFT invoice + line items, and returns the draft for the user to confirm.
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
    let effectiveMime = mime;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "invoice";
    let storedName = `${crypto.randomBytes(6).toString("hex")}-${safeName}`;

    // HEIC isn't accepted by the vision API — convert with macOS sips when available (local dev).
    if (mime === "image/heic") {
      try {
        const os = await import("os");
        const path = await import("path");
        const fs = await import("fs");
        const { execFileSync } = await import("child_process");
        const tmpIn = path.join(os.tmpdir(), `${crypto.randomBytes(6).toString("hex")}.heic`);
        const tmpOut = tmpIn.replace(/\.heic$/, ".jpg");
        fs.writeFileSync(tmpIn, buffer);
        execFileSync("sips", ["-s", "format", "jpeg", tmpIn, "--out", tmpOut], { stdio: "ignore" });
        buffer = fs.readFileSync(tmpOut);
        effectiveMime = "image/jpeg";
        storedName = storedName.replace(/\.heic$/i, ".jpg");
        fs.unlinkSync(tmpIn);
        fs.unlinkSync(tmpOut);
      } catch {
        effectiveMime = "image/heic"; // parse will fall back to manual entry
      }
    }

    const stored = await saveUpload(buffer, `invoices/${storedName}`, effectiveMime);

    const result =
      effectiveMime === "image/heic"
        ? { extraction: null, matched_contractor_id: null, error: "HEIC could not be converted — enter fields manually." }
        : await parseInvoiceFile(buffer, effectiveMime);

    const e = result.extraction;
    const invId = (await run(
      `INSERT INTO invoices (contractor_id, vendor, invoice_number, invoice_date, due_date, total,
         category, warranty_months, payment_status, source_file, source_filename, parse_confidence,
         parsed_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unpaid',$9,$10,$11,
         to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'),'draft') RETURNING id`,
      [
        result.matched_contractor_id, e?.vendor ?? null, e?.invoice_number ?? null,
        e?.invoice_date ?? null, e?.due_date ?? null, e?.total ?? 0, e?.category ?? null,
        e?.warranty_months ?? null, stored, file.name, e?.confidence ?? null,
      ]
    ))!;

    if (e) {
      for (const li of e.line_items) {
        await run(
          "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES ($1,$2,$3,$4) RETURNING id",
          [invId, li.description, li.type, li.amount]
        );
      }
      await logActivity(
        "invoice",
        `Invoice ${e.invoice_number ?? file.name} parsed${result.matched_contractor_id ? " and matched to " + e.vendor : ""} by ${user.name}`
      );
    }

    return Response.json({ invoice: await getInvoice(invId), parse_error: result.error }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Upload failed" }, { status: 500 });
  }
}

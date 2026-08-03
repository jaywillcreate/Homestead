import path from "path";
import fs from "fs";

/**
 * Upload storage — dual mode:
 *  - When BLOB_READ_WRITE_TOKEN is set (Vercel), files go to Vercel Blob and
 *    the stored value is the blob's https URL (unguessable random pathname).
 *  - Otherwise files are written under storage/uploads/ and the stored value
 *    is a relative path served by the auth-gated /api/files route.
 *
 * Components resolve either form with fileHref() in format.ts.
 */

export const UPLOADS_DIR = path.join(process.cwd(), "storage", "uploads");

export function blobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Store an uploaded file. Returns the value to persist in the DB. */
export async function saveUpload(
  buffer: Buffer,
  keyPath: string, // e.g. "invoices/ab12-file.pdf"
  contentType: string
): Promise<string> {
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`homestead/${keyPath}`, buffer, {
      access: "public", // public-but-unguessable URL; addRandomSuffix keeps it unlisted
      contentType,
      addRandomSuffix: true,
    });
    return blob.url;
  }
  const abs = path.join(UPLOADS_DIR, keyPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return keyPath;
}

/** Best-effort delete of a stored upload (either mode). */
export async function deleteUpload(stored: string | null | undefined): Promise<void> {
  if (!stored) return;
  try {
    if (stored.startsWith("http")) {
      if (!blobEnabled()) return;
      const { del } = await import("@vercel/blob");
      await del(stored);
    } else {
      const abs = path.resolve(UPLOADS_DIR, stored);
      if (abs.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) fs.unlinkSync(abs);
    }
  } catch {
    // deletion is cleanup, never fail the request over it
  }
}

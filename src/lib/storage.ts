import path from "path";
import fs from "fs";

/**
 * Upload storage — dual mode:
 *  - When BLOB_READ_WRITE_TOKEN is set (Vercel), files go to a PRIVATE Vercel
 *    Blob store and the stored DB value is "blob:<pathname>". Private blobs
 *    are only readable with the token, so the app serves them through the
 *    session-gated /api/files/blob route.
 *  - Otherwise files are written under storage/uploads/ and the stored value
 *    is a relative path served by the auth-gated /api/files route.
 *
 * Components resolve either form with fileHref() in format.ts.
 */

export const UPLOADS_DIR = path.join(process.cwd(), "storage", "uploads");

const BLOB_PREFIX = "blob:";

export function blobEnabled(): boolean {
  // Two auth modes: legacy read-write token, or the native Vercel integration
  // (BLOB_STORE_ID + runtime VERCEL_OIDC_TOKEN, resolved by the SDK itself).
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** Store an uploaded file. Returns the value to persist in the DB. */
export async function saveUpload(
  buffer: Buffer,
  keyPath: string, // e.g. "invoices/ab12-file.pdf" (caller includes a random prefix)
  contentType: string
): Promise<string> {
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`homestead/${keyPath}`, buffer, {
      access: "private",
      contentType,
      addRandomSuffix: false,
    });
    return `${BLOB_PREFIX}${blob.pathname}`;
  }
  const abs = path.join(UPLOADS_DIR, keyPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buffer);
  return keyPath;
}

/** Read a private blob for serving. Returns null when missing. */
export async function getBlobForServing(
  pathname: string
): Promise<{ stream: ReadableStream; contentType: string } | null> {
  if (!blobEnabled()) return null;
  const { get } = await import("@vercel/blob");
  const result = await get(pathname, { access: "private" });
  if (!result || !result.stream) return null;
  return {
    stream: result.stream,
    contentType: result.blob.contentType ?? "application/octet-stream",
  };
}

export function isBlobRef(stored: string): boolean {
  return stored.startsWith(BLOB_PREFIX);
}

export function blobPathname(stored: string): string {
  return stored.slice(BLOB_PREFIX.length);
}

/** Best-effort delete of a stored upload (either mode). */
export async function deleteUpload(stored: string | null | undefined): Promise<void> {
  if (!stored) return;
  try {
    if (isBlobRef(stored)) {
      if (!blobEnabled()) return;
      const { del } = await import("@vercel/blob");
      await del(blobPathname(stored));
    } else if (!stored.startsWith("http")) {
      const abs = path.resolve(UPLOADS_DIR, stored);
      if (abs.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) fs.unlinkSync(abs);
    }
  } catch {
    // deletion is cleanup, never fail the request over it
  }
}

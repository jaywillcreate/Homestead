import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
};

/** Auth-gated file server for uploaded scans and photos. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    await requirePermission("view_records");
    const { path: parts } = await params;
    const resolved = path.resolve(UPLOADS_DIR, ...parts);
    if (!resolved.startsWith(path.resolve(UPLOADS_DIR) + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return new Response("Not found", { status: 404 });
    }
    const body = new Uint8Array(fs.readFileSync(resolved));
    return new Response(body, {
      headers: {
        "Content-Type": MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return permissionResponse(err) ?? new Response("Server error", { status: 500 });
  }
}

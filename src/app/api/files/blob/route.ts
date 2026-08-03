import { requirePermission, permissionResponse } from "@/lib/auth";
import { getBlobForServing } from "@/lib/storage";

/**
 * Session-gated proxy for the PRIVATE Vercel Blob store. Blobs are only
 * readable with the server token, so this route is the sole way scans and
 * photos reach the browser in production.
 */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const pathname = new URL(req.url).searchParams.get("pathname");
    if (!pathname || !pathname.startsWith("homestead/")) {
      return new Response("Bad request", { status: 400 });
    }
    const result = await getBlobForServing(pathname);
    if (!result) return new Response("Not found", { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return permissionResponse(err) ?? new Response("Server error", { status: 500 });
  }
}

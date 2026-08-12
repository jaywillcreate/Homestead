import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";

type Params = { params: Promise<{ id: string; docId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("edit_contractors");
    const { id, docId } = await params;
    const doc = await qOne<{ id: number; filename: string; stored_path: string | null }>(
      "SELECT id, filename, stored_path FROM contractor_documents WHERE id = $1 AND contractor_id = $2",
      [Number(docId), Number(id)]
    );
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM contractor_documents WHERE id = $1", [doc.id]);
    await deleteUpload(doc.stored_path);
    await logActivity("contractor", `Document removed: ${doc.filename}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Delete failed" }, { status: 500 });
  }
}

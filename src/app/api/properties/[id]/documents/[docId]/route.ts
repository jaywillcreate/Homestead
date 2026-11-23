import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";
import { documentMetaSchema } from "@/lib/property-schema";

type Params = { params: Promise<{ id: string; docId: string }> };

async function find(params: Params["params"]) {
  const { id, docId } = await params;
  return qOne<{ id: number; filename: string; title: string | null; stored_path: string }>(
    "SELECT id, filename, title, stored_path FROM property_documents WHERE id = $1 AND property_id = $2",
    [Number(docId) || 0, Number(id) || 0]
  );
}

/** PATCH { title?, kind?, expires_on? } → relabel a document. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("edit_property_records");
    const doc = await find(params);
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = documentMetaSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Check the document type and date" }, { status: 400 });
    const d = parsed.data;
    await run(
      "UPDATE property_documents SET title = $1, kind = COALESCE($2, kind), expires_on = $3 WHERE id = $4",
      [d.title || null, d.kind ?? null, d.expires_on ?? null, doc.id]
    );
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("edit_property_records");
    const doc = await find(params);
    if (!doc) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM property_documents WHERE id = $1", [doc.id]);
    await deleteUpload(doc.stored_path);
    await logActivity("property", `Document removed: ${doc.title || doc.filename}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Delete failed" }, { status: 500 });
  }
}

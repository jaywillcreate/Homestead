import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { ITEM_KINDS, type ItemKind } from "@/lib/property-schema";

type Params = { params: Promise<{ id: string; kind: string; itemId: string }> };

async function locate(params: Params["params"]) {
  const { id, kind, itemId } = await params;
  if (!(kind in ITEM_KINDS)) return null;
  const cfg = ITEM_KINDS[kind as ItemKind];
  const row = await qOne<{ id: number }>(
    `SELECT id FROM ${cfg.table} WHERE id = $1 AND property_id = $2`,
    [Number(itemId) || 0, Number(id) || 0]
  );
  return row ? { cfg, itemId: row.id } : null;
}

/** PATCH → replace an inventory item's or paint record's details. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("edit_property_records");
    const found = await locate(params);
    if (!found) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = found.cfg.schema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Check the highlighted fields", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data as Record<string, unknown>;
    const fields = found.cfg.fields as readonly string[];
    await run(
      `UPDATE ${found.cfg.table} SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(", ")}
       WHERE id = $${fields.length + 1}`,
      [...fields.map((f) => (d[f] === undefined || d[f] === "" ? null : d[f])), found.itemId]
    );
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("edit_property_records");
    const found = await locate(params);
    if (!found) return Response.json({ error: "Not found" }, { status: 404 });
    await run(`DELETE FROM ${found.cfg.table} WHERE id = $1`, [found.itemId]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

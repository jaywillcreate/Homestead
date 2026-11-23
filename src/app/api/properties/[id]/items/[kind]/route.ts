import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { ITEM_KINDS, type ItemKind } from "@/lib/property-schema";

type Params = { params: Promise<{ id: string; kind: string }> };

/** POST → add an inventory item (kind=assets) or paint record (kind=paints) to a property. */
export async function POST(req: Request, { params }: Params) {
  try {
    await requirePermission("edit_property_records");
    const { id, kind } = await params;
    if (!(kind in ITEM_KINDS)) return Response.json({ error: "Not found" }, { status: 404 });
    const cfg = ITEM_KINDS[kind as ItemKind];
    const property = await qOne<{ id: number; label: string }>(
      "SELECT id, label FROM properties WHERE id = $1",
      [Number(id) || 0]
    );
    if (!property) return Response.json({ error: "Property not found" }, { status: 404 });
    const parsed = cfg.schema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Check the highlighted fields", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data as Record<string, unknown>;
    const fields = cfg.fields as readonly string[];
    const itemId = await run(
      `INSERT INTO ${cfg.table} (property_id, ${fields.join(", ")})
       VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [property.id, ...fields.map((f) => (d[f] === undefined || d[f] === "" ? null : d[f]))]
    );
    await logActivity("property", `${cfg.noun} added to ${property.label}: ${String(d[cfg.labelKey])}`);
    return Response.json({ id: itemId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

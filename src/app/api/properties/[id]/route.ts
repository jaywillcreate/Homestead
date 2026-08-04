import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { propertySchema, PROPERTY_FIELDS as FIELDS } from "@/lib/property-schema";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_properties");
    const { id } = await params;
    const existing = await qOne<{ id: number }>("SELECT id FROM properties WHERE id = $1", [Number(id)]);
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = propertySchema.partial().safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const fields: Record<string, unknown> = {};
    for (const key of FIELDS) {
      if (d[key] !== undefined) fields[key] = d[key] === "" ? null : d[key];
    }
    if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE properties SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
      await logActivity("property", `Property updated: ${d.label ?? `#${id}`}`);
    }
    return Response.json(await qOne("SELECT * FROM properties WHERE id = $1", [Number(id)]));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_properties");
    const { id } = await params;
    const existing = await qOne<{ id: number; label: string }>(
      "SELECT id, label FROM properties WHERE id = $1",
      [Number(id)]
    );
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const count = await qOne<{ n: number }>("SELECT COUNT(*)::int AS n FROM properties");
    if ((count?.n ?? 0) <= 1) {
      return Response.json({ error: "The household needs at least one property" }, { status: 400 });
    }
    const referenced = await qOne<{ n: number }>(
      `SELECT ((SELECT COUNT(*) FROM jobs WHERE property_id = $1)
             + (SELECT COUNT(*) FROM invoices WHERE property_id = $1)
             + (SELECT COUNT(*) FROM bid_requests WHERE property_id = $1)
             + (SELECT COUNT(*) FROM scheduled_events WHERE property_id = $1))::int AS n`,
      [Number(id)]
    );
    if ((referenced?.n ?? 0) > 0) {
      return Response.json(
        { error: `${existing.label} has ${referenced!.n} linked record(s) — reassign or remove them first` },
        { status: 409 }
      );
    }
    await run("DELETE FROM user_properties WHERE property_id = $1", [Number(id)]);
    await run("DELETE FROM properties WHERE id = $1", [Number(id)]);
    await logActivity("property", `Property removed: ${existing.label}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { contractorSchema } from "@/lib/contractor-schema";
import { getContractor } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requirePermission("view_records");
    const { id } = await params;
    const c = getContractor(Number(id));
    if (!c) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(c);
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requirePermission("edit_contractors");
    const { id } = await params;
    const existing = getContractor(Number(id));
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = contractorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    getDb()
      .prepare(
        `UPDATE contractors SET business_name=?, trade=?, primary_contact=?, phone=?, email=?,
           license_number=?, hourly_rate=?, insurance_expires=?, service_area_notes=?, status=?,
           tags=?, updated_at=datetime('now'), updated_by=? WHERE id=?`
      )
      .run(
        d.business_name, d.trade, d.primary_contact || null, d.phone || null, d.email || null,
        d.license_number || null, d.hourly_rate ?? null, d.insurance_expires || null,
        d.service_area_notes || null, d.status, JSON.stringify(d.tags), user.id, Number(id)
      );
    logActivity("contractor", `${d.business_name} updated`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("edit_contractors");
    const { id } = await params;
    // Soft delete: archive, so job/invoice history is preserved.
    getDb().prepare("UPDATE contractors SET status = 'archived' WHERE id = ?").run(Number(id));
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { contractorSchema } from "@/lib/contractor-schema";
import { getContractor } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requirePermission("view_records");
    const { id } = await params;
    const c = await getContractor(Number(id));
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
    const existing = await getContractor(Number(id));
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = contractorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    await run(
      `UPDATE contractors SET business_name=$1, trade=$2, primary_contact=$3, phone=$4, email=$5,
         license_number=$6, hourly_rate=$7, insurance_expires=$8, service_area_notes=$9, status=$10,
         tags=$11, updated_at=to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS'), updated_by=$12
       WHERE id=$13`,
      [
        d.business_name, d.trade, d.primary_contact || null, d.phone || null, d.email || null,
        d.license_number || null, d.hourly_rate ?? null, d.insurance_expires || null,
        d.service_area_notes || null, d.status, JSON.stringify(d.tags), user.id, Number(id),
      ]
    );
    await logActivity("contractor", `${d.business_name} updated`);
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
    await run("UPDATE contractors SET status = 'archived' WHERE id = $1", [Number(id)]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

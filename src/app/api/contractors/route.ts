import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { contractorSchema } from "@/lib/contractor-schema";
import { listContractors } from "@/lib/queries";

export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const trade = new URL(req.url).searchParams.get("trade") ?? undefined;
    return Response.json(listContractors(trade));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requirePermission("edit_contractors");
    const parsed = contractorSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const id = getDb()
      .prepare(
        `INSERT INTO contractors (business_name, trade, primary_contact, phone, email, license_number,
           hourly_rate, insurance_expires, service_area_notes, status, tags, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        d.business_name, d.trade, d.primary_contact || null, d.phone || null, d.email || null,
        d.license_number || null, d.hourly_rate ?? null, d.insurance_expires || null,
        d.service_area_notes || null, d.status, JSON.stringify(d.tags), user.id, user.id
      ).lastInsertRowid;
    logActivity("contractor", `${d.business_name} added to the contractor book`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { z } from "zod";
import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { getInvoice } from "@/lib/queries";

const createSchema = z.object({
  vendor: z.string().trim().max(200).nullable().optional(),
});

/**
 * POST → start a blank draft invoice with no scan, for typing one in by hand
 * (any vendor name — it does not have to be a contractor in the book).
 */
export async function POST(req: Request) {
  try {
    const user = await requirePermission("upload_invoices");
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const vendor = parsed.data.vendor || null;
    const id = (await run(
      `INSERT INTO invoices (property_id, vendor, total, payment_status, status)
       VALUES ((SELECT id FROM properties ORDER BY id LIMIT 1), $1, 0, 'unpaid', 'draft') RETURNING id`,
      [vendor]
    ))!;
    await logActivity("invoice", `Manual invoice started by ${user.name}`);
    return Response.json({ invoice: await getInvoice(id) }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

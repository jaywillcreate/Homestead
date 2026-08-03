import { z } from "zod";
import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { getInvoice } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  vendor: z.string().max(200).nullable().optional(),
  invoice_number: z.string().max(60).nullable().optional(),
  invoice_date: z.string().max(10).nullable().optional(),
  due_date: z.string().max(10).nullable().optional(),
  total: z.coerce.number().min(0).optional(),
  category: z.string().max(60).nullable().optional(),
  warranty_months: z.coerce.number().int().min(0).max(600).nullable().optional(),
  payment_status: z.enum(["paid", "unpaid", "overdue"]).optional(),
  contractor_id: z.number().int().nullable().optional(),
  line_items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        type: z.enum(["labor", "parts", "fees"]),
        amount: z.coerce.number(),
      })
    )
    .optional(),
  /** "confirm" files the draft and creates the linked job record. */
  action: z.enum(["confirm"]).optional(),
});

export async function GET(_req: Request, { params }: Params) {
  try {
    await requirePermission("view_records");
    const { id } = await params;
    const inv = getInvoice(Number(id));
    if (!inv) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(inv);
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await requirePermission("upload_invoices");
    const { id } = await params;
    const db = getDb();
    const existing = getInvoice(Number(id));
    if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const fields: Record<string, unknown> = {};
    for (const key of [
      "vendor", "invoice_number", "invoice_date", "due_date", "total",
      "category", "warranty_months", "payment_status", "contractor_id",
    ] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const setSql = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE invoices SET ${setSql} WHERE id = ?`).run(...Object.values(fields), Number(id));
    }

    if (d.line_items) {
      db.prepare("DELETE FROM invoice_line_items WHERE invoice_id = ?").run(Number(id));
      const ins = db.prepare(
        "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)"
      );
      for (const li of d.line_items) ins.run(Number(id), li.description, li.type, li.amount);
    }

    if (d.action === "confirm") {
      const inv = getInvoice(Number(id))!;
      let jobId = inv.job_id;
      if (!jobId && inv.contractor_id) {
        jobId = db
          .prepare(
            `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, status, amount, planned)
             VALUES ((SELECT id FROM properties LIMIT 1), ?, ?, ?, ?, 'done', ?, 0)`
          )
          .run(
            inv.contractor_id,
            `Invoice ${inv.invoice_number ?? inv.id}`,
            inv.category, inv.invoice_date, inv.total
          ).lastInsertRowid as number;
      }
      db.prepare(
        "UPDATE invoices SET status = 'filed', confirmed_by = ?, job_id = COALESCE(job_id, ?) WHERE id = ?"
      ).run(user.id, jobId, Number(id));
      logActivity("invoice", `Invoice ${inv.invoice_number ?? inv.id} confirmed & filed by ${user.name}`);
    }

    return Response.json(getInvoice(Number(id)));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("upload_invoices");
    const { id } = await params;
    getDb().prepare("DELETE FROM invoices WHERE id = ?").run(Number(id));
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

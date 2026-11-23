import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { deleteUpload } from "@/lib/storage";
import { getInvoice } from "@/lib/queries";

type Params = { params: Promise<{ id: string }> };

/** Reports bucket by YYYY-MM prefix, so dates must be real ISO dates. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

const patchSchema = z.object({
  vendor: z.string().trim().max(200).nullable().optional(),
  invoice_number: z.string().max(60).nullable().optional(),
  invoice_date: isoDate.nullable().optional(),
  due_date: isoDate.nullable().optional(),
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
    const inv = await getInvoice(Number(id));
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
    const existing = await getInvoice(Number(id));
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
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE invoices SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
    }

    if (d.line_items) {
      await run("DELETE FROM invoice_line_items WHERE invoice_id = $1", [Number(id)]);
      for (const li of d.line_items) {
        await run(
          "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES ($1,$2,$3,$4) RETURNING id",
          [Number(id), li.description, li.type, li.amount]
        );
      }
    }

    if (d.action === "confirm") {
      const inv = (await getInvoice(Number(id)))!;
      let jobId = inv.job_id;
      // Every filed invoice gets a spend record, linked contractor or not, so reports include it.
      if (!jobId) {
        jobId = await run(
          `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, status, amount, planned)
           VALUES (COALESCE($6, (SELECT id FROM properties ORDER BY id LIMIT 1)), $1, $2, $3, $4, 'done', $5, 0) RETURNING id`,
          [
            inv.contractor_id,
            `${inv.vendor ? inv.vendor + " — invoice" : "Invoice"} ${inv.invoice_number ?? inv.id}`,
            inv.category, inv.invoice_date, inv.total, inv.property_id,
          ]
        );
      }
      await run(
        "UPDATE invoices SET status = 'filed', confirmed_by = $1, job_id = COALESCE(job_id, $2) WHERE id = $3",
        [user.id, jobId, Number(id)]
      );
      await logActivity("invoice", `Invoice ${inv.invoice_number ?? inv.id} confirmed & filed by ${user.name}`);
    }

    return Response.json(await getInvoice(Number(id)));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE → remove any invoice, draft or filed, with its line items and scan.
 * The spend record that filing created goes with it (unless that job also
 * holds photos or another invoice), so reports stop counting the amount.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await requirePermission("upload_invoices");
    const id = Number((await params).id);
    const inv = Number.isInteger(id)
      ? await qOne<{ source_file: string | null; job_id: number | null; invoice_number: string | null; vendor: string | null }>(
          "SELECT source_file, job_id, invoice_number, vendor FROM invoices WHERE id = $1",
          [id]
        )
      : null;
    if (!inv) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM invoices WHERE id = $1", [id]); // line items cascade
    if (inv.job_id) {
      await run(
        `DELETE FROM jobs j WHERE j.id = $1
           AND COALESCE(j.notes, '') != '__photo_section__'
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id)
           AND NOT EXISTS (SELECT 1 FROM job_photos p WHERE p.job_id = j.id)`,
        [inv.job_id]
      );
    }
    await deleteUpload(inv.source_file);
    await logActivity("invoice", `Invoice ${inv.invoice_number ?? inv.vendor ?? `#${id}`} deleted by ${user.name}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

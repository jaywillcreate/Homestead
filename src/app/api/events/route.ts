import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_window: z.string().max(60).nullable().optional(),
  trade: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  contractor_id: z.number().int().nullable().optional(),
  /** When the vendor isn't in the book yet, optionally add them. */
  vendor_name: z.string().trim().max(200).optional(),
  add_to_book: z.boolean().optional(),
});

/** POST → put a job on the schedule (e.g. from an accepted or invited bid). */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_schedule");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    let contractorId = d.contractor_id ?? null;
    if (!contractorId && d.add_to_book && d.vendor_name) {
      // Adding to the book is a contractor edit — enforce that capability too.
      await requirePermission("edit_contractors");
      const existing = await qOne<{ id: number }>(
        "SELECT id FROM contractors WHERE lower(business_name) = lower($1) AND status != 'archived'",
        [d.vendor_name]
      );
      contractorId =
        existing?.id ??
        (await run(
          `INSERT INTO contractors (business_name, trade, status, tags, notes)
           VALUES ($1, $2, 'active', '["From bid search"]', 'Added from local pro discovery') RETURNING id`,
          [d.vendor_name, d.trade ?? "Other"]
        ));
      if (!existing) await logActivity("contractor", `${d.vendor_name} added to the contractor book`);
    }

    const notes =
      d.notes ??
      (d.vendor_name && !contractorId ? `Vendor: ${d.vendor_name} (not in contractor book)` : null);

    const id = await run(
      `INSERT INTO scheduled_events (property_id, contractor_id, name, trade, scheduled_for, time_window, status, notes)
       VALUES ((SELECT id FROM properties LIMIT 1), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        contractorId, d.name, d.trade ?? null, d.scheduled_for, d.time_window ?? null,
        contractorId ? "confirmed" : "todo", notes,
      ]
    );
    await logActivity("schedule", `${d.name} scheduled for ${d.scheduled_for}`);
    return Response.json({ id, contractor_id: contractorId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

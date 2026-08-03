import { z } from "zod";
import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  trade: z.string().max(60).nullable().optional(),
  cadence: z.enum(["quarterly", "semiannual", "annual", "one_off"]),
  assigned_contractor_id: z.number().int().nullable().optional(),
  estimated_cost: z.coerce.number().min(0).nullable().optional(),
  first_due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(1000).nullable().optional(),
});

/** POST → add a recurring maintenance task and schedule its first event. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_schedule");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const db = getDb();
    const taskId = db
      .prepare(
        `INSERT INTO maintenance_tasks (property_id, name, trade, cadence, assigned_contractor_id, estimated_cost, notes)
         VALUES ((SELECT id FROM properties LIMIT 1), ?, ?, ?, ?, ?, ?)`
      )
      .run(d.name, d.trade ?? null, d.cadence, d.assigned_contractor_id ?? null, d.estimated_cost ?? null, d.notes ?? null)
      .lastInsertRowid as number;
    db.prepare(
      `INSERT INTO scheduled_events (task_id, property_id, contractor_id, name, trade, scheduled_for, status)
       VALUES (?, (SELECT id FROM properties LIMIT 1), ?, ?, ?, ?, 'todo')`
    ).run(taskId, d.assigned_contractor_id ?? null, d.name, d.trade ?? null, d.first_due);
    logActivity("schedule", `Recurring task added: ${d.name} (${d.cadence})`);
    return Response.json({ id: taskId }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

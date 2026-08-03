import { z } from "zod";
import { getDb, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["confirmed", "todo", "overdue", "awaiting_decision", "needs_pro", "done"]).optional(),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time_window: z.string().max(60).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: Params) {
  try {
    await requirePermission("manage_schedule");
    const { id } = await params;
    const db = getDb();
    const event = db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(Number(id)) as
      | { id: number; name: string } | undefined;
    if (!event) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const d = parsed.data;
    const fields: Record<string, unknown> = {};
    for (const key of ["status", "scheduled_for", "time_window", "notes"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const setSql = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE scheduled_events SET ${setSql} WHERE id = ?`).run(...Object.values(fields), Number(id));
      if (d.status === "done") logActivity("schedule", `${event.name} marked done`);
      if (d.scheduled_for) logActivity("schedule", `${event.name} rescheduled to ${d.scheduled_for}`);
    }
    return Response.json(db.prepare("SELECT * FROM scheduled_events WHERE id = ?").get(Number(id)));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

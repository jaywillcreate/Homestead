import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
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
    const event = await qOne<{ id: number; name: string }>(
      "SELECT id, name FROM scheduled_events WHERE id = $1",
      [Number(id)]
    );
    if (!event) return Response.json({ error: "Not found" }, { status: 404 });
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const d = parsed.data;
    const fields: Record<string, unknown> = {};
    for (const key of ["status", "scheduled_for", "time_window", "notes"] as const) {
      if (d[key] !== undefined) fields[key] = d[key];
    }
    if (Object.keys(fields).length) {
      const keys = Object.keys(fields);
      const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
      await run(`UPDATE scheduled_events SET ${setSql} WHERE id = $${keys.length + 1}`, [
        ...Object.values(fields),
        Number(id),
      ]);
      if (d.status === "done") await logActivity("schedule", `${event.name} marked done`);
      if (d.scheduled_for) await logActivity("schedule", `${event.name} rescheduled to ${d.scheduled_for}`);
    }
    return Response.json(await qOne("SELECT * FROM scheduled_events WHERE id = $1", [Number(id)]));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE → remove any calendar item, whatever its status. A recurring task it belongs to is untouched. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_schedule");
    const id = Number((await params).id);
    const event = Number.isInteger(id)
      ? await qOne<{ id: number; name: string; scheduled_for: string }>(
          "SELECT id, name, scheduled_for FROM scheduled_events WHERE id = $1",
          [id]
        )
      : null;
    if (!event) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM scheduled_events WHERE id = $1", [id]);
    await logActivity("schedule", `${event.name} (${event.scheduled_for}) removed from the calendar`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

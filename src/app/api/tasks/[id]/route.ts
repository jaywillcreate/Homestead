import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE → remove a recurring task and its not-yet-done calendar items.
 * Completed occurrences stay on the calendar as history (unlinked from the task).
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_schedule");
    const id = Number((await params).id);
    const task = Number.isInteger(id)
      ? await qOne<{ id: number; name: string }>("SELECT id, name FROM maintenance_tasks WHERE id = $1", [id])
      : null;
    if (!task) return Response.json({ error: "Not found" }, { status: 404 });
    await run("DELETE FROM scheduled_events WHERE task_id = $1 AND status != 'done'", [id]);
    await run("DELETE FROM maintenance_tasks WHERE id = $1", [id]); // done events: task_id → NULL
    await logActivity("schedule", `Recurring task deleted: ${task.name}`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

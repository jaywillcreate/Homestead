import { z } from "zod";
import { run, qOne } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const schema = z.object({
  job_id: z.number().int(),
  /** Photo ids in their new display order. */
  ordered_ids: z.array(z.number().int()).min(1).max(200),
});

/** POST → persist a section's photo order. */
export async function POST(req: Request) {
  try {
    await requirePermission("upload_photos");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Validation failed" }, { status: 400 });
    const { job_id, ordered_ids } = parsed.data;
    const job = await qOne("SELECT id FROM jobs WHERE id = $1", [job_id]);
    if (!job) return Response.json({ error: "Section not found" }, { status: 404 });
    for (let i = 0; i < ordered_ids.length; i++) {
      await run("UPDATE job_photos SET sort_order = $1 WHERE id = $2 AND job_id = $3", [
        i, ordered_ids[i], job_id,
      ]);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

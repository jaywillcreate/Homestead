import { z } from "zod";
import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  contractor_id: z.number().int().nullable().optional(),
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
});

/**
 * POST → create a photo section. Sections are lightweight album jobs
 * (zero amount, marked with a sentinel note) so photos slot into the same
 * job → contractor → invoice graph as everything else.
 */
export async function POST(req: Request) {
  try {
    await requirePermission("upload_photos");
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const id = await run(
      `INSERT INTO jobs (property_id, contractor_id, title, performed_on, location, status, amount, planned, notes)
       VALUES ((SELECT id FROM properties LIMIT 1), $1, $2, $3, $4, 'done', 0, 1, '__photo_section__') RETURNING id`,
      [
        d.contractor_id ?? null, d.title,
        d.performed_on ?? new Date().toISOString().slice(0, 10),
        d.location ?? null,
      ]
    );
    await logActivity("photo", `Photo section created: ${d.title}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

import { z } from "zod";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { researchMaterials } from "@/lib/materials";
import { geocodeZip } from "@/lib/discovery";

export const maxDuration = 120;

const schema = z.object({
  query: z.string().trim().min(3).max(300),
  zip: z.string().trim().regex(/^\d{5}$/).nullable().optional(),
});

/** POST { query } → itemized material list with researched or sample pricing. */
export async function POST(req: Request) {
  try {
    await requirePermission("view_records");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Describe the job in a few words first" }, { status: 400 });
    }
    const loc = parsed.data.zip ? await geocodeZip(parsed.data.zip) : null;
    const where = loc ? `${loc.city}, ${loc.state} ${loc.zip}` : parsed.data.zip ? `ZIP ${parsed.data.zip}` : null;
    return Response.json(await researchMaterials(parsed.data.query, where));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Research failed" }, { status: 500 });
  }
}

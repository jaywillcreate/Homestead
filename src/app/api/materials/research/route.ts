import { z } from "zod";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { researchMaterials } from "@/lib/materials";

export const maxDuration = 120;

const schema = z.object({ query: z.string().trim().min(3).max(300) });

/** POST { query } → itemized material list with researched or sample pricing. */
export async function POST(req: Request) {
  try {
    await requirePermission("view_records");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Describe the job in a few words first" }, { status: 400 });
    }
    return Response.json(await researchMaterials(parsed.data.query));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Research failed" }, { status: 500 });
  }
}

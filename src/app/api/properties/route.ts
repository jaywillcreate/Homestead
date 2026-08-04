import { run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { propertySchema, PROPERTY_FIELDS } from "@/lib/property-schema";

/** POST → add a property (Owner only). All users get access to it. */
export async function POST(req: Request) {
  try {
    const user = await requirePermission("manage_properties");
    const parsed = propertySchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;
    const id = await run(
      `INSERT INTO properties (owner_id, ${PROPERTY_FIELDS.join(", ")})
       VALUES ($1, ${PROPERTY_FIELDS.map((_, i) => `$${i + 2}`).join(", ")}) RETURNING id`,
      [user.id, ...PROPERTY_FIELDS.map((f) => (d[f] === undefined || d[f] === "" ? null : d[f]))]
    );
    await run(
      "INSERT INTO user_properties (user_id, property_id) SELECT id, $1 FROM users ON CONFLICT DO NOTHING",
      [id]
    );
    await logActivity("property", `Property added: ${d.label}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

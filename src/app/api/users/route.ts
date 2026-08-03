import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(["owner", "manager", "viewer"]),
});

/** POST → invite (create) a household member. Owner only. */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_users");
    const parsed = inviteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const { name, email, role } = parsed.data;
    const exists = await qOne("SELECT id FROM users WHERE email = $1", [email]);
    if (exists) return Response.json({ error: "A user with that email already exists" }, { status: 409 });
    const id = await run(
      "INSERT INTO users (name, email, role) VALUES ($1, $2, $3) RETURNING id",
      [name, email, role]
    );
    await run(
      "INSERT INTO user_properties (user_id, property_id) SELECT $1, id FROM properties",
      [id]
    );
    await logActivity("user", `${name} invited as ${role}`);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

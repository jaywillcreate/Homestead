import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse, issuePasswordLink } from "@/lib/auth";

const inviteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["owner", "manager", "viewer"]),
});

/**
 * POST → invite a household member (Owner only). Creates the account in the
 * "invited" state and returns a one-time link the owner passes along; the
 * person sets their own password from it. Nobody can sign in as them until then.
 */
export async function POST(req: Request) {
  try {
    await requirePermission("manage_users");
    const parsed = inviteSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Enter a name and a valid email address" }, { status: 400 });
    }
    const { name, email, role } = parsed.data;
    const exists = await qOne("SELECT id FROM users WHERE lower(email) = $1", [email]);
    if (exists) return Response.json({ error: "Someone with that email is already on the list" }, { status: 409 });
    const id = (await run(
      "INSERT INTO users (name, email, role, status) VALUES ($1, $2, $3, 'invited') RETURNING id",
      [name, email, role]
    ))!;
    await run(
      "INSERT INTO user_properties (user_id, property_id) SELECT $1, id FROM properties",
      [id]
    );
    const invite_path = await issuePasswordLink(id);
    await logActivity("user", `${name} invited as ${role}`);
    return Response.json({ id, invite_path }, { status: 201 });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

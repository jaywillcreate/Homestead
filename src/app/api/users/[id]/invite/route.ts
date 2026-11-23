import { qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse, issuePasswordLink } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

/**
 * POST → mint a fresh one-time link for a member: an invite if they have never
 * signed in, a password reset otherwise. Any earlier link stops working.
 * The current password keeps working until the link is actually used.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    await requirePermission("manage_users");
    const id = Number((await params).id);
    const target = Number.isInteger(id)
      ? await qOne<{ id: number; name: string; status: string; has_password: boolean }>(
          "SELECT id, name, status, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1",
          [id]
        )
      : null;
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });
    if (target.status === "disabled") {
      return Response.json({ error: "Re-enable this person before sending a link" }, { status: 400 });
    }
    const invite_path = await issuePasswordLink(target.id);
    await logActivity("user", `${target.has_password ? "Password reset" : "Invite"} link created for ${target.name}`);
    return Response.json({ invite_path, kind: target.has_password ? "reset" : "invite" });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

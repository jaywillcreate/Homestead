import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse, destroyUserSessions } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  role: z.enum(["owner", "manager", "viewer"]).optional(),
  /** disabled blocks sign-in without deleting anything; active re-enables. */
  status: z.enum(["active", "disabled"]).optional(),
});

interface Target {
  id: number;
  name: string;
  role: string;
  status: string;
  has_password: boolean;
}

async function loadTarget(id: number): Promise<Target | null> {
  if (!Number.isInteger(id)) return null;
  return qOne<Target>(
    "SELECT id, name, role, status, (password_hash IS NOT NULL) AS has_password FROM users WHERE id = $1",
    [id]
  );
}

/** Owners who can actually sign in, other than `exceptId`. */
async function otherActiveOwners(exceptId: number): Promise<number> {
  return (await qOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND status = 'active' AND id != $1",
    [exceptId]
  ))!.n;
}

/** PATCH → edit a member's name, email, role, or enable/disable them. Owner only. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const actor = await requirePermission("manage_users");
    const id = Number((await params).id);
    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Enter a name and a valid email address" }, { status: 400 });
    const d = parsed.data;
    const target = await loadTarget(id);
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });

    const losesOwner =
      target.role === "owner" && target.status === "active" &&
      ((d.role !== undefined && d.role !== "owner") || d.status === "disabled");
    if (losesOwner && (await otherActiveOwners(id)) === 0) {
      return Response.json({ error: "This is the only owner — make someone else an owner first" }, { status: 400 });
    }
    if (d.status === "disabled" && id === actor.id) {
      return Response.json({ error: "You can't disable your own account" }, { status: 400 });
    }
    if (d.email) {
      const clash = await qOne("SELECT id FROM users WHERE lower(email) = $1 AND id != $2", [d.email, id]);
      if (clash) return Response.json({ error: "Someone else already uses that email" }, { status: 409 });
    }

    const fields: Record<string, unknown> = {};
    if (d.name !== undefined) fields.name = d.name;
    if (d.email !== undefined) fields.email = d.email;
    if (d.role !== undefined) fields.role = d.role;
    if (d.status === "disabled") fields.status = "disabled";
    // Re-enabling returns the person to "invited" if they never set a password.
    if (d.status === "active") fields.status = target.has_password ? "active" : "invited";

    const keys = Object.keys(fields);
    if (keys.length) {
      await run(
        `UPDATE users SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} WHERE id = $${keys.length + 1}`,
        [...Object.values(fields), id]
      );
    }
    if (d.status === "disabled") {
      await destroyUserSessions(id);
      await logActivity("user", `${target.name}'s access was disabled`);
    } else if (d.status === "active" && target.status === "disabled") {
      await logActivity("user", `${target.name}'s access was restored`);
    }
    if (d.role !== undefined && d.role !== target.role) {
      await logActivity("user", `${d.name ?? target.name} is now ${d.role}`);
    }
    return Response.json({ ok: true, self: actor.id === id });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE → remove a member for good. Their sessions, phone and notification
 * history go with them; records they created stay, with the author cleared.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const actor = await requirePermission("manage_users");
    const id = Number((await params).id);
    const target = await loadTarget(id);
    if (!target) return Response.json({ error: "Not found" }, { status: 404 });
    if (id === actor.id) {
      return Response.json({ error: "You can't remove your own account" }, { status: 400 });
    }
    if (target.role === "owner" && target.status === "active" && (await otherActiveOwners(id)) === 0) {
      return Response.json({ error: "This is the only owner — make someone else an owner first" }, { status: 400 });
    }

    // Columns that reference users without ON DELETE: hand properties to the
    // acting owner and clear authorship elsewhere, then delete.
    await run("UPDATE properties SET owner_id = $1 WHERE owner_id = $2", [actor.id, id]);
    for (const [table, column] of [
      ["contractors", "created_by"], ["contractors", "updated_by"], ["invoices", "confirmed_by"],
      ["job_photos", "uploaded_by"], ["property_photos", "uploaded_by"],
    ]) {
      await run(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1`, [id]);
    }
    await run("DELETE FROM users WHERE id = $1", [id]); // sessions, user_properties cascade
    await logActivity("user", `${target.name} was removed`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

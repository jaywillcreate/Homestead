import { cookies } from "next/headers";
import { z } from "zod";
import { run, qOne } from "@/lib/db";
import { requireUser, permissionResponse, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword, passwordProblem, sha256 } from "@/lib/password";

const schema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });

/** POST { current, next } → change the caller's own password; other devices are signed out. */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Enter your current and new password" }, { status: 400 });
    const row = await qOne<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id]
    );
    if (!verifyPassword(parsed.data.current, row?.password_hash)) {
      return Response.json({ error: "Your current password isn't right" }, { status: 400 });
    }
    const problem = passwordProblem(parsed.data.next);
    if (problem) return Response.json({ error: problem }, { status: 400 });

    await run("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(parsed.data.next), user.id]);
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    await run("DELETE FROM sessions WHERE user_id = $1 AND token != $2", [user.id, token ? sha256(token) : ""]);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

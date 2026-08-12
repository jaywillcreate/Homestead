import { z } from "zod";
import { run, qOne, logActivity } from "@/lib/db";
import { getCurrentUser, permissionResponse, PermissionError } from "@/lib/auth";

const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/** POST { code } — authenticate the caller's pending phone number. */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new PermissionError("Not signed in", 401);
    const parsed = verifySchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Enter the 6-digit code" }, { status: 400 });

    const row = await qOne<{ phone: string | null; phone_verify_code: string | null; phone_verify_expires: string | null }>(
      "SELECT phone, phone_verify_code, phone_verify_expires FROM users WHERE id = $1",
      [user.id]
    );
    if (!row?.phone || !row.phone_verify_code) {
      return Response.json({ error: "No verification pending — add a phone number first" }, { status: 400 });
    }
    const nowUtc = new Date().toISOString().slice(0, 19).replace("T", " ");
    if (row.phone_verify_expires && row.phone_verify_expires < nowUtc) {
      return Response.json({ error: "Code expired — request a new one" }, { status: 400 });
    }
    if (row.phone_verify_code !== parsed.data.code) {
      return Response.json({ error: "That code doesn't match" }, { status: 400 });
    }

    await run(
      `UPDATE users SET phone_verified = 1, phone_verify_code = NULL, phone_verify_expires = NULL
       WHERE id = $1`,
      [user.id]
    );
    await logActivity("user", `${user.name} verified their phone number`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

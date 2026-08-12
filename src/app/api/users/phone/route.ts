import crypto from "crypto";
import { z } from "zod";
import { run, logActivity } from "@/lib/db";
import { getCurrentUser, permissionResponse, PermissionError } from "@/lib/auth";
import { sendSms, smsEnabled, normalizePhone } from "@/lib/sms";

const setSchema = z.object({ phone: z.string().min(7).max(25) });

/**
 * POST { phone } — set/replace the CALLER's own phone number and text a
 * 6-digit verification code to it. Any signed-in member can authenticate
 * their own number; nobody can verify a number for someone else.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new PermissionError("Not signed in", 401);
    const parsed = setSchema.safeParse(await req.json());
    if (!parsed.success) return Response.json({ error: "Enter a phone number" }, { status: 400 });
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return Response.json({ error: "Enter a valid phone number, e.g. (210) 555-0147" }, { status: 400 });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    await run(
      `UPDATE users SET phone = $1, phone_verified = 0, phone_verify_code = $2,
         phone_verify_expires = to_char(now() at time zone 'utc' + interval '10 minutes', 'YYYY-MM-DD HH24:MI:SS')
       WHERE id = $3`,
      [phone, code, user.id]
    );

    const sms = await sendSms(phone, `Homestead verification code: ${code}`);
    if (!sms.ok) {
      return Response.json({ error: `Could not text the code: ${sms.error}` }, { status: 502 });
    }
    return Response.json({
      ok: true,
      phone,
      simulated: sms.simulated,
      // Local dev without Twilio: surface the code so the flow is completable.
      ...(smsEnabled() ? {} : { dev_code: code }),
    });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — remove the caller's own phone number. */
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) throw new PermissionError("Not signed in", 401);
    await run(
      `UPDATE users SET phone = NULL, phone_verified = 0, phone_verify_code = NULL, phone_verify_expires = NULL
       WHERE id = $1`,
      [user.id]
    );
    await logActivity("user", `${user.name} removed their phone number`);
    return Response.json({ ok: true });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

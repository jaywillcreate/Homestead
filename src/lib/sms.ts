/**
 * SMS delivery — dual mode, mirroring storage.ts:
 *  - With TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER set,
 *    messages go out through Twilio's REST API (plain fetch, no SDK).
 *  - Without them, sends are "simulated": recorded and logged so the whole
 *    flow (verification + notifications) works in local dev.
 */

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

export interface SmsResult {
  ok: boolean;
  simulated: boolean;
  error?: string;
}

/** Normalize a user-entered phone to E.164-ish (+1 default country code). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  const bare = digits.replace(/\D/g, "");
  if (bare.length === 10) return `+1${bare}`;
  if (bare.length === 11 && bare.startsWith("1")) return `+${bare}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsEnabled()) {
    console.log(`[sms simulated] to ${to}: ${body}`);
    return { ok: true, simulated: true };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: process.env.TWILIO_FROM_NUMBER!,
          Body: body,
        }),
      }
    );
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, simulated: false, error: detail?.message ?? `Twilio error ${res.status}` };
    }
    return { ok: true, simulated: false };
  } catch (err) {
    return { ok: false, simulated: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

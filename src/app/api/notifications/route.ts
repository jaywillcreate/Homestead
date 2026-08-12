import { z } from "zod";
import { q, run, logActivity } from "@/lib/db";
import { requirePermission, permissionResponse } from "@/lib/auth";
import { sendSms } from "@/lib/sms";

const sendSchema = z.object({
  recipient_ids: z.array(z.number().int()).min(1).max(50),
  message: z.string().trim().min(1).max(480),
});

/**
 * POST { recipient_ids, message } — push a notification to household members.
 * Only phones that have been authenticated (verified with an SMS code) are
 * ever texted; unverified recipients are reported back as skipped.
 */
export async function POST(req: Request) {
  try {
    const sender = await requirePermission("send_notifications");
    const parsed = sendSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Pick at least one recipient and write a message" }, { status: 400 });
    }
    const { recipient_ids, message } = parsed.data;

    const recipients = await q<{ id: number; name: string; phone: string | null; phone_verified: number }>(
      `SELECT id, name, phone, phone_verified FROM users WHERE id = ANY($1::int[])`,
      [recipient_ids]
    );

    const results: { id: number; name: string; status: "sent" | "simulated" | "failed" | "skipped"; error?: string }[] = [];
    for (const r of recipients) {
      if (!r.phone || !r.phone_verified) {
        results.push({ id: r.id, name: r.name, status: "skipped", error: "No authenticated phone" });
        continue;
      }
      const sms = await sendSms(r.phone, `Homestead — ${sender.name}: ${message}`);
      const status = sms.ok ? (sms.simulated ? "simulated" : "sent") : "failed";
      await run(
        `INSERT INTO notifications (sender_id, recipient_id, phone, body, status, error)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sender.id, r.id, r.phone, message, status, sms.error ?? null]
      );
      results.push({ id: r.id, name: r.name, status, error: sms.error });
    }

    const delivered = results.filter((r) => r.status === "sent" || r.status === "simulated").length;
    if (delivered > 0) {
      await logActivity("notification", `${sender.name} notified ${delivered} member${delivered === 1 ? "" : "s"}`);
    }
    return Response.json({ results });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

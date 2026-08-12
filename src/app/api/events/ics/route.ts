import { requirePermission, permissionResponse } from "@/lib/auth";
import { eventsForMonth } from "@/lib/queries";
import { icsForEvents } from "@/lib/calendar";

/** GET ?month=YYYY-MM → .ics of that month's events, importable into Google Calendar. */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const url = new URL(req.url);
    const month = url.searchParams.get("month") ?? "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ error: "month=YYYY-MM required" }, { status: 400 });
    }
    const events = await eventsForMonth(month);
    const ics = icsForEvents(events, `Homestead — ${month}`);
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="homestead-${month}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Server error" }, { status: 500 });
  }
}

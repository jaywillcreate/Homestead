import type { ScheduledEvent } from "./types";

/**
 * Calendar export helpers. Events carry a date plus a free-text time window
 * ("8–10 AM"), so they export as all-day entries with the window in the
 * description — no OAuth needed for either path:
 *  - googleCalUrl(): pre-filled Google Calendar "add event" link, per event;
 *  - icsForEvents(): an .ics feed Google Calendar (or any app) can import.
 */

type CalEvent = ScheduledEvent & { contractor_name?: string | null };

function ymdCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function eventDetails(e: CalEvent): string {
  const lines = [
    e.time_window ? `Time window: ${e.time_window}` : null,
    e.contractor_name ? `Contractor: ${e.contractor_name}` : e.contractor_id ? null : "Unassigned — self or needs a pro",
    e.trade ? `Trade: ${e.trade}` : null,
    e.cost != null ? `Estimated cost: $${e.cost}` : null,
    e.notes ?? null,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Pre-filled Google Calendar event-creation URL (all-day). */
export function googleCalUrl(e: CalEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Homestead: ${e.name}`,
    dates: `${ymdCompact(e.scheduled_for)}/${ymdCompact(nextDay(e.scheduled_for))}`,
    details: eventDetails(e),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 calendar with one all-day VEVENT per scheduled event. */
export function icsForEvents(events: CalEvent[], calName = "Homestead schedule"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Homestead//Schedule//EN",
    `X-WR-CALNAME:${icsEscape(calName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:homestead-event-${e.id}@homestead`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymdCompact(e.scheduled_for)}`,
      `DTEND;VALUE=DATE:${ymdCompact(nextDay(e.scheduled_for))}`,
      `SUMMARY:${icsEscape(e.name)}`,
      ...(eventDetails(e) ? [`DESCRIPTION:${icsEscape(eventDetails(e))}`] : []),
      `STATUS:${e.status === "done" ? "CONFIRMED" : e.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

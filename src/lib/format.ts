export function money(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function dayMonth(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

export function relativeTime(sqliteUtc: string): string {
  const d = new Date(sqliteUtc.replace(" ", "T") + "Z");
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(sqliteUtc.slice(0, 10));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Resolve a stored upload reference: Vercel Blob URLs pass through, local paths go via the auth-gated file route. */
export function fileHref(stored: string): string {
  return stored.startsWith("http") ? stored : `/api/files/${stored}`;
}

export const CADENCE_LABEL: Record<string, string> = {
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Annual",
  one_off: "One-off",
};

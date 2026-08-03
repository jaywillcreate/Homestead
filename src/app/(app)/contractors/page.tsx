import Link from "next/link";
import { Plus, ClockCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { listContractors } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, shortDate, initials } from "@/lib/format";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const CHIPS = ["All trades", "Plumbing", "Electrical", "HVAC", "Painting", "Pest control", "Outdoor & landscaping"];

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string; q?: string }>;
}) {
  const { trade = "All trades", q } = await searchParams;
  const user = await getCurrentUser();
  const canEdit = user ? can(user.role as Role, "edit_contractors") : false;
  let contractors = await listContractors(trade);
  if (q) {
    const needle = q.toLowerCase();
    contractors = contractors.filter(
      (c) =>
        c.business_name.toLowerCase().includes(needle) ||
        c.trade.toLowerCase().includes(needle) ||
        (c.primary_contact ?? "").toLowerCase().includes(needle)
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        {CHIPS.map((chip) => (
          <Link
            key={chip}
            href={chip === "All trades" ? "/contractors" : `/contractors?trade=${encodeURIComponent(chip)}`}
            className="chip"
            aria-pressed={trade === chip}
            style={{ textDecoration: "none" }}
          >
            {chip}
          </Link>
        ))}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <Link href="/contractors/new" className="btn btn-primary">
            <Plus size={15} /> Add contractor
          </Link>
        )}
      </div>

      {q && (
        <p className="text-muted" style={{ margin: 0, fontSize: 13 }}>
          {contractors.length} result{contractors.length === 1 ? "" : "s"} for “{q}”
        </p>
      )}

      <div className="grid-directory">
        {contractors.map((c) => (
          <Link key={c.id} href={`/contractors/${c.id}`} className="card card-link">
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                {initials(c.business_name)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="card-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.business_name}
                </div>
                <div style={{ fontSize: 12, opacity: 0.55 }}>{c.trade}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span className="tag tag-accent num">{c.job_count} jobs</span>
              <span className="tag tag-outline num">★ {c.rating?.toFixed(1) ?? "—"}</span>
              <span className="tag tag-outline num">{money(c.lifetime_spend)}</span>
            </div>
            <div className="card-meta">
              <ClockCounterClockwise size={13} />
              Last job {shortDate(c.last_job)}
            </div>
          </Link>
        ))}
      </div>
      {contractors.length === 0 && (
        <div className="card" style={{ alignItems: "center", padding: "var(--space-8)" }}>
          <p className="card-body">No contractors match. Add one to start building your book.</p>
        </div>
      )}
    </>
  );
}

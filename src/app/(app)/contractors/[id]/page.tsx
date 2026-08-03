import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Phone, EnvelopeSimple, MapPinArea, FileText, Images,
} from "@phosphor-icons/react/dist/ssr";
import { getContractor, contractorJobs, contractorDocuments } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, shortDate, initials } from "@/lib/format";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmtSize(bytes: number) {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}

export default async function ContractorProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getContractor(Number(id));
  if (!c) notFound();
  const jobs = await contractorJobs(c.id);
  const docs = await contractorDocuments(c.id);
  const user = await getCurrentUser();
  const canEdit = user ? can(user.role as Role, "edit_contractors") : false;

  return (
    <>
      <div>
        <Link href="/contractors" className="btn btn-ghost">
          <ArrowLeft size={15} /> Directory
        </Link>
      </div>
      <div className="split-2" style={{ gridTemplateColumns: "1fr 300px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div className="card">
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <span className="avatar" style={{ width: 62, height: 62, fontSize: 20 }}>
                {initials(c.business_name)}
              </span>
              <div style={{ flex: 1, minWidth: 180 }}>
                <h3>{c.business_name}</h3>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  {c.trade}
                  {c.license_number ? ` · Licensed #${c.license_number}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {canEdit && (
                  <Link href={`/contractors/${c.id}/edit`} className="btn btn-secondary">Edit</Link>
                )}
                <a href={`tel:${c.phone ?? ""}`} className="btn btn-primary">Call</a>
              </div>
            </div>
            <div className="fact-grid">
              {[
                ["Lifetime spend", money(c.lifetime_spend)],
                ["Jobs logged", String(c.job_count)],
                ["Rating", c.rating ? `★ ${c.rating.toFixed(1)}` : "—"],
                ["Last job", shortDate(c.last_job)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="fact-label">{label}</div>
                  <div className="fact-value num">{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="card-title">Job history</div>
              <Link href="/photos" className="btn btn-ghost">
                <Images size={15} /> Photos
              </Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Work</th>
                    <th>Invoice</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="num">{shortDate(j.performed_on)}</td>
                      <td>{j.title}</td>
                      <td>
                        {j.invoice_status === "paid" && <span className="tag tag-accent">Paid</span>}
                        {j.invoice_status === "unpaid" && <span className="tag tag-outline">Unpaid</span>}
                        {j.invoice_status === "overdue" && <span className="tag tag-warn">Overdue</span>}
                        {!j.invoice_status && <span className="tag tag-neutral">No invoice</span>}
                      </td>
                      <td className="num-cell">{money(j.amount, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
          <div className="card">
            <div className="card-title">Contact</div>
            {[
              [<Phone size={15} key="p" />, c.phone ?? "—"],
              [<EnvelopeSimple size={15} key="e" />, c.email ?? "—"],
              [<MapPinArea size={15} key="m" />, c.service_area_notes ?? "Service area not set"],
            ].map(([icon, text], i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                <span style={{ color: "var(--color-accent-text)", marginTop: 2 }}>{icon}</span>
                <span style={{ wordBreak: "break-word" }}>{text}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Notes</div>
            <p className="card-body">{c.notes ?? "No notes yet. Use Edit to add context — gate codes, preferred arrival windows, past quirks."}</p>
            {JSON.parse(c.tags || "[]").length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(JSON.parse(c.tags) as string[]).map((t) => (
                  <span className="tag tag-outline" key={t}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-title">Documents</div>
            {docs.length === 0 && <p className="card-body">No documents on file.</p>}
            {docs.map((d) => (
              <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                <FileText size={16} style={{ color: "var(--color-accent-text)" }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.filename}
                </span>
                <span className="text-muted num" style={{ fontSize: 11 }}>{fmtSize(d.size)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

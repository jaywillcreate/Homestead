"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudArrowUp, File as FileIcon } from "@phosphor-icons/react";
import { money, shortDate, dayMonth } from "@/lib/format";
import type { Invoice, InvoiceLineItem } from "@/lib/types";

type Draft = Invoice & { line_items: InvoiceLineItem[] };
type RecentInvoice = Invoice & { contractor_name: string | null };

export function InvoiceWorkbench({
  canUpload, initialDraft, recent, contractors,
}: {
  canUpload: boolean;
  initialDraft: Draft | null;
  recent: RecentInvoice[];
  contractors: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(initialDraft);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/invoices/parse", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setNotice(body.error ?? "Upload failed — try again.");
        return;
      }
      setDraft(body.invoice);
      if (body.parse_error) setNotice(body.parse_error);
      else showToast("Parsed — review the fields below, then confirm.");
    } catch {
      setNotice("Upload failed — check your connection and retry.");
    } finally {
      setUploading(false);
    }
  }, []);

  const patchDraft = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  async function saveDraft(action?: "confirm") {
    if (!draft) return;
    const res = await fetch(`/api/invoices/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor: draft.vendor, invoice_number: draft.invoice_number,
        invoice_date: draft.invoice_date, due_date: draft.due_date,
        total: draft.total, category: draft.category,
        warranty_months: draft.warranty_months, payment_status: draft.payment_status,
        contractor_id: draft.contractor_id,
        line_items: draft.line_items.map(({ description, type, amount }) => ({ description, type, amount })),
        ...(action ? { action } : {}),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setNotice(body.error ?? "Save failed");
      return;
    }
    if (action === "confirm") {
      setDraft(null);
      showToast("Invoice confirmed & filed.");
      router.refresh();
    } else {
      setDraft(body);
    }
  }

  const labor = draft?.line_items.filter((l) => l.type === "labor").reduce((a, b) => a + b.amount, 0) ?? 0;
  const parts = draft?.line_items.filter((l) => l.type === "parts").reduce((a, b) => a + b.amount, 0) ?? 0;
  const fees = draft?.line_items.filter((l) => l.type === "fees").reduce((a, b) => a + b.amount, 0) ?? 0;

  const isImage = draft?.source_file && /\.(jpe?g|png|webp|gif|svg)$/i.test(draft.source_file);

  return (
    <>
      {canUpload && (
        <div
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault(); setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) upload(file);
          }}
        >
          <CloudArrowUp size={24} style={{ color: "var(--color-accent-text)", flex: "none" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, fontSize: 15 }}>
              {uploading ? "Parsing invoice…" : "Drop invoices here to parse"}
            </div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              PDF, JPG or HEIC · fields extracted automatically and matched to a contractor
            </div>
          </div>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? "Working…" : "Browse files"}
          </button>
          <input
            ref={fileInput} type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.heic,.webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
        </div>
      )}
      {uploading && (
        <div style={{ display: "flex", gap: "var(--space-4)" }}>
          <div className="skeleton" style={{ height: 12, flex: 1 }} />
          <div className="skeleton" style={{ height: 12, flex: 2 }} />
          <div className="skeleton" style={{ height: 12, flex: 1 }} />
        </div>
      )}
      {notice && (
        <div className="card" style={{ borderLeft: "3px solid var(--color-signal)", padding: "var(--space-4) var(--space-6)" }}>
          <span style={{ fontSize: 13 }}>{notice}</span>
        </div>
      )}

      {draft && (
        <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* Scan viewer */}
          <div className="card" style={{ gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FileIcon size={15} style={{ color: "var(--color-accent-text)" }} />
              <span className="num" style={{ fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {draft.source_filename ?? "manual entry"}
              </span>
              <span className="tag tag-neutral">Page 1 of 1</span>
            </div>
            <div
              style={{
                background: "var(--sunken)", borderRadius: 10, minHeight: 420,
                display: "grid", placeItems: "center", overflow: "hidden",
              }}
            >
              {draft.source_file ? (
                isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${draft.source_file}`} alt="Invoice scan" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                ) : (
                  <iframe src={`/api/files/${draft.source_file}`} title="Invoice scan" style={{ width: "100%", height: 480, border: "none" }} />
                )
              ) : (
                <span className="text-muted" style={{ fontSize: 13 }}>No scan on file</span>
              )}
            </div>
          </div>

          {/* Extracted fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="card-title">Extracted fields</div>
                {draft.parse_confidence != null && (
                  <span className="tag tag-accent num">{Math.round(draft.parse_confidence * 100)}% confidence</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "var(--space-4)" }}>
                <div className="field">
                  <label>Vendor / contractor</label>
                  <select
                    className="input"
                    value={draft.contractor_id ?? ""}
                    onChange={(e) => {
                      const id = e.target.value === "" ? null : Number(e.target.value);
                      patchDraft("contractor_id", id);
                      const name = contractors.find((c) => c.id === id)?.name;
                      if (name) patchDraft("vendor", name);
                    }}
                  >
                    <option value="">{draft.vendor ? `${draft.vendor} (unmatched)` : "Unmatched"}</option>
                    {contractors.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Invoice date</label>
                  <input className="input" type="date" value={draft.invoice_date ?? ""}
                    onChange={(e) => patchDraft("invoice_date", e.target.value)} />
                </div>
                <div className="field">
                  <label>Invoice no.</label>
                  <input className="input" value={draft.invoice_number ?? ""}
                    onChange={(e) => patchDraft("invoice_number", e.target.value)} />
                </div>
                <div className="field">
                  <label>Total</label>
                  <input className="input num" type="number" step="0.01" value={draft.total ?? 0}
                    onChange={(e) => patchDraft("total", Number(e.target.value))} />
                </div>
                <div className="field">
                  <label>Category</label>
                  <input className="input" value={draft.category ?? ""}
                    onChange={(e) => patchDraft("category", e.target.value)} />
                </div>
                <div className="field">
                  <label>Warranty (months)</label>
                  <input className="input num" type="number" value={draft.warranty_months ?? ""}
                    onChange={(e) => patchDraft("warranty_months", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {draft.payment_status === "paid" ? (
                  <span className="tag tag-accent">Paid</span>
                ) : (
                  <span className={`tag ${draft.payment_status === "overdue" ? "tag-warn" : "tag-outline"}`}>
                    {draft.payment_status === "overdue" ? "Overdue" : "Unpaid"}
                    {draft.due_date ? ` · due ${dayMonth(draft.due_date)}` : ""}
                  </span>
                )}
                {draft.payment_status !== "paid" && (
                  <button className="btn btn-ghost" onClick={() => patchDraft("payment_status", "paid")}>
                    Mark paid
                  </button>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Line items</div>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr><th>Description</th><th>Type</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                  </thead>
                  <tbody>
                    {draft.line_items.map((li, i) => (
                      <tr key={li.id ?? i}>
                        <td style={{ fontSize: 13 }}>{li.description}</td>
                        <td>
                          <span className={`tag ${li.type === "labor" ? "tag-accent" : li.type === "parts" ? "tag-accent-2" : "tag-neutral"}`}>
                            {li.type[0].toUpperCase() + li.type.slice(1)}
                          </span>
                        </td>
                        <td className="num-cell">{money(li.amount, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="text-muted" style={{ fontSize: 12 }}>
                        Labor {money(labor, 2)} · Parts {money(parts, 2)}{fees ? ` · Fees ${money(fees, 2)}` : ""}
                      </td>
                      <td />
                      <td className="num-cell" style={{ fontWeight: 500 }}>{money(labor + parts + fees, 2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {canUpload && (
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button className="btn btn-primary" onClick={() => saveDraft("confirm")}>Confirm &amp; file</button>
                  <button className="btn btn-secondary" onClick={() => saveDraft()}>Save draft</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Recent invoices</div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Vendor</th><th>Date</th><th>Category</th><th>Status</th>
                <th style={{ textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
                <tr key={inv.id} style={{ cursor: "pointer" }}
                  onClick={async () => {
                    const res = await fetch(`/api/invoices/${inv.id}`);
                    if (res.ok) setDraft(await res.json());
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}>
                  <td>{inv.contractor_name ?? inv.vendor ?? "—"}</td>
                  <td className="num">{shortDate(inv.invoice_date)}</td>
                  <td>{inv.category ?? "—"}</td>
                  <td>
                    {inv.status === "draft" ? (
                      <span className="tag tag-warn-fill">Draft</span>
                    ) : inv.payment_status === "paid" ? (
                      <span className="tag tag-accent">Paid</span>
                    ) : inv.payment_status === "overdue" ? (
                      <span className="tag tag-warn">Overdue</span>
                    ) : (
                      <span className="tag tag-outline">Unpaid</span>
                    )}
                  </td>
                  <td className="num-cell">{money(inv.total, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

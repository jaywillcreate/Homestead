"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass, Plus, X, FloppyDisk, Trash, Package, Globe, Flask, Scales,
} from "@phosphor-icons/react";
import { money, shortDate } from "@/lib/format";
import type { MaterialItem } from "@/lib/materials";
import type { MaterialEstimateRow } from "@/lib/queries";

interface RequestOption {
  id: number;
  title: string;
  status: string;
  bids: { id: number; vendor_name: string; price: number | null; status: string }[];
}

export function MaterialsView({
  requests, estimates, liveResearch, canSave,
}: {
  requests: RequestOption[];
  estimates: MaterialEstimateRow[];
  liveResearch: boolean;
  canSave: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [source, setSource] = useState<"web" | "sample" | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [requestId, setRequestId] = useState<number | "">("");
  const [bidId, setBidId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedRequest = requests.find((r) => r.id === requestId) ?? null;
  const total = useMemo(
    () => items.reduce((a, i) => a + i.unit_price * i.quantity, 0),
    [items]
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function research() {
    if (query.trim().length < 3) return;
    setResearching(true);
    setNotice(null);
    try {
      const res = await fetch("/api/materials/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(body.error ?? "Research failed — try again.");
        return;
      }
      setItems(body.items ?? []);
      setSource(body.source ?? null);
      setSummary(body.summary ?? null);
      if (body.error) setNotice(body.error);
    } finally {
      setResearching(false);
    }
  }

  const patchItem = (i: number, patch: Partial<MaterialItem>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((list) => list.filter((_, j) => j !== i));
  const addItem = () =>
    setItems((list) => [...list, { name: "", spec: "", unit_price: 0, quantity: 1, note: null }]);

  async function saveEstimate() {
    if (!items.length) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/materials/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: query.trim() || "Materials estimate",
          query: query.trim() || null,
          items: items.filter((i) => i.name.trim()),
          source,
          bid_request_id: requestId === "" ? null : requestId,
          bid_id: bidId === "" ? null : bidId,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNotice(body.error ?? "Save failed");
        return;
      }
      showToast("Estimate saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function loadEstimate(e: MaterialEstimateRow) {
    try {
      setItems(JSON.parse(e.items) as MaterialItem[]);
      setQuery(e.query ?? e.title);
      setSource((e.source as "web" | "sample" | null) ?? null);
      setSummary(null);
      setRequestId(e.bid_request_id ?? "");
      setBidId(e.bid_id ?? "");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setNotice("Could not load that estimate.");
    }
  }

  async function deleteEstimate(id: number) {
    const res = await fetch(`/api/materials/estimates/${id}`, { method: "DELETE" });
    if (res.ok) {
      showToast("Estimate deleted.");
      router.refresh();
    }
  }

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Package size={17} style={{ color: "var(--color-accent-text)" }} />
          <div className="card-title">Project materials estimate</div>
        </div>
        <p className="card-body" style={{ margin: 0 }}>
          Describe the job and get an itemized materials list with{" "}
          {liveResearch ? "live web-researched pricing" : "pricing"} — then tune quantities and
          compare against contractor bids to see what you&apos;re really paying for labor.
        </p>
        <form
          style={{ display: "flex", gap: "var(--space-2)", maxWidth: 680, flexWrap: "wrap" }}
          onSubmit={(e) => { e.preventDefault(); research(); }}
        >
          <input className="input" style={{ flex: "2 1 300px" }}
            placeholder='e.g. "cedar privacy fence, 120 linear ft, 6 ft tall"'
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <button className="btn btn-primary" disabled={researching || query.trim().length < 3}>
            <MagnifyingGlass size={15} /> {researching ? "Researching…" : "Research materials"}
          </button>
        </form>
        {researching && (
          <div style={{ display: "flex", gap: "var(--space-4)" }}>
            <div className="skeleton" style={{ height: 12, flex: 1 }} />
            <div className="skeleton" style={{ height: 12, flex: 2 }} />
            <div className="skeleton" style={{ height: 12, flex: 1 }} />
          </div>
        )}
        {notice && (
          <div className="card" style={{ borderLeft: "3px solid var(--color-signal)", padding: "var(--space-3) var(--space-4)" }}>
            <span style={{ fontSize: 13 }}>{notice}</span>
          </div>
        )}
        {items.length > 0 && (
          <>
            <div className="text-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              {source === "web" ? (
                <><Globe size={12} style={{ color: "var(--color-accent-text)" }} /> Live web pricing via Claude</>
              ) : (
                <><Flask size={12} /> Sample pricing — set ANTHROPIC_API_KEY in .env.local for live research</>
              )}
              {summary && <span>· {summary}</span>}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "30%" }}>Material</th><th>Spec / unit</th>
                    <th style={{ textAlign: "right" }}>Unit price</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Line total</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td>
                        <input className="input" style={{ minHeight: 34, padding: "4px 10px", fontSize: 13 }}
                          value={it.name} placeholder="Material"
                          onChange={(e) => patchItem(i, { name: e.target.value })} />
                      </td>
                      <td>
                        <input className="input" style={{ minHeight: 34, padding: "4px 10px", fontSize: 12.5 }}
                          value={it.spec} placeholder="Spec / unit"
                          onChange={(e) => patchItem(i, { spec: e.target.value })} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input className="input num" type="number" step="0.01" min={0}
                          style={{ minHeight: 34, padding: "4px 10px", fontSize: 13, width: 96, textAlign: "right" }}
                          value={it.unit_price}
                          onChange={(e) => patchItem(i, { unit_price: Number(e.target.value) })} />
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <input className="input num" type="number" step="1" min={0}
                          style={{ minHeight: 34, padding: "4px 10px", fontSize: 13, width: 74, textAlign: "right" }}
                          value={it.quantity}
                          onChange={(e) => patchItem(i, { quantity: Number(e.target.value) })} />
                      </td>
                      <td className="num-cell">{money(it.unit_price * it.quantity, 2)}</td>
                      <td style={{ textAlign: "right" }}>
                        <button className="btn btn-icon btn-danger" style={{ width: 26, height: 26, minHeight: 26 }}
                          title="Remove" onClick={() => removeItem(i)}>
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      <button className="btn btn-ghost" onClick={addItem}>
                        <Plus size={14} /> Add material
                      </button>
                    </td>
                    <td className="text-muted" style={{ textAlign: "right", fontSize: 12 }}>Materials total</td>
                    <td className="num-cell" style={{ fontWeight: 500 }}>{money(total, 2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {canSave && (
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1, minWidth: 200 }}>
                  <label>Save to request (optional)</label>
                  <select className="input" value={String(requestId)}
                    onChange={(e) => {
                      setRequestId(e.target.value === "" ? "" : Number(e.target.value));
                      setBidId("");
                    }}>
                    <option value="">— No request —</option>
                    {requests.map((r) => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>
                {selectedRequest && selectedRequest.bids.length > 0 && (
                  <div className="field" style={{ flex: 1, minWidth: 200 }}>
                    <label>Save to bid (optional)</label>
                    <select className="input" value={String(bidId)}
                      onChange={(e) => setBidId(e.target.value === "" ? "" : Number(e.target.value))}>
                      <option value="">— No bid —</option>
                      {selectedRequest.bids.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.vendor_name}{b.price != null ? ` · ${money(b.price)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button className="btn btn-primary" disabled={saving || !items.some((i) => i.name.trim())}
                  onClick={saveEstimate}>
                  <FloppyDisk size={15} /> {saving ? "Saving…" : "Save estimate"}
                </button>
              </div>
            )}

            {selectedRequest && selectedRequest.bids.some((b) => b.price != null) && (
              <div className="card" style={{ background: "var(--surface-variant)", boxShadow: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Scales size={15} style={{ color: "var(--color-accent-text)" }} />
                  <div className="card-title" style={{ fontSize: 15 }}>Bids vs. materials ({money(total, 2)})</div>
                </div>
                {selectedRequest.bids
                  .filter((b) => b.price != null && b.status !== "declined")
                  .map((b) => {
                    const spread = b.price! - total;
                    const pct = total > 0 ? Math.round((spread / total) * 100) : null;
                    return (
                      <div key={b.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                        <span style={{ flex: 1 }}>{b.vendor_name}</span>
                        <span className="num">{money(b.price!)}</span>
                        <span className="num text-muted" style={{ fontSize: 12, width: 220, textAlign: "right" }}>
                          {money(spread, 0)} over materials{pct != null ? ` (${pct}% markup → labor/overhead)` : ""}
                        </span>
                      </div>
                    );
                  })}
                <p className="card-body" style={{ margin: 0, fontSize: 12 }}>
                  The spread between a bid and raw materials approximates labor, overhead, and margin —
                  a fair spread isn&apos;t zero, but an outlier is worth questioning.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {estimates.length > 0 && (
        <div className="card">
          <div className="card-title">Saved estimates</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Estimate</th><th>Request</th><th>Bid</th><th>Saved</th><th>Source</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                  {canSave && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {estimates.map((e) => (
                  <tr key={e.id} style={{ cursor: "pointer" }} onClick={() => loadEstimate(e)}
                    title="Load into the editor">
                    <td style={{ fontSize: 13, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.title}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12.5, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.request_title ?? "—"}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{e.bid_vendor ?? "—"}</td>
                    <td className="num">{shortDate(e.created_at?.slice(0, 10))}</td>
                    <td>
                      {e.source === "web"
                        ? <span className="tag tag-accent-2">Web</span>
                        : <span className="tag tag-outline">Sample</span>}
                    </td>
                    <td className="num-cell">{money(e.total, 2)}</td>
                    {canSave && (
                      <td onClick={(ev) => ev.stopPropagation()} style={{ textAlign: "right" }}>
                        <button className="btn btn-icon btn-danger" style={{ width: 26, height: 26, minHeight: 26 }}
                          title="Delete estimate" onClick={() => deleteEstimate(e.id)}>
                          <Trash size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

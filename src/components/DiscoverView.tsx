"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass, ChatCircle, MapPin, X, Star, CalendarPlus, PlusCircle,
  ClockCounterClockwise, ThumbsUp, ThumbsDown, NotePencil, Trash, Plus,
} from "@phosphor-icons/react";
import { money, shortDate, initials } from "@/lib/format";
import type { Bid, BidRequest } from "@/lib/types";
import type { LocalPro, ZipLocation } from "@/lib/discovery";

type Request = (BidRequest & { bids: Bid[] }) | null;
type HistoryEntry = BidRequest & { bids: Bid[] };

function badgeTag(badge: string | null) {
  if (!badge) return null;
  if (badge === "Best price") return <span className="tag tag-warn-fill">Best price</span>;
  if (badge === "Top rated") return <span className="tag tag-accent-2">Top rated</span>;
  if (badge === "In your book") return <span className="tag tag-accent">In your book</span>;
  return <span className="tag tag-outline">{badge}</span>;
}

function favorableTag(favorable: number | null) {
  if (favorable === 1)
    return <span className="tag tag-accent"><ThumbsUp size={11} /> Favorable</span>;
  if (favorable === 0)
    return <span className="tag tag-warn"><ThumbsDown size={11} /> Not favorable</span>;
  return null;
}

function FavorableSeg({
  value, onChange,
}: {
  value: 0 | 1 | null;
  onChange: (v: 0 | 1 | null) => void;
}) {
  return (
    <div className="seg" role="group" aria-label="Favorability">
      <button type="button" className="seg-opt" aria-pressed={value === 1}
        onClick={() => onChange(value === 1 ? null : 1)}>
        <ThumbsUp size={13} /> Favorable
      </button>
      <button type="button" className="seg-opt" aria-pressed={value === null}
        onClick={() => onChange(null)}>
        Undecided
      </button>
      <button type="button" className="seg-opt" aria-pressed={value === 0}
        onClick={() => onChange(value === 0 ? null : 0)}>
        <ThumbsDown size={13} /> Not favorable
      </button>
    </div>
  );
}

export function DiscoverView({
  request, history, canBid, canSchedule,
}: {
  request: Request;
  history: HistoryEntry[];
  canBid: boolean;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LocalPro[] | null>(null);
  const [source, setSource] = useState<string>("");
  const [location, setLocation] = useState<ZipLocation | null>(null);
  const [selected, setSelected] = useState<LocalPro | null>(null);
  const [proNotes, setProNotes] = useState("");
  const [proFavorable, setProFavorable] = useState<0 | 1 | null>(null);
  const [newJobTitle, setNewJobTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheduleBid, setScheduleBid] = useState<Bid | null>(null);
  const [editBid, setEditBid] = useState<Bid | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("homestead-zip");
      if (saved) setZip(saved);
    } catch {}
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const priced = request?.bids.filter((b) => b.price != null) ?? [];
  const avg = priced.length ? priced.reduce((a, b) => a + (b.price ?? 0), 0) / priced.length : 0;
  const requestOpen = request?.status === "open";
  const invitedNames = new Set(request?.bids.map((b) => b.vendor_name.toLowerCase()) ?? []);

  async function search() {
    if (!query.trim()) return;
    const zipTrim = zip.trim();
    if (zipTrim && !/^\d{5}$/.test(zipTrim)) {
      setZipError("Enter a 5-digit ZIP code");
      return;
    }
    setZipError(null);
    setSearching(true);
    setSelected(null);
    try {
      const params = new URLSearchParams({ q: query.trim() });
      if (zipTrim) params.set("zip", zipTrim);
      const res = await fetch(`/api/discover?${params}`);
      const body = await res.json();
      if (!res.ok) {
        setZipError(body.error ?? "Search failed");
        return;
      }
      setResults(body.pros ?? []);
      setSource(body.source);
      setLocation(body.location ?? null);
      if (zipTrim) {
        try { localStorage.setItem("homestead-zip", zipTrim); } catch {}
      }
    } finally {
      setSearching(false);
    }
  }

  function selectPro(pro: LocalPro | null) {
    setSelected(pro);
    setProNotes("");
    setProFavorable(null);
    setAddError(null);
  }

  async function addToBids(pro: LocalPro) {
    setAddError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(requestOpen && request ? { bid_request_id: request.id } : {}),
          ...(newJobTitle.trim() ? { title: newJobTitle.trim() } : {}),
          vendor_name: pro.name,
          meta: pro.distance_note ? `New · ${pro.distance_note}` : "New · found via search",
          rating: pro.rating,
          review_count: pro.review_count,
          review_excerpt: pro.review_excerpt,
          notes: proNotes.trim() || null,
          favorable: proFavorable,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setAddError(body.error ?? "Could not add to bids");
        return;
      }
      showToast(`${pro.name} added to bids.`);
      selectPro(null);
      setNewJobTitle("");
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function acceptBid(bid: Bid) {
    const res = await fetch(`/api/bids/${bid.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      showToast(`Accepted ${bid.vendor_name}'s bid — other bids declined.`);
      router.refresh();
    }
  }

  return (
    <>
      {request && (
        <div className="card">
          <div className="kicker">{requestOpen ? "Open request" : "Latest request"}</div>
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h4>{request.title}</h4>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Posted {shortDate(request.posted_at?.slice(0, 10))} ·{" "}
                {request.bids.filter((b) => b.status !== "awaiting").length} of {request.bids.length} bids returned
                {request.closes_at && requestOpen ? ` · closes ${shortDate(request.closes_at)}` : ""}
                {request.status === "accepted" ? " · bid accepted" : ""}
              </div>
              {request.scope && <p className="card-body" style={{ marginTop: 8, maxWidth: "70ch" }}>{request.scope}</p>}
            </div>
            {canBid && (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-secondary" onClick={() => setManualOpen(true)}>
                  <Plus size={15} /> Add bid
                </button>
                <button className="btn btn-primary">Request more bids</button>
              </div>
            )}
          </div>
        </div>
      )}

      {request && (
        <div className="grid-bids">
          {request.bids.map((bid) => {
            const vsAvg = bid.price != null && avg ? Math.round(((bid.price - avg) / avg) * 100) : null;
            const known = bid.badge === "In your book";
            return (
              <div
                key={bid.id}
                className={`card${canBid ? " card-link" : ""}`}
                style={{ boxShadow: known ? "0 0 0 1px var(--color-accent), var(--shadow-sm)" : undefined }}
                onClick={canBid ? () => setEditBid(bid) : undefined}
                role={canBid ? "button" : undefined}
                title={canBid ? "Open bid details & notes" : undefined}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{initials(bid.vendor_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="card-title" style={{ fontSize: 15 }}>{bid.vendor_name}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{bid.meta}</div>
                  </div>
                  {badgeTag(bid.status === "accepted" ? "In your book" : bid.badge)}
                </div>
                {bid.price != null ? (
                  <div>
                    <span className="num" style={{ fontSize: 26 }}>{money(bid.price)}</span>
                    {vsAvg != null && (
                      <span className="text-muted" style={{ fontSize: 11, marginLeft: 8 }}>
                        {vsAvg >= 0 ? "+" : ""}{vsAvg}% vs. average
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="text-muted" style={{ fontSize: 13 }}>Awaiting bid…</div>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {favorableTag(bid.favorable)}
                  {bid.rating != null && <span className="tag tag-outline num">★ {bid.rating.toFixed(1)}</span>}
                  {bid.review_count != null && <span className="tag tag-outline num">{bid.review_count} reviews</span>}
                  {bid.start_date && <span className="tag tag-outline">Start {shortDate(bid.start_date)}</span>}
                </div>
                {bid.notes && (
                  <p className="card-body" style={{ margin: 0, display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <NotePencil size={13} style={{ marginTop: 2, flex: "none", color: "var(--color-accent-text)" }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      {bid.notes}
                    </span>
                  </p>
                )}
                {!bid.notes && bid.review_excerpt && (
                  <p className="card-body" style={{ fontStyle: "italic", margin: 0 }}>{bid.review_excerpt}</p>
                )}
                <div
                  style={{ display: "flex", gap: "var(--space-2)", marginTop: "auto", paddingTop: "var(--space-2)", flexWrap: "wrap" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {bid.status === "accepted" ? (
                    <span className="tag tag-accent">Accepted</span>
                  ) : bid.status === "declined" ? (
                    <span className="tag tag-neutral">Declined</span>
                  ) : canBid && bid.price != null ? (
                    <>
                      <button className="btn btn-primary" onClick={() => acceptBid(bid)}>Accept bid</button>
                      <button className="btn btn-ghost"><ChatCircle size={15} /> Message</button>
                    </>
                  ) : (
                    <button className="btn btn-ghost" disabled><ChatCircle size={15} /> Message</button>
                  )}
                  {canSchedule && bid.status !== "declined" && (
                    <button className="btn btn-secondary" onClick={() => setScheduleBid(bid)}>
                      <CalendarPlus size={15} /> Add to schedule
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">Find more local pros</div>
        <p className="card-body" style={{ margin: 0 }}>
          Search nearby contractors with ratings and reviews, then click a result to review it,
          note why it caught your eye, and invite it to bid.
        </p>
        <form
          style={{ display: "flex", gap: "var(--space-2)", maxWidth: 620, flexWrap: "wrap" }}
          onSubmit={(e) => { e.preventDefault(); search(); }}
        >
          <input className="input" placeholder="e.g. fence contractor, water heater plumber"
            style={{ flex: "2 1 240px" }}
            value={query} onChange={(e) => setQuery(e.target.value)} />
          <input
            className={`input num${zipError ? " invalid" : ""}`}
            placeholder="ZIP code"
            inputMode="numeric"
            maxLength={5}
            style={{ flex: "0 1 110px" }}
            value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/\D/g, "")); setZipError(null); }}
            aria-label="ZIP code"
          />
          <button className="btn btn-primary" disabled={searching}>
            <MagnifyingGlass size={15} /> {searching ? "Searching…" : "Search"}
          </button>
        </form>
        {zipError && <div className="field-error">{zipError}</div>}
        {results && (
          <>
            <div className="text-muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
              {location && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-accent-text)" }}>
                  <MapPin size={12} /> Near {location.city}, {location.state} {location.zip}
                </span>
              )}
              {location && <span>·</span>}
              <span>
                {source === "google_places"
                  ? "Live results via Google Places"
                  : "Sample results — set GOOGLE_PLACES_API_KEY in .env.local for live local data"}
              </span>
            </div>
            <div className="split-2" style={{ gridTemplateColumns: selected ? "1fr 320px" : "1fr", alignItems: "start" }}>
              <div className="grid-bids">
                {results.map((p, i) => {
                  const isSelected = selected?.name === p.name;
                  const invited = invitedNames.has(p.name.toLowerCase());
                  return (
                    <button
                      key={i}
                      className="card card-link"
                      style={{
                        textAlign: "left", font: "inherit", border: "none",
                        boxShadow: isSelected ? "0 0 0 1.5px var(--color-accent), var(--shadow-md)" : undefined,
                      }}
                      onClick={() => selectPro(isSelected ? null : p)}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{initials(p.name)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="card-title" style={{ fontSize: 15 }}>{p.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{p.distance_note ?? "Nearby"}</div>
                        </div>
                        {invited && <span className="tag tag-accent">In bids</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {p.rating != null && <span className="tag tag-outline num">★ {p.rating.toFixed(1)}</span>}
                        {p.review_count != null && <span className="tag tag-outline num">{p.review_count} reviews</span>}
                      </div>
                      {p.review_excerpt && (
                        <p className="card-body" style={{ fontStyle: "italic", margin: 0 }}>{p.review_excerpt}</p>
                      )}
                    </button>
                  );
                })}
              </div>

              {selected && (
                <div className="card" style={{ boxShadow: "var(--shadow-md)", position: "sticky", top: 90 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(selected.name)}</span>
                      <div>
                        <h5>{selected.name}</h5>
                        <div className="text-muted" style={{ fontSize: 11 }}>
                          {source === "google_places" ? "Google Places listing" : "Sample listing"}
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
                      onClick={() => selectPro(null)} aria-label="Close">
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                    {selected.rating != null && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <Star size={14} style={{ color: "var(--color-accent-text)" }} />
                        {selected.rating.toFixed(1)} · {selected.review_count ?? "—"} reviews
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <MapPin size={14} style={{ color: "var(--color-accent-text)" }} />
                      {selected.address ?? selected.distance_note ?? "Nearby"}
                    </div>
                    {selected.distance_note && selected.address && (
                      <div className="text-muted" style={{ fontSize: 12 }}>{selected.distance_note}</div>
                    )}
                  </div>
                  {selected.review_excerpt && (
                    <p className="card-body" style={{ fontStyle: "italic", margin: 0 }}>{selected.review_excerpt}</p>
                  )}
                  {canBid && (
                    <>
                      <div className="field">
                        <label>Notes — why this pro?</label>
                        <textarea className="input" style={{ minHeight: 64 }}
                          value={proNotes} onChange={(e) => setProNotes(e.target.value)}
                          placeholder="e.g. Top-rated nearby, neighbor recommended, good storm-repair reviews" />
                      </div>
                      <FavorableSeg value={proFavorable} onChange={setProFavorable} />
                      {!requestOpen && (
                        <div className="field">
                          <label>Job title for the new bid request</label>
                          <input className="input" value={newJobTitle}
                            onChange={(e) => setNewJobTitle(e.target.value)}
                            placeholder="e.g. Roof repair — hail damage" />
                        </div>
                      )}
                      {addError && <div className="field-error">{addError}</div>}
                      {invitedNames.has(selected.name.toLowerCase()) ? (
                        <span className="tag tag-accent">Already in bids</span>
                      ) : (
                        <button className="btn btn-primary btn-block" disabled={adding || (!requestOpen && !newJobTitle.trim())}
                          onClick={() => addToBids(selected)}>
                          <PlusCircle size={15} /> {adding ? "Adding…" : "Add to bids"}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {history.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ClockCounterClockwise size={16} style={{ color: "var(--color-accent-text)" }} />
            <div className="card-title">Bid history</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Request</th><th>Posted</th><th>Bids</th><th>Outcome</th>
                  <th style={{ textAlign: "right" }}>Winning price</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const accepted = h.bids.find((b) => b.status === "accepted");
                  return (
                    <tr key={h.id}>
                      <td style={{ fontSize: 13 }}>{h.title}</td>
                      <td className="num">{shortDate(h.posted_at?.slice(0, 10))}</td>
                      <td className="num">{h.bids.length}</td>
                      <td>
                        {accepted ? (
                          <span className="tag tag-accent">{accepted.vendor_name}</span>
                        ) : h.status === "open" ? (
                          <span className="tag tag-outline">Open</span>
                        ) : (
                          <span className="tag tag-neutral">Closed</span>
                        )}
                      </td>
                      <td className="num-cell">{accepted?.price != null ? money(accepted.price) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editBid && (
        <BidDetailsDialog
          bid={editBid}
          onClose={() => setEditBid(null)}
          onDone={(msg) => { setEditBid(null); showToast(msg); router.refresh(); }}
        />
      )}
      {manualOpen && (
        <ManualBidDialog
          requestOpen={Boolean(requestOpen)}
          onClose={() => setManualOpen(false)}
          onDone={(msg) => { setManualOpen(false); showToast(msg); router.refresh(); }}
        />
      )}
      {scheduleBid && (
        <ScheduleBidDialog
          bid={scheduleBid}
          requestTitle={request?.title ?? "Scheduled job"}
          onClose={() => setScheduleBid(null)}
          onDone={(msg) => { setScheduleBid(null); showToast(msg); router.refresh(); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ————— Bid details: notes, favorability, edits, removal ————— */

function BidDetailsDialog({
  bid, onClose, onDone,
}: {
  bid: Bid;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [notes, setNotes] = useState(bid.notes ?? "");
  const [favorable, setFavorable] = useState<0 | 1 | null>(
    bid.favorable === 1 ? 1 : bid.favorable === 0 ? 0 : null
  );
  const [price, setPrice] = useState(bid.price != null ? String(bid.price) : "");
  const [startDate, setStartDate] = useState(bid.start_date ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/bids/${bid.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          favorable,
          price: price === "" ? null : Number(price),
          start_date: startDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Save failed");
        return;
      }
      onDone(`${bid.vendor_name} updated.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/bids/${bid.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Remove failed");
        return;
      }
      onDone(`${bid.vendor_name} removed from bids.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Bid details">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{initials(bid.vendor_name)}</span>
          <div style={{ flex: 1 }}>
            <div className="dialog-title" style={{ fontSize: 20 }}>{bid.vendor_name}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{bid.meta}</div>
          </div>
          {badgeTag(bid.badge)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Bid price ($)</label>
            <input className="input num" type="number" min={0} step="0.01" value={price}
              onChange={(e) => setPrice(e.target.value)} placeholder="Awaiting" />
          </div>
          <div className="field">
            <label>Proposed start</label>
            <input className="input" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes — why they were called or searched</label>
          <textarea className="input" style={{ minHeight: 80 }}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Referred by neighbor; called for storm damage quote; sounded booked until fall" />
        </div>
        <FavorableSeg value={favorable} onChange={setFavorable} />
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: "space-between" }}>
          {confirmRemove ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5 }}>Remove this bid?</span>
              <button className="btn btn-danger" disabled={busy} onClick={remove}>
                <Trash size={14} /> Remove
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmRemove(false)}>Keep</button>
            </div>
          ) : (
            <button className="btn btn-danger" onClick={() => setConfirmRemove(true)}>
              <Trash size={14} /> Remove bid
            </button>
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ————— Manual bid entry ————— */

function ManualBidDialog({
  requestOpen, onClose, onDone,
}: {
  requestOpen: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [vendor, setVendor] = useState("");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [favorable, setFavorable] = useState<0 | 1 | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: vendor.trim(),
          price: price === "" ? null : Number(price),
          start_date: startDate || null,
          notes: notes.trim() || null,
          favorable,
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not add bid");
        return;
      }
      onDone(`${vendor.trim()} added to bids.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add bid manually">
        <div className="dialog-title">Add bid</div>
        <p className="card-body" style={{ margin: 0 }}>
          Enter a quote you collected by phone, text, or in person. Known contractors link to your
          book automatically.
        </p>
        <div className="field">
          <label>Contractor / company name</label>
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}
            placeholder="e.g. Mesa Verde Fence & Gate" autoFocus />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Bid price ($, optional)</label>
            <input className="input num" type="number" min={0} step="0.01" value={price}
              onChange={(e) => setPrice(e.target.value)} placeholder="Awaiting quote" />
          </div>
          <div className="field">
            <label>Proposed start (optional)</label>
            <input className="input" type="date" value={startDate}
              onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes — why they were called</label>
          <textarea className="input" style={{ minHeight: 64 }}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Did the neighbor's fence last spring; quoted over the phone" />
        </div>
        <FavorableSeg value={favorable} onChange={setFavorable} />
        {!requestOpen && (
          <div className="field">
            <label>Job title for the new bid request</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fence replacement" />
          </div>
        )}
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            disabled={busy || !vendor.trim() || (!requestOpen && !title.trim())} onClick={save}>
            {busy ? "Adding…" : "Add bid"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————— Add a bid to the schedule ————— */

function ScheduleBidDialog({
  bid, requestTitle, onClose, onDone,
}: {
  bid: Bid;
  requestTitle: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [date, setDate] = useState(bid.start_date ?? "");
  const [timeWindow, setTimeWindow] = useState("");
  const [addToBook, setAddToBook] = useState(bid.contractor_id == null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${requestTitle} — ${bid.vendor_name}`,
          scheduled_for: date,
          time_window: timeWindow || null,
          contractor_id: bid.contractor_id,
          vendor_name: bid.vendor_name,
          add_to_book: bid.contractor_id == null ? addToBook : false,
          notes: bid.price != null ? `Bid: ${money(bid.price)}` : null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not schedule");
        return;
      }
      onDone(`${bid.vendor_name} added to the schedule for ${shortDate(date)}.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add to schedule">
        <div className="dialog-title">Add to schedule</div>
        <p className="card-body" style={{ margin: 0 }}>
          {requestTitle} · {bid.vendor_name}
          {bid.price != null ? ` · ${money(bid.price)}` : ""}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Time window (optional)</label>
            <input className="input" placeholder="e.g. 8–10 AM" value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)} />
          </div>
        </div>
        {bid.contractor_id == null && (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={addToBook} onChange={(e) => setAddToBook(e.target.checked)} />
            Add {bid.vendor_name} to the contractor book
          </label>
        )}
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!date || saving} onClick={save}>
            {saving ? "Scheduling…" : "Add to schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

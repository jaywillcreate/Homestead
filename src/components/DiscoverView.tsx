"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass, ChatCircle, MapPin, X, Star, CalendarPlus, PlusCircle,
  ThumbsUp, ThumbsDown, NotePencil, Trash, Plus,
  PencilSimple, CaretLeft, CaretRight, ListBullets, Ticket, FunnelSimple,
} from "@phosphor-icons/react";
import { money, shortDate, initials } from "@/lib/format";
import { TRADES, type Bid, type BidRequest } from "@/lib/types";
import type { LocalPro, ZipLocation } from "@/lib/discovery";

type RequestEntry = BidRequest & { bids: Bid[]; property_label?: string | null };

/** Client-side ticket filters for the request queue. */
export interface QueueFilters {
  contractor: string;
  property: string; // property_id as string, "" = all
  category: string;
  priority: string;
  costMin: string;
  costMax: string;
}

const EMPTY_FILTERS: QueueFilters = {
  contractor: "", property: "", category: "", priority: "", costMin: "", costMax: "",
};

export function applyQueueFilters(requests: RequestEntry[], f: QueueFilters): RequestEntry[] {
  return requests.filter((r) => {
    if (f.property && String(r.property_id ?? "") !== f.property) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.priority && (r.priority ?? "normal") !== f.priority) return false;
    if (f.contractor && !r.bids.some((b) => b.vendor_name === f.contractor)) return false;
    const min = f.costMin === "" ? null : Number(f.costMin);
    const max = f.costMax === "" ? null : Number(f.costMax);
    if (min != null || max != null) {
      const priced = r.bids.filter((b) => b.price != null && b.status !== "declined");
      if (!priced.length) return false;
      const inRange = priced.some(
        (b) => (min == null || b.price! >= min) && (max == null || b.price! <= max)
      );
      if (!inRange) return false;
    }
    return true;
  });
}

/* ————— small shared pieces ————— */

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

function bidStatusTag(status: Bid["status"]) {
  if (status === "accepted") return <span className="tag tag-accent">Accepted</span>;
  if (status === "declined") return <span className="tag tag-neutral">Declined</span>;
  if (status === "received") return <span className="tag tag-accent-2">Received</span>;
  return <span className="tag tag-outline">Awaiting</span>;
}

function priorityTag(priority: BidRequest["priority"]) {
  if (priority === "high") return <span className="tag tag-warn">High priority</span>;
  if (priority === "low") return <span className="tag tag-neutral">Low priority</span>;
  return null;
}

function requestStatusTag(status: BidRequest["status"]) {
  if (status === "open") return <span className="tag tag-outline">Open for bids</span>;
  if (status === "accepted") return <span className="tag tag-accent">Accepted</span>;
  if (status === "scheduled") return <span className="tag tag-accent-2">Scheduled</span>;
  return <span className="tag tag-neutral">Closed</span>;
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

/** Dropdown of open requests, with an optional "start new" entry. */
function RequestSelect({
  openRequests, value, onChange, allowNew,
}: {
  openRequests: RequestEntry[];
  value: number | "new";
  onChange: (v: number | "new") => void;
  allowNew: boolean;
}) {
  return (
    <div className="field">
      <label>Attach to request</label>
      <select
        className="input"
        value={String(value)}
        onChange={(e) => onChange(e.target.value === "new" ? "new" : Number(e.target.value))}
      >
        {openRequests.map((r) => (
          <option key={r.id} value={r.id}>{r.title}</option>
        ))}
        {allowNew && <option value="new">+ Start a new request…</option>}
      </select>
    </div>
  );
}

/* ————— main view ————— */

export interface BookContractor {
  id: number;
  name: string;
  trade: string;
}

export interface PropertyOption {
  id: number;
  label: string;
  address: string | null;
}

export function DiscoverView({
  requests, contractors, properties, canBid, canSchedule,
}: {
  requests: RequestEntry[];
  contractors: BookContractor[];
  properties: PropertyOption[];
  canBid: boolean;
  canSchedule: boolean;
}) {
  const router = useRouter();
  const openRequests = useMemo(() => requests.filter((r) => r.status === "open"), [requests]);
  const defaultFeatured = openRequests[0]?.id ?? requests[0]?.id ?? null;
  const [featuredId, setFeaturedId] = useState<number | null>(defaultFeatured);
  const featured = requests.find((r) => r.id === featuredId) ?? requests[0] ?? null;

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
  const [proTarget, setProTarget] = useState<number | "new">(featured?.status === "open" ? featured.id : "new");
  const [newJobTitle, setNewJobTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [scheduleBid, setScheduleBid] = useState<Bid | null>(null);
  const [editBid, setEditBid] = useState<Bid | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [requestDialog, setRequestDialog] = useState<"new" | RequestEntry | null>(null);
  const [filters, setFilters] = useState<QueueFilters>(EMPTY_FILTERS);
  const filteredRequests = useMemo(() => applyQueueFilters(requests, filters), [requests, filters]);
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

  const priced = featured?.bids.filter((b) => b.price != null) ?? [];
  const avg = priced.length ? priced.reduce((a, b) => a + (b.price ?? 0), 0) / priced.length : 0;
  const invitedNames = new Set(
    (proTarget === "new"
      ? []
      : requests.find((r) => r.id === proTarget)?.bids ?? featured?.bids ?? []
    ).map((b) => b.vendor_name.toLowerCase())
  );

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
    setProTarget(openRequests[0]?.id ?? "new");
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
          ...(proTarget !== "new" ? { bid_request_id: proTarget } : {}),
          ...(proTarget === "new" && newJobTitle.trim() ? { title: newJobTitle.trim() } : {}),
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
      {/* ————— request queue: the property-task ticketing module ————— */}
      {requests.length > 0 && (
        <RequestQueue
          requests={filteredRequests}
          totalCount={requests.length}
          featuredId={featured?.id ?? null}
          canBid={canBid}
          onSelect={setFeaturedId}
          onEdit={(r) => setRequestDialog(r)}
          onNew={() => setRequestDialog("new")}
          filterBar={
            <QueueFilterBar
              filters={filters}
              onChange={setFilters}
              requests={requests}
              properties={properties}
            />
          }
        />
      )}

      {featured && (
        <div className="card">
          <div className="kicker">
            {featured.status === "open"
              ? "Open request"
              : featured.status === "accepted"
                ? "Accepted request"
                : featured.status === "scheduled"
                  ? "Scheduled request"
                  : "Closed request"}
          </div>
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h4>{featured.title}</h4>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Posted {shortDate(featured.posted_at?.slice(0, 10))} ·{" "}
                {featured.bids.filter((b) => b.status !== "awaiting").length} of {featured.bids.length} bids returned
                {featured.closes_at && featured.status === "open" ? ` · closes ${shortDate(featured.closes_at)}` : ""}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {requestStatusTag(featured.status)}
                {featured.category && <span className="tag tag-accent-2">{featured.category}</span>}
                {priorityTag(featured.priority)}
                {featured.budget != null && (
                  <span className="tag tag-outline num">Target {money(featured.budget)}</span>
                )}
              </div>
              {featured.scope && (
                <p className="card-body" style={{ marginTop: 8, maxWidth: "70ch" }}>{featured.scope}</p>
              )}
            </div>
            {canBid && (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={() => setRequestDialog(featured)}>
                  <PencilSimple size={15} /> Edit request
                </button>
                <button className="btn btn-secondary" onClick={() => setManualOpen(true)}>
                  <Plus size={15} /> Add bid
                </button>
                <button className="btn btn-primary" onClick={() => setRequestDialog("new")}>
                  New request
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!featured && canBid && (
        <div className="card" style={{ alignItems: "flex-start" }}>
          <div className="card-title">No bid requests yet</div>
          <p className="card-body">Open a request to start collecting and comparing quotes.</p>
          <button className="btn btn-primary" onClick={() => setRequestDialog("new")}>New request</button>
        </div>
      )}

      {/* ————— bids for the featured request ————— */}
      {featured && featured.bids.length > 0 && (
        <div className="grid-bids">
          {featured.bids.map((bid) => {
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

      {/* ————— local pro search ————— */}
      <div className="card">
        <div className="card-title">Find more local pros</div>
        <p className="card-body" style={{ margin: 0 }}>
          Search nearby contractors with ratings and reviews, then click a result to review it,
          note why it caught your eye, and attach it to a bid request.
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
                      {openRequests.length > 0 && (
                        <RequestSelect openRequests={openRequests} value={proTarget}
                          onChange={setProTarget} allowNew />
                      )}
                      {(proTarget === "new" || openRequests.length === 0) && (
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
                        <button className="btn btn-primary btn-block"
                          disabled={adding || (proTarget === "new" && !newJobTitle.trim())}
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

      {/* ————— all bids, paginated ————— */}
      <AllBidsSection requests={requests} canBid={canBid} onOpenBid={(b) => setEditBid(b)} />

      {/* ————— dialogs & toast ————— */}
      {editBid && (
        <BidDetailsDialog
          bid={editBid}
          openRequests={openRequests}
          allRequests={requests}
          onClose={() => setEditBid(null)}
          onDone={(msg) => { setEditBid(null); showToast(msg); router.refresh(); }}
        />
      )}
      {manualOpen && (
        <ManualBidDialog
          openRequests={openRequests}
          defaultRequestId={featured?.status === "open" ? featured.id : openRequests[0]?.id}
          contractors={contractors}
          requestCategory={featured?.category ?? null}
          onClose={() => setManualOpen(false)}
          onDone={(msg) => { setManualOpen(false); showToast(msg); router.refresh(); }}
        />
      )}
      {requestDialog && (
        <RequestDialog
          existing={requestDialog === "new" ? null : requestDialog}
          contractors={contractors}
          properties={properties}
          onClose={() => setRequestDialog(null)}
          onDone={(msg) => { setRequestDialog(null); showToast(msg); router.refresh(); }}
        />
      )}
      {scheduleBid && (
        <ScheduleBidDialog
          bid={scheduleBid}
          requestTitle={requests.find((r) => r.id === scheduleBid.bid_request_id)?.title ?? "Scheduled job"}
          onClose={() => setScheduleBid(null)}
          onDone={(msg) => { setScheduleBid(null); showToast(msg); router.refresh(); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ————— queue filter bar ————— */

function QueueFilterBar({
  filters, onChange, requests, properties,
}: {
  filters: QueueFilters;
  onChange: (f: QueueFilters) => void;
  requests: RequestEntry[];
  properties: PropertyOption[];
}) {
  const vendors = useMemo(
    () => [...new Set(requests.flatMap((r) => r.bids.map((b) => b.vendor_name)))].sort(),
    [requests]
  );
  const categories = useMemo(
    () => [...new Set(requests.map((r) => r.category).filter(Boolean))] as string[],
    [requests]
  );
  const set = (patch: Partial<QueueFilters>) => onChange({ ...filters, ...patch });
  const active = Object.values(filters).some((v) => v !== "");
  const selectStyle = { minHeight: 36, padding: "4px 10px", fontSize: 12.5, flex: "1 1 150px" } as const;

  return (
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
      <FunnelSimple size={15} style={{ color: "var(--color-accent-text)", flex: "none" }} />
      <select className="input" style={selectStyle} value={filters.contractor}
        onChange={(e) => set({ contractor: e.target.value })} aria-label="Filter by contractor">
        <option value="">All contractors</option>
        {vendors.map((v) => <option key={v}>{v}</option>)}
      </select>
      <select className="input" style={selectStyle} value={filters.property}
        onChange={(e) => set({ property: e.target.value })} aria-label="Filter by property">
        <option value="">All properties</option>
        {properties.map((p) => (
          <option key={p.id} value={String(p.id)}>{p.label}{p.address ? ` — ${p.address}` : ""}</option>
        ))}
      </select>
      <select className="input" style={selectStyle} value={filters.category}
        onChange={(e) => set({ category: e.target.value })} aria-label="Filter by category">
        <option value="">All categories</option>
        {categories.map((c) => <option key={c}>{c}</option>)}
      </select>
      <select className="input" style={{ ...selectStyle, flex: "0 1 120px" }} value={filters.priority}
        onChange={(e) => set({ priority: e.target.value })} aria-label="Filter by priority">
        <option value="">Any priority</option>
        <option value="high">High</option>
        <option value="normal">Normal</option>
        <option value="low">Low</option>
      </select>
      <input className="input num" type="number" placeholder="Bid $ min" min={0}
        style={{ ...selectStyle, flex: "0 1 104px" }} value={filters.costMin}
        onChange={(e) => set({ costMin: e.target.value })} aria-label="Minimum bid cost" />
      <input className="input num" type="number" placeholder="Bid $ max" min={0}
        style={{ ...selectStyle, flex: "0 1 104px" }} value={filters.costMax}
        onChange={(e) => set({ costMax: e.target.value })} aria-label="Maximum bid cost" />
      {active && (
        <button className="btn btn-ghost" onClick={() => onChange(EMPTY_FILTERS)}>
          <X size={13} /> Clear
        </button>
      )}
    </div>
  );
}

/* ————— request queue: running ticket list for property tasks ————— */

const STATUS_ORDER: Record<BidRequest["status"], number> = {
  open: 0, accepted: 1, scheduled: 2, closed: 3,
};
const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

function RequestQueue({
  requests, totalCount, featuredId, canBid, onSelect, onEdit, onNew, filterBar,
}: {
  requests: RequestEntry[];
  totalCount: number;
  featuredId: number | null;
  canBid: boolean;
  onSelect: (id: number) => void;
  onEdit: (r: RequestEntry) => void;
  onNew: () => void;
  filterBar: React.ReactNode;
}) {
  const sorted = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (s !== 0) return s;
        const p =
          (PRIORITY_ORDER[a.priority ?? "normal"] ?? 1) -
          (PRIORITY_ORDER[b.priority ?? "normal"] ?? 1);
        if (p !== 0) return p;
        return (b.posted_at ?? "").localeCompare(a.posted_at ?? "");
      }),
    [requests]
  );
  const counts = useMemo(() => {
    const c = { open: 0, accepted: 0, scheduled: 0, closed: 0 };
    for (const r of requests) c[r.status]++;
    return c;
  }, [requests]);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ticket size={17} style={{ color: "var(--color-accent-text)" }} />
          <div className="card-title">Request queue</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="tag tag-outline num">{counts.open} open</span>
          {counts.accepted > 0 && <span className="tag tag-accent num">{counts.accepted} accepted</span>}
          {counts.scheduled > 0 && <span className="tag tag-accent-2 num">{counts.scheduled} scheduled</span>}
          {counts.closed > 0 && <span className="tag tag-neutral num">{counts.closed} closed</span>}
        </div>
        <span style={{ flex: 1 }} />
        {canBid && (
          <button className="btn btn-primary" onClick={onNew}>
            <Plus size={15} /> New request
          </button>
        )}
      </div>
      <p className="card-body" style={{ margin: 0 }}>
        Property tasks queue here for bidding, then move to scheduling. Click a ticket to work
        its bids below.
      </p>
      {filterBar}
      {requests.length < totalCount && (
        <div className="text-muted" style={{ fontSize: 12 }}>
          Showing {requests.length} of {totalCount} tickets
        </div>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Task</th><th>Property</th><th>Category</th><th>Priority</th><th>Bids</th>
              <th style={{ textAlign: "right" }}>Best bid</th><th>Status</th>
              {canBid && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const prices = r.bids.filter((b) => b.price != null && b.status !== "declined");
              const best = prices.length ? Math.min(...prices.map((b) => b.price!)) : null;
              const isFeatured = r.id === featuredId;
              return (
                <tr
                  key={r.id}
                  onClick={() => onSelect(r.id)}
                  style={{
                    cursor: "pointer",
                    background: isFeatured
                      ? "color-mix(in srgb, var(--color-accent) 10%, transparent)"
                      : undefined,
                  }}
                  aria-selected={isFeatured}
                >
                  <td className="num text-muted" style={{ fontSize: 12 }}>#{r.id}</td>
                  <td style={{ fontSize: 13, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title}
                  </td>
                  <td className="text-muted" style={{ fontSize: 12, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.property_label ?? "—"}
                  </td>
                  <td>{r.category ? <span className="tag tag-accent-2">{r.category}</span> : <span className="text-muted">—</span>}</td>
                  <td>{priorityTag(r.priority) ?? <span className="text-muted" style={{ fontSize: 12.5 }}>Normal</span>}</td>
                  <td className="num">{r.bids.length}</td>
                  <td className="num-cell">{best != null ? money(best) : "—"}</td>
                  <td>{requestStatusTag(r.status)}</td>
                  {canBid && (
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                      <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
                        title="Edit request" onClick={() => onEdit(r)}>
                        <PencilSimple size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ————— all bids, paginated ————— */

const BIDS_PAGE_SIZE = 6;

function AllBidsSection({
  requests, canBid, onOpenBid,
}: {
  requests: RequestEntry[];
  canBid: boolean;
  onOpenBid: (bid: Bid) => void;
}) {
  const [page, setPage] = useState(0);
  const rows = useMemo(
    () =>
      requests.flatMap((r) =>
        r.bids.map((b) => ({ bid: b, requestTitle: r.title, posted: r.posted_at }))
      ),
    [requests]
  );
  const pages = Math.max(1, Math.ceil(rows.length / BIDS_PAGE_SIZE));
  const clamped = Math.min(page, pages - 1);
  const visible = rows.slice(clamped * BIDS_PAGE_SIZE, clamped * BIDS_PAGE_SIZE + BIDS_PAGE_SIZE);
  if (rows.length === 0) return null;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ListBullets size={16} style={{ color: "var(--color-accent-text)" }} />
        <div className="card-title">All bids</div>
        <span className="text-muted num" style={{ fontSize: 12, marginLeft: "auto" }}>
          {rows.length} total
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Vendor</th><th>Request</th><th>Status</th><th>Favorability</th><th>Notes</th>
              <th style={{ textAlign: "right" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ bid, requestTitle }) => (
              <tr key={bid.id}
                style={canBid ? { cursor: "pointer" } : undefined}
                onClick={canBid ? () => onOpenBid(bid) : undefined}
                title={canBid ? "Open bid details" : undefined}>
                <td style={{ fontSize: 13 }}>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{initials(bid.vendor_name)}</span>
                    {bid.vendor_name}
                  </span>
                </td>
                <td className="text-muted" style={{ fontSize: 12.5, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {requestTitle}
                </td>
                <td>{bidStatusTag(bid.status)}</td>
                <td>{favorableTag(bid.favorable) ?? <span className="text-muted">—</span>}</td>
                <td className="text-muted" style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bid.notes ?? "—"}
                </td>
                <td className="num-cell">{bid.price != null ? money(bid.price) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-icon" disabled={clamped === 0}
            onClick={() => setPage(clamped - 1)} aria-label="Previous page">
            <CaretLeft size={15} />
          </button>
          <span className="num text-muted" style={{ fontSize: 12 }}>
            Page {clamped + 1} of {pages}
          </span>
          <button className="btn btn-icon" disabled={clamped >= pages - 1}
            onClick={() => setPage(clamped + 1)} aria-label="Next page">
            <CaretRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ————— request create/edit dialog ————— */

function RequestDialog({
  existing, contractors, properties, onClose, onDone,
}: {
  existing: RequestEntry | null;
  contractors: BookContractor[];
  properties: PropertyOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [priority, setPriority] = useState<"low" | "normal" | "high">(existing?.priority ?? "normal");
  const [budget, setBudget] = useState(existing?.budget != null ? String(existing.budget) : "");
  const [closesAt, setClosesAt] = useState(existing?.closes_at ?? "");
  const [scope, setScope] = useState(existing?.scope ?? "");
  const [propertyId, setPropertyId] = useState<number | "">(
    existing?.property_id ?? properties[0]?.id ?? ""
  );
  const [attachId, setAttachId] = useState<number | "">("");
  const [status, setStatus] = useState<"open" | "closed">(
    existing?.status === "closed" ? "closed" : "open"
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const accepted = existing?.status === "accepted";

  // Contractors already on this request can't be attached twice.
  const alreadyOn = new Set(
    (existing?.bids ?? []).map((b) => b.vendor_name.toLowerCase())
  );
  const attachable = contractors
    .filter((c) => !alreadyOn.has(c.name.toLowerCase()))
    .sort((a, b) => {
      const am = category && a.trade === category ? 0 : 1;
      const bm = category && b.trade === category ? 0 : 1;
      return am - bm || a.name.localeCompare(b.name);
    });

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        scope: scope.trim() || null,
        category: category || null,
        priority,
        budget: budget === "" ? null : Number(budget),
        closes_at: closesAt || null,
        property_id: propertyId === "" ? null : propertyId,
        ...(existing && !accepted ? { status } : {}),
      };
      const res = await fetch(existing ? `/api/requests/${existing.id}` : "/api/requests", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      // Attach the chosen book contractor as an awaiting bid on this request.
      const requestId: number = existing ? existing.id : body.id;
      if (attachId !== "" && requestId) {
        const bidRes = await fetch("/api/bids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bid_request_id: requestId, contractor_id: attachId }),
        });
        if (!bidRes.ok) {
          const bidBody = await bidRes.json();
          setError(`Request saved, but attaching the contractor failed: ${bidBody.error ?? "unknown error"}`);
          return;
        }
      }
      onDone(existing ? "Request updated." : `Request opened: ${title.trim()}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${existing.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Delete failed");
        return;
      }
      onDone("Request deleted, along with its bids.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={existing ? "Edit request" : "New request"}>
        <div className="dialog-title">{existing ? "Edit request" : "New bid request"}</div>
        <div className="field">
          <label>Job title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Replace cedar privacy fence — 120 linear ft" autoFocus={!existing} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Uncategorized</option>
              {TRADES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Target budget ($, optional)</label>
            <input className="input num" type="number" min={0} value={budget}
              onChange={(e) => setBudget(e.target.value)} placeholder="No target" />
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Bids close</label>
            <input className="input" type="date" value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 5, color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}>
              Priority
            </label>
            <div className="seg" role="group" aria-label="Priority">
              {(["low", "normal", "high"] as const).map((p) => (
                <button key={p} type="button" className="seg-opt" aria-pressed={priority === p}
                  onClick={() => setPriority(p)}>
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Property</label>
            <select className="input" value={String(propertyId)}
              onChange={(e) => setPropertyId(e.target.value === "" ? "" : Number(e.target.value))}>
              {properties.length === 0 && <option value="">No properties</option>}
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.address ? ` — ${p.address}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Attach contractor from book</label>
            <select className="input" value={String(attachId)}
              onChange={(e) => setAttachId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">— None —</option>
              {attachable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.trade}{category && c.trade === category ? "  ◆ matches category" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Scope outline — what exactly is the job?</label>
          <textarea className="input" style={{ minHeight: 96 }} value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder={"Outline the work so every bidder prices the same job:\n• tear-out & haul away\n• materials & dimensions\n• site details, access, timing"} />
        </div>
        {existing && !accepted && (
          <div className="seg" role="group" aria-label="Status">
            <button type="button" className="seg-opt" aria-pressed={status === "open"}
              onClick={() => setStatus("open")}>
              Open for bids
            </button>
            <button type="button" className="seg-opt" aria-pressed={status === "closed"}
              onClick={() => setStatus("closed")}>
              Closed
            </button>
          </div>
        )}
        {accepted && (
          <p className="card-body" style={{ margin: 0 }}>
            A bid was accepted on this request, so its status is locked.
          </p>
        )}
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: existing ? "space-between" : "flex-end" }}>
          {existing && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12.5 }}>Delete request and its {existing.bids.length} bid{existing.bids.length === 1 ? "" : "s"}?</span>
                <button className="btn btn-danger" disabled={busy} onClick={remove}>
                  <Trash size={14} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size={14} /> Delete request
              </button>
            )
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={save}>
              {busy ? "Saving…" : existing ? "Save request" : "Open request"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ————— bid details: notes, favorability, edits, re-attachment, removal ————— */

function BidDetailsDialog({
  bid, openRequests, allRequests, onClose, onDone,
}: {
  bid: Bid;
  openRequests: RequestEntry[];
  allRequests: RequestEntry[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [notes, setNotes] = useState(bid.notes ?? "");
  const [favorable, setFavorable] = useState<0 | 1 | null>(
    bid.favorable === 1 ? 1 : bid.favorable === 0 ? 0 : null
  );
  const [price, setPrice] = useState(bid.price != null ? String(bid.price) : "");
  const [startDate, setStartDate] = useState(bid.start_date ?? "");
  const [target, setTarget] = useState<number | "new">(bid.bid_request_id);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The bid's own request plus any open requests it could move to.
  const attachable = useMemo(() => {
    const seen = new Set<number>();
    return [
      ...allRequests.filter((r) => r.id === bid.bid_request_id),
      ...openRequests,
    ].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  }, [allRequests, openRequests, bid.bid_request_id]);

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
          ...(typeof target === "number" && target !== bid.bid_request_id
            ? { bid_request_id: target }
            : {}),
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
        {attachable.length > 1 && (
          <RequestSelect openRequests={attachable} value={target}
            onChange={(v) => { if (v !== "new") setTarget(v); }} allowNew={false} />
        )}
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

/* ————— manual bid entry ————— */

function ManualBidDialog({
  openRequests, defaultRequestId, contractors, requestCategory, onClose, onDone,
}: {
  openRequests: RequestEntry[];
  defaultRequestId: number | undefined;
  contractors: BookContractor[];
  requestCategory: string | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [vendor, setVendor] = useState("");
  const [bookId, setBookId] = useState<number | "">("");
  const [price, setPrice] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");
  const [favorable, setFavorable] = useState<0 | 1 | null>(null);
  const [target, setTarget] = useState<number | "new">(defaultRequestId ?? "new");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Contractors whose trade matches the request's category surface first.
  const sortedBook = useMemo(
    () =>
      [...contractors].sort((a, b) => {
        const am = requestCategory && a.trade === requestCategory ? 0 : 1;
        const bm = requestCategory && b.trade === requestCategory ? 0 : 1;
        return am - bm || a.name.localeCompare(b.name);
      }),
    [contractors, requestCategory]
  );
  const chosen = bookId === "" ? null : contractors.find((c) => c.id === bookId) ?? null;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/bids", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(chosen ? { contractor_id: chosen.id } : { vendor_name: vendor.trim() }),
          price: price === "" ? null : Number(price),
          start_date: startDate || null,
          notes: notes.trim() || null,
          favorable,
          ...(target !== "new" ? { bid_request_id: target } : {}),
          ...(target === "new" && title.trim() ? { title: title.trim() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not add bid");
        return;
      }
      onDone(`${chosen?.name ?? vendor.trim()} added to bids.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add bid manually">
        <div className="dialog-title">Add bid</div>
        <p className="card-body" style={{ margin: 0 }}>
          Attach a contractor from your book, or enter a quote you collected by phone, text, or in
          person.
        </p>
        {contractors.length > 0 && (
          <div className="field">
            <label>From your contractor book</label>
            <select
              className="input"
              value={String(bookId)}
              onChange={(e) => {
                setBookId(e.target.value === "" ? "" : Number(e.target.value));
                setError(null);
              }}
            >
              <option value="">— Enter a name manually —</option>
              {sortedBook.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.trade}
                  {requestCategory && c.trade === requestCategory ? "  ◆ matches category" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        {!chosen && (
          <div className="field">
            <label>Contractor / company name</label>
            <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)}
              placeholder="e.g. Mesa Verde Fence & Gate" autoFocus={contractors.length === 0} />
          </div>
        )}
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
        {openRequests.length > 0 && (
          <RequestSelect openRequests={openRequests} value={target} onChange={setTarget} allowNew />
        )}
        {(target === "new" || openRequests.length === 0) && (
          <div className="field">
            <label>Job title for the new bid request</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fence replacement" />
          </div>
        )}
        <div className="field">
          <label>Notes — why they were called</label>
          <textarea className="input" style={{ minHeight: 64 }}
            value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Did the neighbor's fence last spring; quoted over the phone" />
        </div>
        <FavorableSeg value={favorable} onChange={setFavorable} />
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary"
            disabled={busy || (!chosen && !vendor.trim()) || (target === "new" && !title.trim())}
            onClick={save}>
            {busy ? "Adding…" : "Add bid"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————— add a bid to the schedule ————— */

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
          bid_id: bid.id,
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

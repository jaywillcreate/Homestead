"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, ChatCircle, MapPin } from "@phosphor-icons/react";
import { money, shortDate, initials } from "@/lib/format";
import type { Bid, BidRequest } from "@/lib/types";
import type { LocalPro, ZipLocation } from "@/lib/discovery";

type Request = (BidRequest & { bids: Bid[] }) | null;

function badgeTag(badge: string | null) {
  if (!badge) return null;
  if (badge === "Best price") return <span className="tag tag-warn-fill">Best price</span>;
  if (badge === "Top rated") return <span className="tag tag-accent-2">Top rated</span>;
  if (badge === "In your book") return <span className="tag tag-accent">In your book</span>;
  return <span className="tag tag-outline">{badge}</span>;
}

export function DiscoverView({ request, canBid }: { request: Request; canBid: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<LocalPro[] | null>(null);
  const [source, setSource] = useState<string>("");
  const [location, setLocation] = useState<ZipLocation | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Remember the last ZIP the household searched from.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("homestead-zip");
      if (saved) setZip(saved);
    } catch {}
  }, []);

  const priced = request?.bids.filter((b) => b.price != null) ?? [];
  const avg = priced.length ? priced.reduce((a, b) => a + (b.price ?? 0), 0) / priced.length : 0;

  async function search() {
    if (!query.trim()) return;
    const zipTrim = zip.trim();
    if (zipTrim && !/^\d{5}$/.test(zipTrim)) {
      setZipError("Enter a 5-digit ZIP code");
      return;
    }
    setZipError(null);
    setSearching(true);
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

  async function acceptBid(bid: Bid) {
    const res = await fetch(`/api/bids/${bid.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "accept" }),
    });
    if (res.ok) {
      setToast(`Accepted ${bid.vendor_name}'s bid — other bids declined.`);
      setTimeout(() => setToast(null), 3500);
      router.refresh();
    }
  }

  return (
    <>
      {request && (
        <div className="card">
          <div className="kicker">Open request</div>
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <h4>{request.title}</h4>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                Posted {shortDate(request.posted_at?.slice(0, 10))} ·{" "}
                {request.bids.filter((b) => b.status !== "awaiting").length} of {request.bids.length} bids returned
                {request.closes_at ? ` · closes ${shortDate(request.closes_at)}` : ""}
                {request.status === "accepted" ? " · bid accepted" : ""}
              </div>
              {request.scope && <p className="card-body" style={{ marginTop: 8, maxWidth: "70ch" }}>{request.scope}</p>}
            </div>
            {canBid && (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-secondary">Edit scope</button>
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
              <div key={bid.id} className="card"
                style={{ boxShadow: known ? "0 0 0 1px var(--color-accent), var(--shadow-sm)" : undefined }}>
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
                  {bid.rating != null && <span className="tag tag-outline num">★ {bid.rating.toFixed(1)}</span>}
                  {bid.review_count != null && <span className="tag tag-outline num">{bid.review_count} reviews</span>}
                  {bid.start_date && <span className="tag tag-outline">Start {shortDate(bid.start_date)}</span>}
                </div>
                {bid.review_excerpt && (
                  <p className="card-body" style={{ fontStyle: "italic", margin: 0 }}>{bid.review_excerpt}</p>
                )}
                <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "auto", paddingTop: "var(--space-2)" }}>
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <div className="card-title">Find more local pros</div>
        <p className="card-body" style={{ margin: 0 }}>
          Search nearby contractors with ratings and reviews, then invite them to bid so you can compare pricing.
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
            <div className="grid-bids">
              {results.map((p, i) => (
                <div key={i} className="card">
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{initials(p.name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="card-title" style={{ fontSize: 15 }}>{p.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{p.distance_note ?? "Nearby"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {p.rating != null && <span className="tag tag-outline num">★ {p.rating.toFixed(1)}</span>}
                    {p.review_count != null && <span className="tag tag-outline num">{p.review_count} reviews</span>}
                  </div>
                  {p.review_excerpt && (
                    <p className="card-body" style={{ fontStyle: "italic", margin: 0 }}>{p.review_excerpt}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

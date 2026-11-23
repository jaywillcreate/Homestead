"use client";

import { useEffect, useState } from "react";
import {
  Storefront, MagnifyingGlass, ArrowSquareOut, MapPin, Phone, X, Check,
} from "@phosphor-icons/react";
import { money } from "@/lib/format";
import { retailerLinks } from "@/lib/retailers";
import type { NearbyStore, StoresResult } from "@/lib/stores";
import type { VendorProduct, CatalogResult } from "@/lib/vendor-catalog";

export interface ChosenStore {
  id: string;
  name: string;
}

/** Stores near a ZIP. Choosing a Home Depot with a known store number scopes stock lookups to it. */
export function StoresPanel({
  zip, chosen, onChoose,
}: {
  zip: string;
  chosen: ChosenStore | null;
  onChoose: (store: ChosenStore | null) => void;
}) {
  const [result, setResult] = useState<StoresResult | null>(null);
  const [loadedZip, setLoadedZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const valid = /^\d{5}$/.test(zip);

  async function load() {
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials/stores?zip=${zip}`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Store lookup failed."); return; }
      setResult(body);
      setLoadedZip(zip);
      setShowAll(false);
      if (body.error) setError(body.error);
    } catch {
      setError("Store lookup failed — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const stale = result != null && loadedZip !== zip;
  const stores: NearbyStore[] = result?.stores ?? [];
  const shown = showAll ? stores : stores.slice(0, 6);

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Storefront size={17} style={{ color: "var(--color-accent-text)" }} />
        <div className="card-title" style={{ flex: 1 }}>
          Stores near {valid ? zip : "your ZIP"}
          {result?.location && !stale ? ` · ${result.location.city}, ${result.location.state}` : ""}
        </div>
        <button className="btn btn-secondary" disabled={!valid || loading} onClick={load}>
          <MapPin size={14} /> {loading ? "Looking…" : result && !stale ? "Refresh" : "Find stores"}
        </button>
      </div>
      {!valid && (
        <p className="card-body" style={{ margin: 0 }}>Enter a 5-digit ZIP code above to list nearby building-supply stores.</p>
      )}
      {error && <div className="field-error">{error}</div>}
      {result && !stale && stores.length === 0 && !error && (
        <p className="card-body" style={{ margin: 0 }}>No stores found within about 15 miles of {loadedZip}.</p>
      )}
      {!stale && shown.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "var(--space-3)" }}>
          {shown.map((s, i) => {
            const isChosen = chosen != null && s.home_depot_store_id === chosen.id;
            return (
              <div key={i} style={{
                border: `1px solid ${isChosen ? "var(--color-accent)" : "var(--surface-variant)"}`,
                borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5,
              }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ flex: 1, fontSize: 13.5 }}>{s.name}</strong>
                  <span className="num text-muted">{s.distance_mi.toFixed(1)} mi</span>
                </div>
                <div className="text-muted">{s.kind}{s.address ? ` · ${s.address}` : ""}</div>
                {s.hours && <div className="text-muted" style={{ fontSize: 11.5 }}>Hours: {s.hours}</div>}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                  <a href={s.maps_url} target="_blank" rel="noreferrer">Map <ArrowSquareOut size={10} /></a>
                  {s.website && /^https?:\/\//.test(s.website) && (
                    <a href={s.website} target="_blank" rel="noreferrer">Website <ArrowSquareOut size={10} /></a>
                  )}
                  {s.phone && <a href={`tel:${s.phone}`}><Phone size={10} /> {s.phone}</a>}
                  {s.home_depot_store_id && (
                    <button className="btn btn-ghost" style={{ minHeight: 24, padding: "0 8px", fontSize: 11.5, marginLeft: "auto" }}
                      onClick={() => onChoose(isChosen ? null : { id: s.home_depot_store_id!, name: s.name })}
                      title="Show this store's pickup stock in product searches">
                      {isChosen ? <><Check size={11} /> My store</> : "Use for stock"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!stale && stores.length > 6 && (
        <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${stores.length}`}
        </button>
      )}
      {result && !stale && stores.length > 0 && (
        <span className="text-muted" style={{ fontSize: 11 }}>
          {result.source === "google_places" ? "Store data from Google Places." : "Store data © OpenStreetMap contributors."}
        </span>
      )}
    </div>
  );
}

/**
 * Shop one material: live Home Depot listings priced for the ZIP (when the
 * catalog is connected), plus search links into the other retailers' sites.
 */
export function ProductPicker({
  initialQuery, zip, store, liveCatalog, onPick, onClose,
}: {
  initialQuery: string;
  zip: string;
  store: ChosenStore | null;
  liveCatalog: boolean;
  onPick: (p: VendorProduct) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [result, setResult] = useState<CatalogResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zipOk = /^\d{5}$/.test(zip);

  async function search(term: string) {
    if (!liveCatalog || !zipOk || term.trim().length < 2) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: term.trim(), zip });
      if (store) params.set("store_id", store.id);
      const res = await fetch(`/api/materials/products?${params}`);
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? "Catalog search failed."); return; }
      setResult(body);
      if (body.error) setError(body.error);
    } catch {
      setError("Catalog search failed — check your connection.");
    } finally {
      setLoading(false);
    }
  }

  // Search once on open with the material's name.
  useEffect(() => {
    search(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Shop this material"
        style={{ width: "min(720px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="dialog-title" style={{ fontSize: 20 }}>Shop this material</div>
          <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }} onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <form style={{ display: "flex", gap: "var(--space-2)" }} onSubmit={(e) => { e.preventDefault(); search(q); }}>
          <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)}
            aria-label="Product search" placeholder="e.g. 4x4x8 pressure treated post" autoFocus />
          {liveCatalog && (
            <button className="btn btn-primary" disabled={loading || !zipOk || q.trim().length < 2}>
              <MagnifyingGlass size={15} /> {loading ? "Searching…" : "Search"}
            </button>
          )}
        </form>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Open the search on:</span>
          {retailerLinks(q || initialQuery, zip).map((l) => (
            <a key={l.name} className="chip" href={l.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              {l.name} <ArrowSquareOut size={10} />
            </a>
          ))}
        </div>

        {!liveCatalog ? (
          <p className="card-body" style={{ margin: 0 }}>
            Live prices aren&apos;t connected yet. Add a <code>SERPAPI_API_KEY</code> to the site&apos;s
            environment to pull Home Depot listings — price, pickup stock and delivery for ZIP {zipOk ? zip : "…"} —
            straight into this list. Until then, the links above open each retailer&apos;s own search.
          </p>
        ) : !zipOk ? (
          <p className="card-body" style={{ margin: 0 }}>Enter a 5-digit ZIP on the Materials screen to see local prices.</p>
        ) : (
          <>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Home Depot prices for ZIP <span className="num">{zip}</span>
              {store ? ` · pickup stock at ${store.name}` : " · choose a Home Depot under “Stores near” to see pickup stock"}
            </div>
            {error && <div className="field-error">{error}</div>}
            {loading && <div className="skeleton" style={{ height: 12 }} />}
            {result && !loading && result.products.length === 0 && !error && (
              <p className="card-body" style={{ margin: 0 }}>No matching products. Try fewer or different words.</p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {!loading && result?.products.map((p) => (
                <div key={p.product_id || p.title} style={{
                  display: "flex", gap: 12, alignItems: "center", padding: "8px 10px",
                  border: "1px solid var(--surface-variant)", borderRadius: 10,
                }}>
                  {p.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"
                      style={{ width: 52, height: 52, objectFit: "contain", borderRadius: 6, background: "#fff", flex: "none" }} />
                  ) : <span style={{ width: 52, flex: "none" }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13 }}>{p.title}</div>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {[p.brand, p.model ? `Model ${p.model}` : null,
                        p.rating != null ? `★ ${p.rating}${p.reviews != null ? ` (${p.reviews})` : ""}` : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                    <div style={{ fontSize: 11.5 }}>
                      {p.pickup?.quantity != null ? (
                        <span className={p.pickup.quantity > 0 ? "" : "text-muted"}>
                          {p.pickup.quantity > 0 ? `${p.pickup.quantity} in stock` : "Out of stock"}
                          {p.pickup.store ? ` at ${p.pickup.store}` : ""}
                          {p.pickup.distance_mi != null ? ` (${p.pickup.distance_mi} mi)` : ""}
                        </span>
                      ) : <span className="text-muted">Pickup stock not reported</span>}
                      {p.free_delivery ? " · free delivery" : ""}
                      {p.url && (
                        <> · <a href={p.url} target="_blank" rel="noreferrer">View listing <ArrowSquareOut size={10} /></a></>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div className="num" style={{ fontSize: 15, fontWeight: 500 }}>
                      {p.price != null ? money(p.price, 2) : "—"}
                    </div>
                    {p.unit && <div className="text-muted" style={{ fontSize: 11 }}>per {p.unit}</div>}
                    <button className="btn btn-secondary" style={{ minHeight: 28, padding: "2px 10px", fontSize: 12, marginTop: 4 }}
                      disabled={p.price == null} onClick={() => onPick(p)}>
                      Use this price
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

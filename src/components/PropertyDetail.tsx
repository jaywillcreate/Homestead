"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, PencilSimple, Plus, Trash, Warning, ShieldCheck, FileText, PaintBucket, Wrench,
  ClockCounterClockwise, MapPin, Drop, Thermometer, House, Bank, UploadSimple, ArrowSquareOut, Info,
} from "@phosphor-icons/react";
import { money, shortDate, fileHref } from "@/lib/format";
import {
  ASSET_CATEGORIES, PAINT_SURFACES, DOCUMENT_KINDS, DOCUMENT_KIND_LABEL,
} from "@/lib/property-schema";
import type {
  PropertyProfile, PropertyAsset, PropertyPaint, PropertyDocument, PropertyPhoto, ScheduledEvent,
} from "@/lib/types";
import { FormDialog, sendJson, type FormSection } from "./FormDialog";
import { PropertyDialog } from "./PropertyDialog";

type Tab = "overview" | "inventory" | "documents" | "paint" | "history";

interface JobRow {
  id: number; title: string; trade: string | null; performed_on: string | null;
  amount: number; status: string; contractor_name: string | null;
}

const DAY = 86_400_000;
const daysUntil = (iso: string, today: string) =>
  Math.round((new Date(iso + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / DAY);

/** End of expected service life, as an ISO date, when both inputs are known. */
function lifeEnds(a: PropertyAsset): string | null {
  if (!a.installed_on || !a.expected_life_years) return null;
  return `${Number(a.installed_on.slice(0, 4)) + a.expected_life_years}${a.installed_on.slice(4)}`;
}

function ageLabel(iso: string | null, today: string): string {
  if (!iso) return "—";
  const years = -daysUntil(iso, today) / 365.25;
  if (years < 0) return shortDate(iso);
  return years < 1 ? "Under 1 yr" : `${Math.floor(years)} yr${Math.floor(years) === 1 ? "" : "s"}`;
}

function warrantyTag(a: PropertyAsset, today: string) {
  if (!a.warranty_expires) return <span className="text-muted">—</span>;
  const d = daysUntil(a.warranty_expires, today);
  if (d < 0) return <span className="tag tag-neutral">Expired {shortDate(a.warranty_expires)}</span>;
  if (d <= 90) return <span className="tag tag-warn">Ends in {d} day{d === 1 ? "" : "s"}</span>;
  return <span className="tag tag-accent">Until {shortDate(a.warranty_expires)}</span>;
}

const ASSET_SECTIONS: FormSection[] = [
  {
    fields: [
      { key: "name", label: "Item", required: true, full: true, placeholder: "e.g. Water heater, Refrigerator, Roof" },
      { key: "category", label: "Category", type: "select", options: ASSET_CATEGORIES, required: true },
      { key: "room", label: "Room / location", placeholder: "Garage" },
      { key: "brand", label: "Brand" },
      { key: "model", label: "Model number" },
      { key: "serial_number", label: "Serial number" },
      { key: "purchase_price", label: "Cost", type: "money" },
    ],
  },
  {
    title: "Age & warranty",
    hint: "Homestead flags warranties ending within 90 days and items near the end of their expected life.",
    fields: [
      { key: "installed_on", label: "Installed / purchased", type: "date" },
      { key: "warranty_expires", label: "Warranty ends", type: "date" },
      { key: "expected_life_years", label: "Expected life (years)", type: "number", placeholder: "e.g. 12" },
      { key: "notes", label: "Notes — filter size, paint code, service history", type: "textarea", full: true, maxLength: 2000 },
    ],
  },
];

const PAINT_SECTIONS: FormSection[] = [
  {
    fields: [
      { key: "room", label: "Room / area", required: true, placeholder: "Primary bedroom" },
      { key: "surface", label: "Surface", type: "select", options: PAINT_SURFACES },
      { key: "brand", label: "Brand & line", placeholder: "Sherwin-Williams Duration" },
      { key: "color_name", label: "Color name", placeholder: "Agreeable Gray" },
      { key: "color_code", label: "Color code", placeholder: "SW 7029" },
      { key: "finish", label: "Finish / sheen", placeholder: "Eggshell" },
      { key: "painted_on", label: "Painted on", type: "date" },
      { key: "notes", label: "Notes — store, formula, leftover cans", type: "textarea", full: true, maxLength: 2000 },
    ],
  },
];

export function PropertyDetail({
  property, assets, paints, documents, photos, jobs, events, spendByYear, propertyCount,
  today, canManage, canEdit,
}: {
  property: PropertyProfile & { job_count: number; lifetime_spend: number };
  assets: PropertyAsset[];
  paints: PropertyPaint[];
  documents: PropertyDocument[];
  photos: PropertyPhoto[];
  jobs: JobRow[];
  events: (ScheduledEvent & { contractor_name: string | null })[];
  spendByYear: { year: string; total: number; jobs: number }[];
  propertyCount: number;
  today: string;
  canManage: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const p = property;
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [assetDialog, setAssetDialog] = useState<"new" | PropertyAsset | null>(null);
  const [paintDialog, setPaintDialog] = useState<"new" | PropertyPaint | null>(null);
  const [docDialog, setDocDialog] = useState<PropertyDocument | null>(null);
  const [category, setCategory] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };
  const done = (msg: string) => { showToast(msg); router.refresh(); };

  // ————— what needs attention —————
  const alerts: { severity: "warn" | "info"; text: string; tab?: Tab }[] = [];
  if (p.insurance_renewal) {
    const d = daysUntil(p.insurance_renewal, today);
    if (d < 0) alerts.push({ severity: "warn", text: `Insurance renewal date (${shortDate(p.insurance_renewal)}) has passed — update the policy details.` });
    else if (d <= 60) alerts.push({ severity: "warn", text: `Homeowners insurance renews in ${d} day${d === 1 ? "" : "s"} (${shortDate(p.insurance_renewal)}).` });
  }
  for (const a of assets) {
    if (a.warranty_expires) {
      const d = daysUntil(a.warranty_expires, today);
      if (d >= 0 && d <= 90) alerts.push({ severity: "warn", tab: "inventory", text: `${a.name} warranty ends in ${d} day${d === 1 ? "" : "s"} — book any covered repairs now.` });
    }
    const end = lifeEnds(a);
    if (end) {
      const d = daysUntil(end, today);
      if (d < 0) alerts.push({ severity: "warn", tab: "inventory", text: `${a.name} is past its expected ${a.expected_life_years}-year life — plan for replacement.` });
      else if (d <= 365) alerts.push({ severity: "info", tab: "inventory", text: `${a.name} reaches its expected ${a.expected_life_years}-year life within a year.` });
    }
  }
  for (const doc of documents) {
    if (!doc.expires_on) continue;
    const d = daysUntil(doc.expires_on, today);
    const name = doc.title || doc.filename;
    if (d < 0) alerts.push({ severity: "warn", tab: "documents", text: `“${name}” expired ${shortDate(doc.expires_on)}.` });
    else if (d <= 60) alerts.push({ severity: "info", tab: "documents", text: `“${name}” expires in ${d} day${d === 1 ? "" : "s"}.` });
  }
  const overdue = events.filter((e) => e.scheduled_for < today);
  if (overdue.length) {
    alerts.push({ severity: "warn", text: `${overdue.length} scheduled task${overdue.length === 1 ? " is" : "s are"} overdue: ${overdue.map((e) => e.name).join(", ")}.` });
  }
  if (!p.water_shutoff && !p.gas_shutoff && !p.electrical_panel) {
    alerts.push({ severity: "info", text: "No emergency shutoff locations recorded yet — worth adding before you need them." });
  }

  // ————— value & yearly cost —————
  const carrying = (p.property_tax_annual ?? 0) + (p.insurance_premium ?? 0) + (p.hoa_dues_monthly ?? 0) * 12;
  const thisYear = spendByYear.find((y) => y.year === today.slice(0, 4))?.total ?? 0;
  const gain = p.estimated_value != null && p.purchase_price != null ? p.estimated_value - p.purchase_price : null;
  const cityLine = [p.city, p.state, p.zip].filter(Boolean).join(", ");
  const facts = [
    p.property_type,
    p.year_built ? `Built ${p.year_built}` : null,
    p.sqft ? `${p.sqft.toLocaleString()} sq ft` : null,
    p.lot_size ? `${p.lot_size} lot` : null,
    p.beds != null ? `${p.beds} bd` : null,
    p.baths != null ? `${p.baths} ba` : null,
  ].filter(Boolean) as string[];

  const shownAssets = category ? assets.filter((a) => a.category === category) : assets;
  const usedCategories = [...new Set(assets.map((a) => a.category))];
  const inventoryValue = assets.reduce((sum, a) => sum + (a.purchase_price ?? 0), 0);

  const TABS: [Tab, string, number | null][] = [
    ["overview", "Overview", null],
    ["inventory", "Systems & appliances", assets.length],
    ["documents", "Documents", documents.length],
    ["paint", "Paint & finishes", paints.length],
    ["history", "Maintenance history", p.job_count],
  ];

  return (
    <>
      <div>
        <Link href="/properties" className="btn btn-ghost"><ArrowLeft size={15} /> All properties</Link>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <span className="avatar" style={{ width: 54, height: 54, borderRadius: 12 }}><House size={24} /></span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h3>{p.label}</h3>
            <div className="text-muted" style={{ fontSize: 13, display: "flex", gap: 5, alignItems: "center" }}>
              <MapPin size={13} />
              {p.address ?? "No address yet"}{cityLine ? ` · ${cityLine}` : ""}
            </div>
          </div>
          {canManage && (
            <button className="btn btn-secondary" onClick={() => setEditOpen(true)}>
              <PencilSimple size={14} /> Edit profile
            </button>
          )}
        </div>
        {facts.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {facts.map((f) => <span key={f} className="tag tag-outline">{f}</span>)}
          </div>
        )}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }} role="tablist" aria-label="Property sections">
          {TABS.map(([key, label, count]) => (
            <button key={key} className="chip" role="tab" aria-selected={tab === key} aria-pressed={tab === key}
              onClick={() => setTab(key)}>
              {label}{count != null ? ` · ${count}` : ""}
            </button>
          ))}
        </div>
      </div>

      {/* ————————————————— Overview ————————————————— */}
      {tab === "overview" && (
        <>
          {alerts.length > 0 && (
            <div className="card">
              <div className="card-title">Needs attention</div>
              {alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                  {a.severity === "warn"
                    ? <Warning size={15} style={{ color: "var(--color-signal)", flex: "none", marginTop: 2 }} />
                    : <Info size={15} style={{ color: "var(--color-accent-text)", flex: "none", marginTop: 2 }} />}
                  <span style={{ flex: 1 }}>{a.text}</span>
                  {a.tab && (
                    <button className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px", fontSize: 12 }}
                      onClick={() => setTab(a.tab!)}>
                      View
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Bank size={16} style={{ color: "var(--color-accent-text)" }} />
                <div className="card-title">Value &amp; yearly cost</div>
              </div>
              <div className="fact-grid">
                {[
                  ["Estimated value", money(p.estimated_value)],
                  ["Purchase price", p.purchase_price != null ? `${money(p.purchase_price)}${p.purchase_date ? ` · ${p.purchase_date.slice(0, 4)}` : ""}` : "—"],
                  ["Change since purchase", gain != null ? `${gain >= 0 ? "+" : "−"}${money(Math.abs(gain))}` : "—"],
                  ["Fixed costs per year", carrying ? money(carrying) : "—"],
                  [`Maintenance in ${today.slice(0, 4)}`, money(thisYear)],
                  ["Maintenance, all time", money(p.lifetime_spend)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="fact-label">{label}</div>
                    <div className="fact-value num">{value}</div>
                  </div>
                ))}
              </div>
              {carrying > 0 && (
                <p className="card-body" style={{ margin: 0, fontSize: 12.5 }}>
                  Fixed costs: tax {money(p.property_tax_annual ?? 0)} + insurance {money(p.insurance_premium ?? 0)}
                  {p.hoa_dues_monthly ? ` + HOA ${money(p.hoa_dues_monthly * 12)}` : ""}.
                  {p.estimated_value && thisYear > 0
                    ? ` Maintenance this year is ${((thisYear / p.estimated_value) * 100).toFixed(1)}% of the home's estimated value.`
                    : ""}
                </p>
              )}
              {p.parcel_number && (
                <div className="text-muted" style={{ fontSize: 12 }}>Parcel / account <span className="num">{p.parcel_number}</span></div>
              )}
            </div>

            <div className="card">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <ShieldCheck size={16} style={{ color: "var(--color-accent-text)" }} />
                <div className="card-title">Insurance &amp; HOA</div>
              </div>
              {p.insurance_carrier || p.insurance_policy || p.insurance_renewal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  <div><strong>{p.insurance_carrier ?? "Carrier not set"}</strong></div>
                  {p.insurance_policy && <div className="text-muted">Policy <span className="num">{p.insurance_policy}</span></div>}
                  {p.insurance_renewal && <div className="text-muted">Renews {shortDate(p.insurance_renewal)}</div>}
                  {p.insurance_premium != null && <div className="text-muted">{money(p.insurance_premium)} per year</div>}
                </div>
              ) : (
                <p className="card-body" style={{ margin: 0 }}>No insurance details yet.</p>
              )}
              <div className="hr" />
              {p.hoa_name || p.hoa_dues_monthly != null || p.hoa_contact ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                  <div><strong>{p.hoa_name ?? "HOA"}</strong></div>
                  {p.hoa_dues_monthly != null && <div className="text-muted">{money(p.hoa_dues_monthly)} per month</div>}
                  {p.hoa_contact && <div className="text-muted" style={{ wordBreak: "break-word" }}>{p.hoa_contact}</div>}
                </div>
              ) : (
                <p className="card-body" style={{ margin: 0 }}>No HOA on file.</p>
              )}
            </div>
          </div>

          <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card">
              <div className="card-title">Emergency shutoffs</div>
              {[
                [<Drop size={14} key="w" />, "Water", p.water_shutoff],
                [<Thermometer size={14} key="g" />, "Gas", p.gas_shutoff],
                [<Wrench size={14} key="e" />, "Electrical panel", p.electrical_panel],
              ].map(([icon, label, value], i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13 }}>
                  <span style={{ color: "var(--color-accent-text)", marginTop: 2 }}>{icon}</span>
                  <div>
                    <div className="fact-label">{label}</div>
                    <div style={{ opacity: value ? 1 : 0.55 }}>{value ?? "Not recorded"}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">Core systems</div>
              {[
                ["Roof", p.roof_type], ["HVAC", p.hvac_type], ["Water heater", p.water_heater],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="fact-label">{label}</div>
                  <div style={{ fontSize: 13, opacity: value ? 1 : 0.55 }}>{value ?? "Not recorded"}</div>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setTab("inventory")}>
                See all {assets.length} tracked item{assets.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>

          {(events.length > 0 || p.notes) && (
            <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div className="card-title">Coming up</div>
                  <Link href="/schedule" className="btn btn-ghost">Schedule</Link>
                </div>
                {events.length === 0 && <p className="card-body" style={{ margin: 0 }}>Nothing scheduled.</p>}
                {events.map((e) => (
                  <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13 }}>
                    <span className="num text-muted" style={{ width: 92, flex: "none", fontSize: 12 }}>{shortDate(e.scheduled_for)}</span>
                    <span style={{ flex: 1 }}>{e.name}</span>
                    {e.scheduled_for < today && <span className="tag tag-warn">Overdue</span>}
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="card-title">Notes</div>
                <p className="card-body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{p.notes ?? "No notes yet."}</p>
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="card">
              <div className="card-title">Photos</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {photos.map((ph) => (
                  <a key={ph.id} href={fileHref(ph.stored_path)} target="_blank" rel="noreferrer" title={ph.caption ?? "Property photo"}
                    style={{ width: 132, height: 96, borderRadius: 10, overflow: "hidden", background: "var(--surface-variant)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fileHref(ph.stored_path)} alt={ph.caption ?? "Property photo"} loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </a>
                ))}
              </div>
              <span className="text-muted" style={{ fontSize: 12 }}>Add, caption or delete photos from the Properties list.</span>
            </div>
          )}
        </>
      )}

      {/* ————————————————— Inventory ————————————————— */}
      {tab === "inventory" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <div>
              <div className="card-title">Systems &amp; appliances</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {assets.length} item{assets.length === 1 ? "" : "s"}{inventoryValue ? ` · ${money(inventoryValue)} recorded cost` : ""}
              </div>
            </div>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setAssetDialog("new")}><Plus size={15} /> Add item</button>
            )}
          </div>
          {usedCategories.length > 1 && (
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button className="chip" aria-pressed={category === ""} onClick={() => setCategory("")}>All</button>
              {usedCategories.map((c) => (
                <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
          )}
          {assets.length === 0 ? (
            <p className="card-body" style={{ margin: 0 }}>
              Nothing tracked yet. Add the big-ticket items first — water heater, HVAC, roof, kitchen
              appliances — with their model and serial numbers, install dates and warranty end dates.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th><th>Location</th><th>Age</th><th>Warranty</th><th>Expected life</th>
                    {canEdit && <th aria-label="Edit" />}
                  </tr>
                </thead>
                <tbody>
                  {shownAssets.map((a) => {
                    const end = lifeEnds(a);
                    const left = end ? daysUntil(end, today) : null;
                    return (
                      <tr key={a.id}>
                        <td>
                          <div style={{ fontSize: 13.5 }}>{a.name}</div>
                          <div className="text-muted" style={{ fontSize: 11.5 }}>
                            {[a.category, a.brand, a.model ? `Model ${a.model}` : null, a.serial_number ? `S/N ${a.serial_number}` : null]
                              .filter(Boolean).join(" · ")}
                          </div>
                        </td>
                        <td style={{ fontSize: 13 }}>{a.room ?? "—"}</td>
                        <td className="num" title={a.installed_on ? `Installed ${shortDate(a.installed_on)}` : undefined}>
                          {ageLabel(a.installed_on, today)}
                        </td>
                        <td>{warrantyTag(a, today)}</td>
                        <td>
                          {left == null ? <span className="text-muted">—</span>
                            : left < 0 ? <span className="tag tag-warn">Past {a.expected_life_years} yrs</span>
                            : left <= 365 ? <span className="tag tag-warn">Under 1 yr left</span>
                            : <span className="num" style={{ fontSize: 13 }}>{Math.floor(left / 365.25)} yrs left</span>}
                        </td>
                        {canEdit && (
                          <td style={{ textAlign: "right" }}>
                            <button className="btn btn-icon" style={{ width: 28, height: 28, minHeight: 28 }}
                              title="Edit or delete" aria-label={`Edit ${a.name}`} onClick={() => setAssetDialog(a)}>
                              <PencilSimple size={13} />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ————————————————— Documents ————————————————— */}
      {tab === "documents" && (
        <div className="card">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FileText size={16} style={{ color: "var(--color-accent-text)" }} />
            <div className="card-title">Document vault</div>
          </div>
          {canEdit && <DocumentUploader propertyId={p.id} onDone={done} />}
          {documents.length === 0 ? (
            <p className="card-body" style={{ margin: 0 }}>
              No documents yet. Good ones to keep here: deed and closing papers, the insurance policy,
              tax statements, HOA rules, permits, inspection reports, warranties and manuals.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Document</th><th>Type</th><th>Added</th><th>Expires</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => {
                    const left = d.expires_on ? daysUntil(d.expires_on, today) : null;
                    return (
                      <tr key={d.id}>
                        <td>
                          <a href={fileHref(d.stored_path)} target="_blank" rel="noreferrer" style={{ fontSize: 13.5 }}>
                            {d.title || d.filename} <ArrowSquareOut size={11} />
                          </a>
                          <div className="text-muted" style={{ fontSize: 11.5 }}>
                            {d.title ? `${d.filename} · ` : ""}{(d.size / 1024 / 1024).toFixed(d.size > 1024 * 1024 ? 1 : 2)} MB
                          </div>
                        </td>
                        <td><span className="tag tag-outline">{DOCUMENT_KIND_LABEL[d.kind as keyof typeof DOCUMENT_KIND_LABEL] ?? d.kind}</span></td>
                        <td className="num">{shortDate(d.created_at.slice(0, 10))}</td>
                        <td>
                          {left == null ? <span className="text-muted">—</span>
                            : left < 0 ? <span className="tag tag-warn">Expired</span>
                            : left <= 60 ? <span className="tag tag-warn">{left} days</span>
                            : <span className="num" style={{ fontSize: 13 }}>{shortDate(d.expires_on)}</span>}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {canEdit && (
                            <button className="btn btn-icon" style={{ width: 28, height: 28, minHeight: 28 }}
                              title="Rename, re-file or delete" aria-label={`Edit ${d.title || d.filename}`} onClick={() => setDocDialog(d)}>
                              <PencilSimple size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ————————————————— Paint ————————————————— */}
      {tab === "paint" && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <PaintBucket size={16} style={{ color: "var(--color-accent-text)" }} />
              <div className="card-title">Paint &amp; finishes</div>
            </div>
            {canEdit && (
              <button className="btn btn-primary" onClick={() => setPaintDialog("new")}><Plus size={15} /> Add paint record</button>
            )}
          </div>
          {paints.length === 0 ? (
            <p className="card-body" style={{ margin: 0 }}>
              Record each room&apos;s brand, color code and sheen so touch-ups match and painters can quote without guessing.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Room</th><th>Surface</th><th>Color</th><th>Brand</th><th>Finish</th><th>Painted</th>
                    {canEdit && <th aria-label="Edit" />}
                  </tr>
                </thead>
                <tbody>
                  {paints.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 13.5 }}>{r.room}</td>
                      <td style={{ fontSize: 13 }}>{r.surface ?? "—"}</td>
                      <td style={{ fontSize: 13 }}>
                        {r.color_name ?? "—"}
                        {r.color_code && <span className="num text-muted" style={{ fontSize: 11.5 }}> · {r.color_code}</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{r.brand ?? "—"}</td>
                      <td style={{ fontSize: 13 }}>{r.finish ?? "—"}</td>
                      <td className="num">{shortDate(r.painted_on)}</td>
                      {canEdit && (
                        <td style={{ textAlign: "right" }}>
                          <button className="btn btn-icon" style={{ width: 28, height: 28, minHeight: 28 }}
                            title="Edit or delete" aria-label={`Edit ${r.room} paint record`} onClick={() => setPaintDialog(r)}>
                            <PencilSimple size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ————————————————— History ————————————————— */}
      {tab === "history" && (
        <>
          {spendByYear.length > 0 && (
            <div className="card">
              <div className="card-title">Spend by year</div>
              <div className="fact-grid">
                {spendByYear.map((y) => (
                  <div key={y.year}>
                    <div className="fact-label">{y.year} · {y.jobs} job{y.jobs === 1 ? "" : "s"}</div>
                    <div className="fact-value num">{money(y.total)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ClockCounterClockwise size={16} style={{ color: "var(--color-accent-text)" }} />
              <div className="card-title">Work done at this property</div>
            </div>
            {jobs.length === 0 ? (
              <p className="card-body" style={{ margin: 0 }}>
                No work recorded yet. Filing an invoice adds it here automatically.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr><th>Date</th><th>Work</th><th>Trade</th><th>Contractor</th><th style={{ textAlign: "right" }}>Amount</th></tr>
                  </thead>
                  <tbody>
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="num">{shortDate(j.performed_on)}</td>
                        <td style={{ fontSize: 13.5 }}>{j.title}</td>
                        <td style={{ fontSize: 13 }}>{j.trade ?? "—"}</td>
                        <td style={{ fontSize: 13 }}>{j.contractor_name ?? "—"}</td>
                        <td className="num-cell">{money(j.amount, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ————————————————— dialogs ————————————————— */}
      {editOpen && (
        <PropertyDialog
          existing={p}
          canDelete={canManage && propertyCount > 1}
          onClose={() => setEditOpen(false)}
          onDone={(msg, deleted) => {
            setEditOpen(false);
            if (deleted) { router.push("/properties"); router.refresh(); }
            else done(msg);
          }}
        />
      )}
      {assetDialog && (
        <ItemDialog
          kind="assets" noun="item" propertyId={p.id} sections={ASSET_SECTIONS}
          existing={assetDialog === "new" ? null : assetDialog}
          defaults={{ category: "Appliance" }}
          onClose={() => setAssetDialog(null)}
          onDone={(msg) => { setAssetDialog(null); done(msg); }}
        />
      )}
      {paintDialog && (
        <ItemDialog
          kind="paints" noun="paint record" propertyId={p.id} sections={PAINT_SECTIONS}
          existing={paintDialog === "new" ? null : paintDialog}
          onClose={() => setPaintDialog(null)}
          onDone={(msg) => { setPaintDialog(null); done(msg); }}
        />
      )}
      {docDialog && (
        <FormDialog
          title="Document details"
          sections={[{
            fields: [
              { key: "title", label: "Title", full: true, placeholder: docDialog.filename },
              { key: "kind", label: "Type", type: "select", options: DOCUMENT_KINDS, required: true },
              { key: "expires_on", label: "Expires / renews", type: "date" },
            ],
          }]}
          initial={docDialog as unknown as Record<string, string | number | null>}
          submitLabel="Save"
          onClose={() => setDocDialog(null)}
          onSubmit={async (payload) => {
            const problem = await sendJson(`/api/properties/${p.id}/documents/${docDialog.id}`, "PATCH", payload);
            if (!problem) { setDocDialog(null); done("Document updated."); }
            return problem;
          }}
          deleteLabel="Delete document"
          onDelete={async () => {
            const problem = await sendJson(`/api/properties/${p.id}/documents/${docDialog.id}`, "DELETE");
            if (!problem) { setDocDialog(null); done("Document deleted."); }
            return problem;
          }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/** Add / edit / delete dialog shared by inventory items and paint records. */
function ItemDialog({
  kind, noun, propertyId, sections, existing, defaults, onClose, onDone,
}: {
  kind: "assets" | "paints";
  noun: string;
  propertyId: number;
  sections: FormSection[];
  existing: { id: number } | null;
  defaults?: Record<string, string>;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const base = `/api/properties/${propertyId}/items/${kind}`;
  const label = noun[0].toUpperCase() + noun.slice(1);
  return (
    <FormDialog
      title={existing ? `Edit ${noun}` : `Add ${noun}`}
      sections={sections}
      initial={(existing as unknown as Record<string, string | number | null> | null) ?? defaults ?? null}
      submitLabel={existing ? "Save" : `Add ${noun}`}
      onClose={onClose}
      onSubmit={async (payload) => {
        const problem = await sendJson(existing ? `${base}/${existing.id}` : base, existing ? "PATCH" : "POST", payload);
        if (!problem) onDone(existing ? `${label} updated.` : `${label} added.`);
        return problem;
      }}
      deleteLabel={`Delete ${noun}`}
      onDelete={existing ? async () => {
        const problem = await sendJson(`${base}/${existing.id}`, "DELETE");
        if (!problem) onDone(`${label} deleted.`);
        return problem;
      } : undefined}
    />
  );
}

function DocumentUploader({ propertyId, onDone }: { propertyId: number; onDone: (msg: string) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("other");
  const [title, setTitle] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: File[]) {
    setError(null);
    setBusy(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        if (title.trim() && files.length === 1) form.append("title", title.trim());
        if (expires) form.append("expires_on", expires);
        const res = await fetch(`/api/properties/${propertyId}/documents`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(`${file.name}: ${body.error ?? "upload failed"}`);
          return;
        }
      }
      setTitle("");
      setExpires("");
      onDone(`${files.length} document${files.length === 1 ? "" : "s"} filed.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
      <div className="field" style={{ flex: "1 1 150px" }}>
        <label htmlFor="doc-kind">Type</label>
        <select id="doc-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_LABEL[k]}</option>)}
        </select>
      </div>
      <div className="field" style={{ flex: "2 1 200px" }}>
        <label htmlFor="doc-title">Title (optional)</label>
        <input id="doc-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. 2026 homeowners policy" />
      </div>
      <div className="field" style={{ flex: "1 1 150px" }}>
        <label htmlFor="doc-expires">Expires / renews (optional)</label>
        <input id="doc-expires" className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
        <UploadSimple size={15} /> {busy ? "Uploading…" : "Choose file"}
      </button>
      <input ref={fileInput} type="file" hidden multiple
        accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) await upload(files);
        }} />
      {error && <div className="field-error" style={{ flexBasis: "100%" }}>{error}</div>}
      <span className="text-muted" style={{ fontSize: 12, flexBasis: "100%" }}>PDF or image, up to 25 MB each.</span>
    </div>
  );
}

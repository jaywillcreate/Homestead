"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Buildings, Plus, PencilSimple, Trash, MapPin, Thermometer, Drop, House,
  Camera, X,
} from "@phosphor-icons/react";
import { money, fileHref } from "@/lib/format";
import { PROPERTY_TYPES, type PropertyProfile, type PropertyPhoto } from "@/lib/types";

type PropertyWithStats = PropertyProfile & {
  job_count: number;
  lifetime_spend: number;
  open_requests: number;
  upcoming_events: number;
  photos: PropertyPhoto[];
};

export function PropertiesView({
  properties, canManage, canUpload,
}: {
  properties: PropertyWithStats[];
  canManage: boolean;
  canUpload: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"new" | PropertyWithStats | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photo: PropertyPhoto; propertyId: number } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function uploadPhotos(propertyId: number, files: File[]) {
    setUploadBusy(true);
    try {
      let failed: string | null = null;
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("caption", file.name.replace(/\.[^.]+$/, ""));
        const res = await fetch(`/api/properties/${propertyId}/photos`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json();
          failed = body.error ?? "Upload failed";
          break;
        }
      }
      showToast(failed ?? `${files.length} photo${files.length === 1 ? "" : "s"} added.`);
      router.refresh();
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Buildings size={18} style={{ color: "var(--color-accent-text)" }} />
          <h5>
            {properties.length} propert{properties.length === 1 ? "y" : "ies"} on file
          </h5>
        </div>
        <span style={{ flex: 1 }} />
        {canManage && (
          <button className="btn btn-primary" onClick={() => setDialog("new")}>
            <Plus size={15} /> Add property
          </button>
        )}
      </div>
      <p className="card-body" style={{ margin: 0 }}>
        Property profiles feed the rest of Homestead — bid requests are assigned to a property,
        and its systems details help contractors quote accurately.
      </p>

      <div className="grid-directory">
        {properties.map((p) => {
          const cityLine = [p.city, p.state, p.zip].filter(Boolean).join(", ");
          const facts = [
            p.property_type,
            p.year_built ? `Built ${p.year_built}` : null,
            p.sqft ? `${p.sqft.toLocaleString()} sq ft` : null,
            p.lot_size ? `${p.lot_size} lot` : null,
            p.beds != null ? `${p.beds} bd` : null,
            p.baths != null ? `${p.baths} ba` : null,
          ].filter(Boolean) as string[];
          return (
            <div key={p.id} className="card">
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span className="avatar" style={{ width: 40, height: 40, fontSize: 15, borderRadius: 10 }}>
                  <House size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">{p.label}</div>
                  <div className="text-muted" style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                    <MapPin size={12} />
                    {p.address ?? "No address"}{cityLine ? ` · ${cityLine}` : ""}
                  </div>
                </div>
                {canManage && (
                  <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
                    title="Edit property" onClick={() => setDialog(p)}>
                    <PencilSimple size={14} />
                  </button>
                )}
              </div>

              {(p.photos.length > 0 || canUpload) && (
                <div style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center", paddingBottom: 2 }}>
                  {p.photos.map((ph) => (
                    <button key={ph.id} title={ph.caption ?? "Property photo"}
                      style={{ border: "none", padding: 0, cursor: "pointer", flex: "none", borderRadius: 8, overflow: "hidden", width: 72, height: 54, background: "var(--surface-variant)" }}
                      onClick={() => setLightbox({ photo: ph, propertyId: p.id })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileHref(ph.stored_path)} alt={ph.caption ?? "Property photo"}
                        loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                  {canUpload && (
                    <button className="btn btn-secondary" disabled={uploadBusy}
                      style={{ flex: "none", width: 72, height: 54, minHeight: 54, flexDirection: "column", gap: 2, fontSize: 10.5, padding: 4 }}
                      title="Add property photos"
                      onClick={() => { setUploadTarget(p.id); fileInput.current?.click(); }}>
                      <Camera size={16} />
                      {uploadBusy && uploadTarget === p.id ? "Adding…" : "Add photos"}
                    </button>
                  )}
                </div>
              )}

              {facts.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {facts.map((f) => <span key={f} className="tag tag-outline">{f}</span>)}
                </div>
              )}

              {(p.roof_type || p.hvac_type || p.water_heater) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                  {p.roof_type && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <House size={13} style={{ color: "var(--color-accent-text)" }} /> Roof: {p.roof_type}
                    </div>
                  )}
                  {p.hvac_type && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Thermometer size={13} style={{ color: "var(--color-accent-text)" }} /> HVAC: {p.hvac_type}
                    </div>
                  )}
                  {p.water_heater && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Drop size={13} style={{ color: "var(--color-accent-text)" }} /> Water heater: {p.water_heater}
                    </div>
                  )}
                </div>
              )}

              {p.notes && (
                <p className="card-body" style={{ margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.notes}
                </p>
              )}

              <div className="hr" style={{ margin: "2px 0" }} />
              <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
                {[
                  ["Jobs", String(p.job_count)],
                  ["Lifetime spend", money(p.lifetime_spend)],
                  ["Open tickets", String(p.open_requests)],
                  ["Upcoming", String(p.upcoming_events)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="fact-label">{label}</div>
                    <div className="fact-value num">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={fileInput} type="file" hidden multiple accept="image/*"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length && uploadTarget != null) await uploadPhotos(uploadTarget, files);
          e.target.value = "";
        }}
      />

      {dialog && (
        <PropertyDialog
          existing={dialog === "new" ? null : dialog}
          canDelete={canManage && properties.length > 1}
          onClose={() => setDialog(null)}
          onDone={(msg) => { setDialog(null); showToast(msg); router.refresh(); }}
        />
      )}
      {lightbox && (
        <PropertyPhotoDialog
          photo={lightbox.photo}
          propertyId={lightbox.propertyId}
          canUpload={canUpload}
          onClose={() => setLightbox(null)}
          onDone={(msg) => { setLightbox(null); showToast(msg); router.refresh(); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function PropertyPhotoDialog({
  photo, propertyId, canUpload, onClose, onDone,
}: {
  photo: PropertyPhoto;
  propertyId: number;
  canUpload: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: caption.trim() || null }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Save failed");
        return;
      }
      onDone("Photo updated.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/photos/${photo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Delete failed");
        return;
      }
      onDone("Photo deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Property photo"
        style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="dialog-title" style={{ fontSize: 20 }}>Property photo</div>
          <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
            onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div style={{ background: "var(--sunken)", borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", minHeight: 220 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileHref(photo.stored_path)} alt={photo.caption ?? "Property photo"}
            style={{ maxWidth: "100%", maxHeight: 420, objectFit: "contain" }} />
        </div>
        {canUpload ? (
          <>
            <div className="field">
              <label>Caption</label>
              <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder="What does this photo show?" />
            </div>
            {error && <div className="field-error">{error}</div>}
            <div className="dialog-actions" style={{ justifyContent: "space-between" }}>
              {confirmDelete ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5 }}>Delete this photo?</span>
                  <button className="btn btn-danger" disabled={busy} onClick={remove}>
                    <Trash size={14} /> Delete
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash size={14} /> Delete photo
                </button>
              )}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" disabled={busy} onClick={save}>
                  {busy ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="card-body" style={{ margin: 0 }}>{photo.caption ?? "No caption"}</p>
        )}
      </div>
    </div>
  );
}

function PropertyDialog({
  existing, canDelete, onClose, onDone,
}: {
  existing: PropertyProfile | null;
  canDelete: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    label: existing?.label ?? "",
    address: existing?.address ?? "",
    city: existing?.city ?? "",
    state: existing?.state ?? "",
    zip: existing?.zip ?? "",
    property_type: existing?.property_type ?? "",
    year_built: existing?.year_built != null ? String(existing.year_built) : "",
    sqft: existing?.sqft != null ? String(existing.sqft) : "",
    lot_size: existing?.lot_size ?? "",
    beds: existing?.beds != null ? String(existing.beds) : "",
    baths: existing?.baths != null ? String(existing.baths) : "",
    roof_type: existing?.roof_type ?? "",
    hvac_type: existing?.hvac_type ?? "",
    water_heater: existing?.water_heater ?? "",
    notes: existing?.notes ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        label: form.label.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        property_type: form.property_type || null,
        year_built: form.year_built === "" ? null : Number(form.year_built),
        sqft: form.sqft === "" ? null : Number(form.sqft),
        lot_size: form.lot_size.trim() || null,
        beds: form.beds === "" ? null : Number(form.beds),
        baths: form.baths === "" ? null : Number(form.baths),
        roof_type: form.roof_type.trim() || null,
        hvac_type: form.hvac_type.trim() || null,
        water_heater: form.water_heater.trim() || null,
        notes: form.notes.trim() || null,
      };
      const res = await fetch(existing ? `/api/properties/${existing.id}` : "/api/properties", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      onDone(existing ? "Property updated." : `Property added: ${payload.label}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/properties/${existing.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Delete failed");
        return;
      }
      onDone("Property removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={existing ? "Edit property" : "Add property"}
        style={{ width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="dialog-title">{existing ? "Edit property" : "Add property"}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Label</label>
            <input className="input" value={form.label} onChange={(e) => set("label", e.target.value)}
              placeholder="e.g. Primary residence, Lake house, Rental #2" autoFocus={!existing} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Street address</label>
            <input className="input" value={form.address} onChange={(e) => set("address", e.target.value)}
              placeholder="4218 Cedar Creek Ln" />
          </div>
          <div className="field">
            <label>City</label>
            <input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <div className="field">
              <label>State</label>
              <input className="input" value={form.state} onChange={(e) => set("state", e.target.value)}
                placeholder="TX" maxLength={20} />
            </div>
            <div className="field">
              <label>ZIP</label>
              <input className="input num" inputMode="numeric" maxLength={5} value={form.zip}
                onChange={(e) => set("zip", e.target.value.replace(/\D/g, ""))} />
            </div>
          </div>
          <div className="field">
            <label>Type</label>
            <select className="input" value={form.property_type}
              onChange={(e) => set("property_type", e.target.value)}>
              <option value="">—</option>
              {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Year built</label>
            <input className="input num" type="number" value={form.year_built}
              onChange={(e) => set("year_built", e.target.value)} placeholder="1998" />
          </div>
          <div className="field">
            <label>Square feet</label>
            <input className="input num" type="number" value={form.sqft}
              onChange={(e) => set("sqft", e.target.value)} placeholder="2450" />
          </div>
          <div className="field">
            <label>Lot size</label>
            <input className="input" value={form.lot_size}
              onChange={(e) => set("lot_size", e.target.value)} placeholder="0.28 acre" />
          </div>
          <div className="field">
            <label>Bedrooms</label>
            <input className="input num" type="number" value={form.beds}
              onChange={(e) => set("beds", e.target.value)} />
          </div>
          <div className="field">
            <label>Bathrooms</label>
            <input className="input num" type="number" step="0.5" value={form.baths}
              onChange={(e) => set("baths", e.target.value)} />
          </div>
          <div className="field">
            <label>Roof</label>
            <input className="input" value={form.roof_type}
              onChange={(e) => set("roof_type", e.target.value)} placeholder="Architectural shingle, 2019" />
          </div>
          <div className="field">
            <label>HVAC</label>
            <input className="input" value={form.hvac_type}
              onChange={(e) => set("hvac_type", e.target.value)} placeholder="Gas furnace + AC, 2021" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Water heater</label>
            <input className="input" value={form.water_heater}
              onChange={(e) => set("water_heater", e.target.value)} placeholder="50-gal gas, 2026" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Notes — access, gate codes, quirks</label>
            <textarea className="input" style={{ minHeight: 72 }} value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Gate code 4218 · crawlspace access on north side · sprinkler shutoff in garage" />
          </div>
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: existing && canDelete ? "space-between" : "flex-end" }}>
          {existing && canDelete && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12.5 }}>Remove this property?</span>
                <button className="btn btn-danger" disabled={busy} onClick={remove}>
                  <Trash size={14} /> Remove
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size={14} /> Remove property
              </button>
            )
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !form.label.trim()} onClick={save}>
              {busy ? "Saving…" : existing ? "Save property" : "Add property"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

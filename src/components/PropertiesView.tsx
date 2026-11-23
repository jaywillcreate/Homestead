"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Buildings, Plus, PencilSimple, Trash, MapPin, Thermometer, Drop, House,
  Camera, X, ArrowRight,
} from "@phosphor-icons/react";
import { money, fileHref } from "@/lib/format";
import type { PropertyProfile, PropertyPhoto } from "@/lib/types";
import { PropertyDialog } from "./PropertyDialog";

type PropertyWithStats = PropertyProfile & {
  job_count: number;
  lifetime_spend: number;
  open_requests: number;
  upcoming_events: number;
  asset_count: number;
  document_count: number;
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
        Each property has a full profile: systems and appliance inventory with warranty tracking,
        a document vault, paint records, value and yearly costs, emergency shutoffs, and its
        maintenance history.
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
                  <Link href={`/properties/${p.id}`} className="card-title" style={{ textDecoration: "none", color: "inherit" }}>
                    {p.label}
                  </Link>
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
                  ["Inventory", String(p.asset_count)],
                  ["Documents", String(p.document_count)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="fact-label">{label}</div>
                    <div className="fact-value num">{value}</div>
                  </div>
                ))}
              </div>
              <Link href={`/properties/${p.id}`} className="btn btn-secondary" style={{ justifyContent: "center", textDecoration: "none" }}>
                Open full profile <ArrowRight size={14} />
              </Link>
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

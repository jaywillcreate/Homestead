"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSimple, Trash, HouseLine } from "@phosphor-icons/react";
import { fileHref } from "@/lib/format";
import type { Brand } from "./NavRail";

export function BrandDialog({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(brand.name);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const shownLogo = removeLogo
    ? null
    : logoPreview ?? (brand.logo ? fileHref(brand.logo) : null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name);
      if (removeLogo) form.append("remove_logo", "1");
      else if (logoFile) form.append("logo", logoFile);
      const res = await fetch("/api/settings", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Household name & logo">
        <div className="dialog-title">Household name &amp; logo</div>
        <p className="card-body" style={{ margin: 0 }}>
          Shown in the navigation rail and on the sign-in screen for everyone in the household.
        </p>
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
          <span className="brand-mark" style={{ width: 56, height: 56, borderRadius: 14, overflow: "hidden", display: "grid", placeItems: "center", border: "1px solid var(--color-accent)", color: "var(--color-accent-text)" }}>
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Logo preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <HouseLine size={26} />
            )}
          </span>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
              <UploadSimple size={15} /> {shownLogo ? "Replace logo" : "Upload logo"}
            </button>
            {shownLogo && (
              <button className="btn btn-danger" onClick={() => { setRemoveLogo(true); setLogoFile(null); setLogoPreview(null); }}>
                <Trash size={14} /> Remove
              </button>
            )}
            <input
              ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setLogoFile(f);
                setRemoveLogo(false);
                setLogoPreview(URL.createObjectURL(f));
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>Household name</label>
          <input className="input" value={name} maxLength={40}
            onChange={(e) => setName(e.target.value)} placeholder="Homestead" />
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

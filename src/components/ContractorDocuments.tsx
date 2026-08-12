"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, Trash, UploadSimple } from "@phosphor-icons/react";
import { fileHref } from "@/lib/format";
import type { ContractorDocument } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  insurance: "Insurance", license: "License", warranty: "Warranty", other: "Other",
};

function fmtSize(bytes: number) {
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
}

function isImage(filename: string) {
  return /\.(jpe?g|png|webp|gif|heic)$/i.test(filename);
}

export function ContractorDocuments({
  contractorId, docs, canEdit,
}: {
  contractorId: number;
  docs: ContractorDocument[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(files: File[]) {
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", kind);
        const res = await fetch(`/api/contractors/${contractorId}/documents`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Upload failed — retry.");
          return;
        }
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contractors/${contractorId}/documents/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Delete failed");
        return;
      }
      setConfirmId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Documents</div>
      {docs.length === 0 && (
        <p className="card-body">
          {canEdit
            ? "No documents on file. Upload insurance certificates, license photos, or warranty scans."
            : "No documents on file."}
        </p>
      )}
      {docs.map((d) => {
        const Icon = isImage(d.filename) ? ImageIcon : FileText;
        const name = d.stored_path ? (
          <a href={fileHref(d.stored_path)} target="_blank" rel="noreferrer"
            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.filename}
          </a>
        ) : (
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {d.filename}
          </span>
        );
        return (
          <div key={d.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
            <Icon size={16} style={{ color: "var(--color-accent-text)", flex: "none" }} />
            {name}
            <span className="tag tag-outline" style={{ flex: "none" }}>{KIND_LABEL[d.kind] ?? d.kind}</span>
            <span className="text-muted num" style={{ fontSize: 11, flex: "none" }}>{fmtSize(d.size)}</span>
            {canEdit && (
              confirmId === d.id ? (
                <span style={{ display: "flex", gap: 4, flex: "none" }}>
                  <button className="btn btn-danger" style={{ minHeight: 26, padding: "2px 8px", fontSize: 11.5 }}
                    disabled={busy} onClick={() => remove(d.id)}>
                    Delete
                  </button>
                  <button className="btn btn-ghost" style={{ minHeight: 26, padding: "2px 8px", fontSize: 11.5 }}
                    onClick={() => setConfirmId(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="btn btn-icon" style={{ width: 24, height: 24, minHeight: 24, flex: "none" }}
                  title="Delete document" onClick={() => setConfirmId(d.id)}>
                  <Trash size={13} />
                </button>
              )
            )}
          </div>
        );
      })}
      {error && <div className="field-error">{error}</div>}
      {canEdit && (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <select className="input" style={{ minHeight: 34, padding: "4px 10px", fontSize: 12.5, flex: 1 }}
            value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Document kind">
            {Object.entries(KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <button className="btn btn-secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
            <UploadSimple size={15} /> {busy ? "Uploading…" : "Upload"}
          </button>
          <input ref={fileInput} type="file" hidden multiple
            accept="image/jpeg,image/png,image/webp,image/gif,image/heic,application/pdf"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) await upload(files);
              e.target.value = "";
            }} />
        </div>
      )}
    </div>
  );
}

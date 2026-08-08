"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  UploadSimple, ImageSquare, Plus, PencilSimple, Trash, X,
  CaretLeft, CaretRight, ArrowsClockwise, FolderPlus,
} from "@phosphor-icons/react";
import { shortDate, fileHref } from "@/lib/format";
import type { Job, JobPhoto } from "@/lib/types";

type SectionJob = Job & {
  contractor_name: string | null;
  invoice_number: string | null;
  has_invoice: boolean;
  photos: (JobPhoto & { sort_order: number | null })[];
};

interface ContractorOption {
  id: number;
  name: string;
}

const STAGES = ["before", "during", "after", "record"] as const;
const STAGE_CLASS: Record<string, string> = {
  before: "tag-neutral", during: "tag-accent-2", after: "tag-accent", record: "tag-outline",
};

export function PhotoGallery({
  jobs, contractors, canUpload,
}: {
  jobs: SectionJob[];
  contractors: ContractorOption[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [stageFilter, setStageFilter] = useState<string>("");
  const [sectionDialog, setSectionDialog] = useState<"new" | SectionJob | null>(null);
  const [photoDialog, setPhotoDialog] = useState<JobPhoto | null>(null);
  const [uploadTarget, setUploadTarget] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState("after");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  async function uploadFiles(files: File[]) {
    if (!uploadTarget) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        form.append("job_id", String(uploadTarget));
        form.append("stage", uploadStage);
        form.append("caption", file.name.replace(/\.[^.]+$/, ""));
        const res = await fetch("/api/photos", { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Upload failed — retry.");
          return;
        }
      }
      showToast(`${files.length} photo${files.length === 1 ? "" : "s"} added.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function reorder(section: SectionJob, index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= section.photos.length) return;
    const ids = section.photos.map((p) => p.id);
    [ids[index], ids[j]] = [ids[j], ids[index]];
    await fetch("/api/photos/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: section.id, ordered_ids: ids }),
    });
    router.refresh();
  }

  const visibleJobs = jobs
    .map((j) => ({
      ...j,
      shownPhotos: stageFilter ? j.photos.filter((p) => p.stage === stageFilter) : j.photos,
    }))
    .filter((j) => !stageFilter || j.shownPhotos.length > 0);

  return (
    <>
      {/* ————— organization bar ————— */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
        <button className="chip" aria-pressed={stageFilter === ""} onClick={() => setStageFilter("")}>
          All stages
        </button>
        {STAGES.map((s) => (
          <button key={s} className="chip" aria-pressed={stageFilter === s} onClick={() => setStageFilter(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {canUpload && (
          <button className="btn btn-primary" onClick={() => setSectionDialog("new")}>
            <FolderPlus size={15} /> New section
          </button>
        )}
      </div>
      {error && (
        <div className="card" style={{ borderLeft: "3px solid var(--color-signal)", padding: "var(--space-4) var(--space-6)" }}>
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {/* ————— sections ————— */}
      {visibleJobs.map((job) => (
        <section key={job.id} className="card" style={{ gap: "var(--space-4)" }}>
          <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <h5>
                {job.title} <span className="text-muted">· {job.contractor_name ?? "Self"}</span>
              </h5>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {shortDate(job.performed_on)}{job.location ? ` · ${job.location}` : ""}
                {job.invoice_number ? ` · Invoice ${job.invoice_number}` : ""}
                {" · "}{job.photos.length} photo{job.photos.length === 1 ? "" : "s"}
              </div>
            </div>
            {canUpload && (
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <select className="input" style={{ minHeight: 34, padding: "4px 10px", fontSize: 12.5, width: 96 }}
                  value={uploadTarget === job.id ? uploadStage : "after"}
                  onChange={(e) => { setUploadTarget(job.id); setUploadStage(e.target.value); }}
                  aria-label="Stage for new photos">
                  {STAGES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
                <button className="btn btn-secondary" disabled={busy}
                  onClick={() => { setUploadTarget(job.id); fileInput.current?.click(); }}>
                  <UploadSimple size={15} /> {busy && uploadTarget === job.id ? "Uploading…" : "Add photos"}
                </button>
                <button className="btn btn-icon" title="Edit section" onClick={() => setSectionDialog(job)}>
                  <PencilSimple size={15} />
                </button>
              </div>
            )}
          </div>

          {job.shownPhotos.length === 0 ? (
            <p className="card-body" style={{ margin: 0 }}>
              No photos yet — add before/during/after shots to build the record.
            </p>
          ) : (
            <div className="grid-photos">
              {job.shownPhotos.map((p) => {
                const fullIndex = job.photos.findIndex((x) => x.id === p.id);
                return (
                  <figure className="card photo-tile" key={p.id} style={{ margin: 0, boxShadow: "none", background: "var(--surface-variant)" }}>
                    <button
                      className="photo-area"
                      style={{ border: "none", padding: 0, cursor: "pointer", width: "100%" }}
                      onClick={() => setPhotoDialog(p)}
                      title="Open photo details"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileHref(p.stored_path)} alt={p.caption ?? "Job photo"} loading="lazy" />
                    </button>
                    <figcaption style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.caption ?? "—"}
                      </span>
                      <span className={`tag ${STAGE_CLASS[p.stage]}`} style={{ flex: "none" }}>
                        {p.stage[0].toUpperCase() + p.stage.slice(1)}
                      </span>
                      {canUpload && !stageFilter && (
                        <span style={{ display: "flex", gap: 1 }}>
                          <button className="btn btn-icon" style={{ width: 22, height: 22, minHeight: 22 }}
                            title="Move earlier" disabled={fullIndex === 0}
                            onClick={() => reorder(job, fullIndex, -1)}>
                            <CaretLeft size={11} />
                          </button>
                          <button className="btn btn-icon" style={{ width: 22, height: 22, minHeight: 22 }}
                            title="Move later" disabled={fullIndex === job.photos.length - 1}
                            onClick={() => reorder(job, fullIndex, 1)}>
                            <CaretRight size={11} />
                          </button>
                        </span>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {visibleJobs.length === 0 && (
        <div className="card" style={{ alignItems: "center", padding: "var(--space-8)", gap: "var(--space-3)" }}>
          <ImageSquare size={28} style={{ opacity: 0.5 }} />
          <p className="card-body">
            {stageFilter ? "No photos match this stage." : "No photo sections yet. Create one to start the record."}
          </p>
        </div>
      )}

      <input
        ref={fileInput} type="file" hidden multiple accept="image/*"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) await uploadFiles(files);
          e.target.value = "";
        }}
      />

      {sectionDialog && (
        <SectionDialog
          existing={sectionDialog === "new" ? null : sectionDialog}
          contractors={contractors}
          onClose={() => setSectionDialog(null)}
          onDone={(msg) => { setSectionDialog(null); showToast(msg); router.refresh(); }}
        />
      )}
      {photoDialog && (
        <PhotoDialog
          photo={photoDialog}
          sections={jobs.map((j) => ({ id: j.id, title: j.title }))}
          canUpload={canUpload}
          onClose={() => setPhotoDialog(null)}
          onDone={(msg) => { setPhotoDialog(null); showToast(msg); router.refresh(); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

/* ————— section create / edit / delete ————— */

function SectionDialog({
  existing, contractors, onClose, onDone,
}: {
  existing: SectionJob | null;
  contractors: ContractorOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [contractorId, setContractorId] = useState<number | "">(existing?.contractor_id ?? "");
  const [date, setDate] = useState(existing?.performed_on ?? new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState(existing?.location ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        contractor_id: contractorId === "" ? null : contractorId,
        performed_on: date || null,
        location: location.trim() || null,
      };
      const res = await fetch(
        existing ? `/api/photo-sections/${existing.id}` : "/api/photo-sections",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Save failed");
        return;
      }
      onDone(existing ? "Section updated." : `Section created: ${payload.title}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/photo-sections/${existing.id}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Delete failed");
        return;
      }
      onDone("Section deleted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={existing ? "Edit section" : "New photo section"}>
        <div className="dialog-title">{existing ? "Edit section" : "New photo section"}</div>
        <div className="field">
          <label>Section title</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fence replacement — before & after" autoFocus={!existing} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Contractor</label>
            <select className="input" value={String(contractorId)}
              onChange={(e) => setContractorId(e.target.value === "" ? "" : Number(e.target.value))}>
              <option value="">Self / none</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Date</label>
            <input className="input" type="date" value={date ?? ""} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Location (optional)</label>
          <input className="input" value={location} onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. North property line, garage" />
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: existing ? "space-between" : "flex-end" }}>
          {existing && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12.5 }}>
                  Delete section and its {existing.photos.length} photo{existing.photos.length === 1 ? "" : "s"}?
                </span>
                <button className="btn btn-danger" disabled={busy} onClick={remove}>
                  <Trash size={14} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size={14} /> Delete section
              </button>
            )
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={save}>
              {busy ? "Saving…" : existing ? "Save section" : "Create section"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ————— photo details: view, edit, replace, move, delete ————— */

function PhotoDialog({
  photo, sections, canUpload, onClose, onDone,
}: {
  photo: JobPhoto;
  sections: { id: number; title: string }[];
  canUpload: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? "");
  const [stage, setStage] = useState<string>(photo.stage);
  const [sectionId, setSectionId] = useState(photo.job_id);
  const [preview, setPreview] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      if (replaceFile) {
        const form = new FormData();
        form.append("file", replaceFile);
        const res = await fetch(`/api/photos/${photo.id}/file`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json();
          setError(body.error ?? "Replacing the image failed");
          return;
        }
      }
      const res = await fetch(`/api/photos/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim() || null,
          stage,
          ...(sectionId !== photo.job_id ? { job_id: sectionId } : {}),
        }),
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
      const res = await fetch(`/api/photos/${photo.id}`, { method: "DELETE" });
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
      <div className="dialog" role="dialog" aria-label="Photo details"
        style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="dialog-title" style={{ fontSize: 20 }}>Photo details</div>
          <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
            onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        <div style={{ background: "var(--sunken)", borderRadius: 12, overflow: "hidden", display: "grid", placeItems: "center", minHeight: 220 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview ?? fileHref(photo.stored_path)} alt={photo.caption ?? "Job photo"}
            style={{ maxWidth: "100%", maxHeight: 380, objectFit: "contain" }} />
        </div>
        {canUpload ? (
          <>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" onClick={() => fileInput.current?.click()}>
                <ArrowsClockwise size={15} /> {replaceFile ? `Replacing with ${replaceFile.name}` : "Replace image"}
              </button>
              <input ref={fileInput} type="file" hidden accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setReplaceFile(f);
                  setPreview(URL.createObjectURL(f));
                  e.target.value = "";
                }} />
            </div>
            <div className="field">
              <label>Caption</label>
              <input className="input" value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder="What does this photo show?" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div className="field">
                <label>Stage</label>
                <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
                  {STAGES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Section</label>
                <select className="input" value={sectionId}
                  onChange={(e) => setSectionId(Number(e.target.value))}>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
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
          <p className="card-body" style={{ margin: 0 }}>
            {photo.caption ?? "No caption"} · {photo.stage}
          </p>
        )}
      </div>
    </div>
  );
}

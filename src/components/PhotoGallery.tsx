"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadSimple, ImageSquare } from "@phosphor-icons/react";
import { shortDate, fileHref } from "@/lib/format";
import type { Job, JobPhoto } from "@/lib/types";

type JobWithPhotos = Job & {
  contractor_name: string | null;
  invoice_number: string | null;
  photos: JobPhoto[];
};

const STAGE_CLASS: Record<string, string> = {
  before: "tag-neutral", during: "tag-accent-2", after: "tag-accent", record: "tag-outline",
};

export function PhotoGallery({
  jobs, allJobs, canUpload,
}: {
  jobs: JobWithPhotos[];
  allJobs: { id: number; title: string; performed_on: string; contractor_name: string | null }[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [targetJob, setTargetJob] = useState<number>(allJobs[0]?.id ?? 0);
  const [stage, setStage] = useState("after");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("job_id", String(targetJob));
      form.append("stage", stage);
      form.append("caption", file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/photos", { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Upload failed — retry.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {canUpload && (
        <div className="card" style={{ flexDirection: "row", alignItems: "flex-end", gap: "var(--space-4)", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: 2, minWidth: 220 }}>
            <label>Job</label>
            <select className="input" value={targetJob} onChange={(e) => setTargetJob(Number(e.target.value))}>
              {allJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.contractor_name ?? "Self"} · {shortDate(j.performed_on)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, minWidth: 130 }}>
            <label>Stage</label>
            <select className="input" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="before">Before</option>
              <option value="during">During</option>
              <option value="after">After</option>
              <option value="record">Record</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy || !targetJob} onClick={() => fileInput.current?.click()}>
            <UploadSimple size={15} /> {busy ? "Uploading…" : "Upload photos"}
          </button>
          <input
            ref={fileInput} type="file" hidden multiple accept="image/*"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              for (const f of files) await upload(f);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {error && (
        <div className="card" style={{ borderLeft: "3px solid var(--color-signal)", padding: "var(--space-4) var(--space-6)" }}>
          <span style={{ fontSize: 13 }}>{error}</span>
        </div>
      )}

      {jobs.map((job) => (
        <section key={job.id} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <h5>
              {job.title} <span className="text-muted">· {job.contractor_name ?? "Self"}</span>
            </h5>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {shortDate(job.performed_on)} · {job.location ?? "On site"}
              {job.invoice_number ? ` · Invoice ${job.invoice_number}` : ""}
            </div>
          </div>
          <div className="grid-photos">
            {job.photos.map((p) => (
              <figure className="card photo-tile" key={p.id} style={{ margin: 0 }}>
                <div className="photo-area">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileHref(p.stored_path)} alt={p.caption ?? "Job photo"} loading="lazy" />
                </div>
                <figcaption style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.caption ?? "—"}
                  </span>
                  <span className={`tag ${STAGE_CLASS[p.stage]}`} style={{ flex: "none" }}>
                    {p.stage[0].toUpperCase() + p.stage.slice(1)}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}

      {jobs.length === 0 && (
        <div className="card" style={{ alignItems: "center", padding: "var(--space-8)", gap: "var(--space-3)" }}>
          <ImageSquare size={28} style={{ opacity: 0.5 }} />
          <p className="card-body">No job photos yet. Upload before/during/after shots to build the record.</p>
        </div>
      )}
    </>
  );
}

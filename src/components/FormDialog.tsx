"use client";

import { useState } from "react";
import { Trash } from "@phosphor-icons/react";

export interface FormField {
  key: string;
  label: string;
  /** money and number become numbers (or null when blank); digits keeps only 0-9. */
  type?: "text" | "number" | "money" | "date" | "select" | "textarea" | "digits";
  options?: readonly string[];
  placeholder?: string;
  /** Span the full dialog width. */
  full?: boolean;
  required?: boolean;
  step?: string;
  maxLength?: number;
}

export interface FormSection {
  title?: string;
  hint?: string;
  fields: FormField[];
}

type Values = Record<string, string | number | null | undefined>;

/**
 * Config-driven add/edit dialog. `onSubmit` and `onDelete` return an error
 * message to show, or null on success (the caller then closes the dialog).
 */
export function FormDialog({
  title, sections, initial, submitLabel, onSubmit, onClose, onDelete, deleteLabel = "Delete", wide,
}: {
  title: string;
  sections: FormSection[];
  initial?: Values | null;
  submitLabel: string;
  onSubmit: (payload: Record<string, string | number | null>) => Promise<string | null>;
  onClose: () => void;
  onDelete?: () => Promise<string | null>;
  deleteLabel?: string;
  wide?: boolean;
}) {
  const allFields = sections.flatMap((s) => s.fields);
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(allFields.map((f) => [f.key, initial?.[f.key] != null ? String(initial[f.key]) : ""]))
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = allFields.some((f) => f.required && !form[f.key].trim());

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const payload: Record<string, string | number | null> = {};
      for (const f of allFields) {
        const raw = form[f.key].trim();
        if (raw === "") payload[f.key] = null;
        else if (f.type === "number" || f.type === "money") payload[f.key] = Number(raw);
        else payload[f.key] = raw;
      }
      const problem = await onSubmit(payload);
      if (problem) setError(problem);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    try {
      const problem = await onDelete();
      if (problem) setError(problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}
        style={{ width: wide ? "min(680px, 100%)" : "min(560px, 100%)", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="dialog-title">{title}</div>
        {sections.map((section, si) => (
          <div key={si} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {section.title && (
              <div>
                <div className="kicker">{section.title}</div>
                {section.hint && <div className="text-muted" style={{ fontSize: 12 }}>{section.hint}</div>}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4)" }}>
              {section.fields.map((f, fi) => {
                const id = `fd-${f.key}`;
                const common = {
                  id, className: `input${f.type === "number" || f.type === "money" || f.type === "digits" ? " num" : ""}`,
                  value: form[f.key], placeholder: f.placeholder,
                  autoFocus: si === 0 && fi === 0 && !initial,
                };
                return (
                  <div className="field" key={f.key} style={f.full ? { gridColumn: "1 / -1" } : undefined}>
                    <label htmlFor={id}>{f.label}{f.type === "money" ? " ($)" : ""}</label>
                    {f.type === "select" ? (
                      <select {...common} onChange={(e) => set(f.key, e.target.value)}>
                        {!f.required && <option value="">—</option>}
                        {f.options?.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : f.type === "textarea" ? (
                      <textarea {...common} style={{ minHeight: 72 }} maxLength={f.maxLength}
                        onChange={(e) => set(f.key, e.target.value)} />
                    ) : (
                      <input {...common}
                        type={f.type === "number" || f.type === "money" ? "number" : f.type === "date" ? "date" : "text"}
                        inputMode={f.type === "digits" ? "numeric" : undefined}
                        min={f.type === "number" || f.type === "money" ? 0 : undefined}
                        step={f.step ?? (f.type === "money" ? "0.01" : undefined)}
                        maxLength={f.maxLength}
                        onChange={(e) => set(f.key, f.type === "digits" ? e.target.value.replace(/\D/g, "") : e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {error && <div className="field-error" role="alert">{error}</div>}
        <div className="dialog-actions" style={{ justifyContent: onDelete ? "space-between" : "flex-end" }}>
          {onDelete && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5 }}>Delete for good?</span>
                <button className="btn btn-danger" disabled={busy} onClick={remove}>
                  <Trash size={14} /> Delete
                </button>
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            ) : (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size={14} /> {deleteLabel}
              </button>
            )
          )}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || missing} onClick={submit}>
              {busy ? "Saving…" : submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shared fetch helper for the dialogs: returns an error message or null. */
export async function sendJson(url: string, method: string, payload?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      ...(payload !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
        : {}),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.error ?? "That didn't work — try again.";
  } catch {
    return "Couldn't reach the server — check your connection.";
  }
}

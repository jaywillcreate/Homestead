"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "@phosphor-icons/react";
import { contractorSchema, insuranceWarning, type ContractorInput } from "@/lib/contractor-schema";
import { TRADES, LICENSED_TRADES, type Contractor } from "@/lib/types";
import { shortDate } from "@/lib/format";

type FieldErrors = Partial<Record<string, string>>;

export function ContractorForm({ existing }: { existing?: Contractor | null }) {
  const router = useRouter();
  const [values, setValues] = useState<ContractorInput>({
    business_name: existing?.business_name ?? "",
    trade: (existing?.trade as ContractorInput["trade"]) ?? "Plumbing",
    primary_contact: existing?.primary_contact ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    license_number: existing?.license_number ?? "",
    hourly_rate: existing?.hourly_rate ?? null,
    insurance_expires: existing?.insurance_expires ?? "",
    service_area_notes: existing?.service_area_notes ?? "",
    status: existing?.status ?? "active",
    tags: existing ? (JSON.parse(existing.tags || "[]") as string[]) : [],
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  const set = <K extends keyof ContractorInput>(key: K, value: ContractorInput[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const insWarn = insuranceWarning(values.insurance_expires || null);

  async function save() {
    setServerError(null);
    const parsed = contractorSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        fieldErrors[String(issue.path[0])] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const res = await fetch(existing ? `/api/contractors/${existing.id}` : "/api/contractors", {
        method: existing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const body = await res.json();
      if (!res.ok) {
        setServerError(body.error ?? "Save failed");
        return;
      }
      router.push(existing ? `/contractors/${existing.id}` : `/contractors/${body.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof ContractorInput,
    label: string,
    input: React.ReactNode,
    extra?: React.ReactNode
  ) => (
    <div className="field">
      <label>{label}</label>
      {input}
      {errors[key as string] && <div className="field-error">{errors[key as string]}</div>}
      {extra}
    </div>
  );

  return (
    <div style={{ maxWidth: 880, display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <div className="card" style={{ gap: "var(--space-6)" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          {field("business_name", "Business name",
            <input className={`input${errors.business_name ? " invalid" : ""}`} value={values.business_name}
              onChange={(e) => set("business_name", e.target.value)} placeholder="Delgado Plumbing & Drain" />)}
          {field("trade", "Trade",
            <select className="input" value={values.trade}
              onChange={(e) => set("trade", e.target.value as ContractorInput["trade"])}>
              {TRADES.map((t) => <option key={t}>{t}</option>)}
            </select>)}
          {field("primary_contact", "Primary contact",
            <input className="input" value={values.primary_contact ?? ""}
              onChange={(e) => set("primary_contact", e.target.value)} placeholder="Marco Delgado" />)}
          {field("phone", "Phone",
            <input className={`input${errors.phone ? " invalid" : ""}`} value={values.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)} placeholder="(210) 555-0147" />)}
          {field("email", "Email",
            <input className={`input${errors.email ? " invalid" : ""}`} type="email" value={values.email ?? ""}
              onChange={(e) => set("email", e.target.value)} placeholder="office@example.com" />)}
          {field("license_number",
            LICENSED_TRADES.includes(values.trade) ? "License number (required)" : "License number",
            <input className={`input${errors.license_number ? " invalid" : ""}`} value={values.license_number ?? ""}
              onChange={(e) => set("license_number", e.target.value)} placeholder="M-40412" />)}
          {field("hourly_rate", "Hourly rate ($)",
            <input className="input" type="number" min={0} value={values.hourly_rate ?? ""}
              onChange={(e) => set("hourly_rate", e.target.value === "" ? null : Number(e.target.value))} />)}
          {field("insurance_expires", "Insurance expiry",
            <input className={`input${errors.insurance_expires ? " invalid" : ""}`} type="date"
              value={values.insurance_expires ?? ""}
              onChange={(e) => set("insurance_expires", e.target.value)} />,
            insWarn && !errors.insurance_expires ? <div className="field-warn">{insWarn}</div> : null)}
        </div>

        <div className="field">
          <label>Service area &amp; specialties</label>
          <textarea className="input" style={{ minHeight: 90 }}
            value={values.service_area_notes ?? ""}
            onChange={(e) => set("service_area_notes", e.target.value)}
            placeholder="Coverage radius, specialties, scheduling notes…" />
        </div>

        <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", alignItems: "center" }}>
          <div className="seg" role="group" aria-label="Status">
            {([["active", "Active"], ["on_hold", "On hold"], ["archived", "Archived"]] as const).map(([v, label]) => (
              <button key={v} type="button" className="seg-opt" aria-pressed={values.status === v}
                onClick={() => set("status", v)}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {values.tags.map((t) => (
              <span className="tag tag-accent" key={t}>
                {t}
                <button
                  onClick={() => set("tags", values.tags.filter((x) => x !== t))}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "flex" }}
                  aria-label={`Remove ${t}`}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            {addingTag ? (
              <input
                className="input" autoFocus value={newTag}
                style={{ width: 140, minHeight: 30, padding: "3px 10px", fontSize: 12 }}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newTag.trim()) {
                    set("tags", [...values.tags, newTag.trim()]);
                    setNewTag(""); setAddingTag(false);
                  }
                  if (e.key === "Escape") setAddingTag(false);
                }}
                onBlur={() => setAddingTag(false)}
              />
            ) : (
              <button className="tag tag-outline" style={{ cursor: "pointer" }} onClick={() => setAddingTag(true)}>
                <Plus size={11} /> add tag
              </button>
            )}
          </div>
        </div>

        <hr className="hr" style={{ margin: 0 }} />
        {serverError && <div className="field-error">{serverError}</div>}
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save contractor"}
          </button>
          <button className="btn btn-secondary" onClick={() => router.back()}>Cancel</button>
          <span style={{ marginLeft: "auto" }} className="text-muted card-meta">
            {existing ? `Last edited ${shortDate(existing.updated_at?.slice(0, 10))}` : "New record"}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CaretLeft, CaretRight, X, User, Clock, ArrowsClockwise, CurrencyDollar, Plus,
} from "@phosphor-icons/react";
import { money, shortDate, dayMonth, CADENCE_LABEL } from "@/lib/format";
import type { MaintenanceTask, ScheduledEvent } from "@/lib/types";

type Ev = ScheduledEvent & { contractor_name: string | null };
type PlanItem = MaintenanceTask & { contractor_name: string | null; next_due: string | null };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function chipKind(e: Ev, today: string): "accent" | "neutral" | "warn" {
  if (e.status === "overdue" || (e.scheduled_for < today && e.status !== "done")) return "warn";
  if (e.contractor_id && (e.status === "confirmed" || e.status === "awaiting_decision")) return "accent";
  return e.status === "confirmed" ? "accent" : "neutral";
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Scheduled", todo: "To do", overdue: "Overdue",
  awaiting_decision: "Awaiting decision", needs_pro: "Needs a pro", done: "Done",
};

export function ScheduleView({
  ym, today, events, plan, contractors, canManage, initialEventId,
}: {
  ym: string;
  today: string;
  events: Ev[];
  plan: PlanItem[];
  contractors: { id: number; name: string }[];
  canManage: boolean;
  initialEventId: number | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(initialEventId);
  const [addOpen, setAddOpen] = useState(false);
  const selected = events.find((e) => e.id === selectedId) ?? null;

  const [year, month] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = first.getDay();
  const cells: (number | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthTitle = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const nav = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    router.push(`/schedule?month=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  async function patchEvent(id: number, patch: Record<string, unknown>) {
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    router.refresh();
  }

  return (
    <div className="split-2" style={{ gridTemplateColumns: "1fr 320px" }}>
      {/* Month grid */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="card-title">{monthTitle}</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn btn-icon" onClick={() => nav(-1)} aria-label="Previous month"><CaretLeft size={16} /></button>
            <button className="btn btn-icon" onClick={() => nav(1)} aria-label="Next month"><CaretRight size={16} /></button>
          </div>
        </div>
        <div className="cal-grid">
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="cal-day other" />;
            const iso = `${ym}-${String(day).padStart(2, "0")}`;
            const dayEvents = events.filter((e) => e.scheduled_for === iso);
            return (
              <div key={i} className={`cal-day${iso === today ? " today" : ""}`}>
                <span className="cal-daynum num">{day}</span>
                {dayEvents.map((e) => (
                  <button
                    key={e.id}
                    className={`cal-chip kind-${chipKind(e, today)}${selectedId === e.id ? " selected" : ""}`}
                    onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
                    title={e.name}
                  >
                    {e.name}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right rail */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {selected && (
          <div className="card" style={{ boxShadow: "var(--shadow-md)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="kicker num">{shortDate(selected.scheduled_for)}</div>
                <h5 style={{ marginTop: 2 }}>{selected.name}</h5>
              </div>
              <button className="btn btn-icon" style={{ width: 30, height: 30, minHeight: 30 }}
                onClick={() => setSelectedId(null)} aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className={`tag ${chipKind(selected, today) === "warn" ? "tag-warn" : "tag-accent"}`}>
                {STATUS_LABEL[selected.status]}
              </span>
              {selected.trade && <span className="tag tag-outline">{selected.trade}</span>}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              {[
                [<User size={14} key="u" />, selected.contractor_name ?? "Unassigned — self or needs a pro"],
                [<Clock size={14} key="c" />, selected.time_window ?? "No time window set"],
                [<ArrowsClockwise size={14} key="a" />, selected.task_id ? "Recurring task" : "One-off"],
                [<CurrencyDollar size={14} key="d" />, selected.cost != null ? money(selected.cost) : "Cost not estimated"],
              ].map(([icon, text], i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ color: "var(--color-accent-text)" }}>{icon}</span>
                  {text}
                </div>
              ))}
            </div>
            {selected.notes && <p className="card-body" style={{ margin: 0 }}>{selected.notes}</p>}
            {canManage && selected.status !== "done" && (
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="btn btn-primary" onClick={() => { patchEvent(selected.id, { status: "done" }); setSelectedId(null); }}>
                  Mark done
                </button>
                <button className="btn btn-secondary"
                  onClick={() => {
                    const d = new Date(selected.scheduled_for + "T00:00:00");
                    d.setDate(d.getDate() + 7);
                    patchEvent(selected.id, { scheduled_for: d.toISOString().slice(0, 10), status: "todo" });
                  }}>
                  Reschedule +1 wk
                </button>
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="card-title">Recurring plan</div>
          {plan.map((t) => (
            <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <ArrowsClockwise size={15} style={{ color: "var(--color-accent-text)", flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{t.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {CADENCE_LABEL[t.cadence]} · {t.contractor_name ?? "Self"}
                </div>
              </div>
              <span className="num text-muted" style={{ fontSize: 11, flex: "none" }}>
                {t.next_due ? dayMonth(t.next_due) : "—"}
              </span>
            </div>
          ))}
          {canManage && (
            <button className="btn btn-secondary btn-block" onClick={() => setAddOpen(true)}>
              <Plus size={15} /> Add recurring task
            </button>
          )}
        </div>
      </div>

      {addOpen && (
        <AddTaskDialog
          contractors={contractors}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function AddTaskDialog({
  contractors, onClose, onSaved,
}: {
  contractors: { id: number; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "", trade: "", cadence: "annual", assigned_contractor_id: "" as string,
    first_due: "", estimated_cost: "",
  });
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name, trade: form.trade || null, cadence: form.cadence,
        assigned_contractor_id: form.assigned_contractor_id ? Number(form.assigned_contractor_id) : null,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
        first_due: form.first_due,
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Could not save the task");
      return;
    }
    onSaved();
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="Add recurring task">
        <div className="dialog-title">Add recurring task</div>
        <div className="field">
          <label>Task name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Gutter clearing" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="field">
            <label>Cadence</label>
            <select className="input" value={form.cadence} onChange={(e) => setForm({ ...form, cadence: e.target.value })}>
              <option value="quarterly">Quarterly</option>
              <option value="semiannual">Twice a year</option>
              <option value="annual">Annual</option>
              <option value="one_off">One-off</option>
            </select>
          </div>
          <div className="field">
            <label>First due</label>
            <input className="input" type="date" value={form.first_due}
              onChange={(e) => setForm({ ...form, first_due: e.target.value })} />
          </div>
          <div className="field">
            <label>Contractor</label>
            <select className="input" value={form.assigned_contractor_id}
              onChange={(e) => setForm({ ...form, assigned_contractor_id: e.target.value })}>
              <option value="">Self / unassigned</option>
              {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Est. cost ($)</label>
            <input className="input" type="number" min={0} value={form.estimated_cost}
              onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} />
          </div>
        </div>
        {error && <div className="field-error">{error}</div>}
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!form.name || !form.first_due} onClick={save}>
            Add task
          </button>
        </div>
      </div>
    </div>
  );
}

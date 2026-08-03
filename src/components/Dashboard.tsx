"use client";

import { useState } from "react";
import Link from "next/link";
import { Receipt, Images, MapPinArea, CalendarDots, ArrowRight } from "@phosphor-icons/react";
import { money, dayMonth, relativeTime, initials } from "@/lib/format";
import type { ContractorWithStats, ScheduledEvent } from "@/lib/types";

interface Metrics {
  thisMonth: number; openJobs: number; awaitingInvoice: number;
  tasksDue: number; overdue: number; contractors: number; preferred: number;
}
type DueEvent = ScheduledEvent & { contractor_name: string | null };

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  invoice: <Receipt size={16} />,
  photo: <Images size={16} />,
  bid: <MapPinArea size={16} />,
  schedule: <CalendarDots size={16} />,
};

function statusTag(e: DueEvent, today: string) {
  const overdue = e.status === "overdue" || (e.scheduled_for < today && e.status !== "done");
  if (overdue) return <span className="tag tag-warn">Overdue</span>;
  if (e.status === "confirmed") return <span className="tag tag-accent">Scheduled</span>;
  return <span className="tag tag-outline">Due {dayMonth(e.scheduled_for)}</span>;
}

export function Dashboard({
  metrics, spend, due, activity, topTrades, frequent, today,
}: {
  metrics: Metrics;
  spend: { ym: string; label: string; total: number }[];
  due: DueEvent[];
  activity: { id: number; kind: string; message: string; created_at: string }[];
  topTrades: { trade: string; total: number }[];
  frequent: ContractorWithStats[];
  today: string;
}) {
  const [layout, setLayout] = useState<"a" | "b">("a");
  const maxSpend = Math.max(...spend.map((s) => s.total), 1);
  const maxTrade = Math.max(...topTrades.map((t) => t.total), 1);
  const nextUp = due[0];

  const metricCards = (
    <div className="grid-metrics">
      {[
        { kicker: "Spend this month", figure: money(metrics.thisMonth), note: "+21% vs. July" },
        { kicker: "Open jobs", figure: String(metrics.openJobs), note: `${metrics.awaitingInvoice} awaiting invoice` },
        { kicker: "Tasks due", figure: String(metrics.tasksDue), note: `${metrics.overdue} overdue` },
        { kicker: "Contractors", figure: String(metrics.contractors), note: `${metrics.preferred} marked preferred` },
      ].map((m) => (
        <div className="card metric-card" key={m.kicker}>
          <div className="kicker">{m.kicker}</div>
          <div className="num metric-figure">{m.figure}</div>
          <div className="metric-note">{m.note}</div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
        <div className="seg" role="group" aria-label="Dashboard layout">
          <button className="seg-opt" aria-pressed={layout === "a"} onClick={() => setLayout("a")}>
            Layout A · Command
          </button>
          <button className="seg-opt" aria-pressed={layout === "b"} onClick={() => setLayout("b")}>
            Layout B · Timeline
          </button>
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>Two dashboard directions to compare</span>
      </div>

      {layout === "a" ? (
        <>
          {metricCards}
          <div className="split-2" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="card-title">Spend, last 12 months</div>
                <span className="num text-muted" style={{ fontSize: 12 }}>
                  {money(spend.reduce((a, b) => a + b.total, 0))} total
                </span>
              </div>
              <div className="bar-track">
                {spend.map((s, i) => (
                  <div
                    key={s.ym}
                    className={`bar${i === spend.length - 1 ? " current" : ""}`}
                    style={{ height: `${Math.max((s.total / maxSpend) * 100, 3)}%` }}
                    title={`${s.ym} · ${money(s.total)}`}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {spend.map((s) => (
                  <div key={s.ym} className="axis-label" style={{ flex: 1 }}>{s.label}</div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Due this month</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {due.slice(0, 5).map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      className="dot"
                      style={{
                        background:
                          e.status === "overdue" || (e.scheduled_for < today && e.status !== "done")
                            ? "var(--warn)"
                            : e.status === "confirmed"
                              ? "var(--color-accent)"
                              : "var(--color-neutral-500)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13 }}>{e.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {e.contractor_name ?? "Self"} · {e.trade}
                      </div>
                    </div>
                    {statusTag(e, today)}
                  </div>
                ))}
              </div>
              <Link href="/schedule" className="btn btn-ghost" style={{ alignSelf: "flex-start" }}>
                Open schedule <ArrowRight size={14} />
              </Link>
            </div>
          </div>
          <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="card">
              <div className="card-title">Recent activity</div>
              {activity.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--color-accent-text)", marginTop: 2 }}>
                    {ACTIVITY_ICONS[a.kind] ?? <Receipt size={16} />}
                  </span>
                  <div>
                    <div style={{ fontSize: 13 }}>{a.message}</div>
                    <div className="text-muted" style={{ fontSize: 11 }}>{relativeTime(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">Top trades by spend</div>
              {topTrades.map((t, i) => (
                <div key={t.trade}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>{t.trade}</span>
                    <span className="num">{money(t.total)}</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${(t.total / maxTrade) * 100}%`,
                        background: i % 2 === 0 ? "var(--color-accent)" : "var(--color-accent-2)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="split-2" style={{ gridTemplateColumns: "1fr 320px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {nextUp && (
              <div
                className="card"
                style={{
                  borderRadius: 14,
                  background:
                    "linear-gradient(120deg, var(--color-accent-800) 0%, var(--color-accent-900) 55%, var(--color-surface) 100%)",
                }}
              >
                <div className="kicker">Next up</div>
                <h3>
                  {nextUp.name} due {dayMonth(nextUp.scheduled_for)}
                </h3>
                <p className="card-body" style={{ maxWidth: "52ch" }}>
                  {nextUp.notes ??
                    `${nextUp.contractor_name ?? "Unassigned"} · ${nextUp.trade}. Confirm the visit or gather competing quotes before the due date.`}
                </p>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Link href="/schedule" className="btn btn-primary">Schedule</Link>
                  <Link href="/discover" className="btn btn-secondary">Compare quotes</Link>
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-title">Timeline</div>
              {due.map((e) => (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "64px 20px 1fr", gap: 4 }}>
                  <div className="num text-muted" style={{ fontSize: 11, textAlign: "right", paddingTop: 8 }}>
                    {dayMonth(e.scheduled_for)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span className="dot" style={{ background: "var(--color-accent)", marginTop: 10 }} />
                    <span style={{ flex: 1, width: 1, background: "var(--color-divider)" }} />
                  </div>
                  <div
                    style={{
                      background: "color-mix(in srgb, var(--color-text) 4%, transparent)",
                      borderRadius: 10, padding: "8px 12px", marginBottom: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 13 }}>{e.name}</span>
                      {statusTag(e, today)}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {e.contractor_name ?? "Self"} · {e.trade}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div className="card" style={{ gap: "var(--space-3)" }}>
              {[
                ["Spend this month", money(metrics.thisMonth)],
                ["Open jobs", String(metrics.openJobs)],
                ["Tasks due", String(metrics.tasksDue)],
                ["Contractors", String(metrics.contractors)],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>{label}</span>
                  <span className="num" style={{ fontSize: 20 }}>{value}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <div className="card-title">Frequent pros</div>
              {frequent.map((c) => (
                <Link
                  key={c.id}
                  href={`/contractors/${c.id}`}
                  style={{
                    display: "flex", gap: 10, alignItems: "center",
                    textDecoration: "none", color: "inherit",
                  }}
                >
                  <span className="avatar" style={{ width: 30, height: 30, fontSize: 11 }}>
                    {initials(c.business_name)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.business_name}
                    </div>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      {c.trade} · {c.job_count} jobs
                    </div>
                  </div>
                  <span className="num" style={{ fontSize: 12 }}>★ {c.rating?.toFixed(1)}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

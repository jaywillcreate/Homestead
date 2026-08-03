"use client";

import { useState } from "react";
import { TrendUp, ChartPieSlice, CalendarDots, FilePdf } from "@phosphor-icons/react";
import { money } from "@/lib/format";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

interface Props {
  summary: {
    ym: string; monthSpend: number; priorMonthSpend: number; ytd: number;
    priorYtd: number; jobsYtd: number; monthJobs: number; avgJobCost: number;
  };
  yoy: { current: number[]; prior: number[] };
  byCategory: { category: string; total: number }[];
  byContractor: { name: string; total: number; jobs: number }[];
  laborParts: { labor: number; parts: number; fees: number }[];
  planned: { planned: number; reactive: number; avgPlanned: number; avgReactive: number };
  heatmap: { trade: string; months: number[] }[];
  movers: { name: string; current: number; prior: number }[];
  budget: number;
}

export function ReportsView({
  summary, yoy, byCategory, byContractor, laborParts, planned, heatmap, movers, budget,
}: Props) {
  const [range, setRange] = useState<"Monthly" | "Quarterly" | "Annual">("Monthly");
  const [tab, setTab] = useState<"Trend" | "Mix" | "Cadence">("Trend");

  const monthDelta = summary.priorMonthSpend
    ? Math.round(((summary.monthSpend - summary.priorMonthSpend) / summary.priorMonthSpend) * 100)
    : 0;
  const ytdDelta = summary.priorYtd
    ? Math.round(((summary.ytd - summary.priorYtd) / summary.priorYtd) * 100)
    : 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div className="seg" role="group" aria-label="Range">
          {(["Monthly", "Quarterly", "Annual"] as const).map((r) => (
            <button key={r} className="seg-opt" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
        <span className="text-muted" style={{ fontSize: 12 }}>July 2026 · compared to July 2025</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <FilePdf size={15} /> Export PDF
        </button>
      </div>

      <div className="grid-metrics">
        {[
          ["July spend", money(summary.monthSpend), `${monthDelta >= 0 ? "↑" : "↓"} ${Math.abs(monthDelta)}% vs. July 2025`],
          ["Year to date", money(summary.ytd), `${ytdDelta >= 0 ? "↑" : "↓"} ${Math.abs(ytdDelta)}% vs. 2025 YTD`],
          ["Avg. job cost", money(summary.avgJobCost), "± 4% vs. last year"],
          ["Jobs completed", String(summary.jobsYtd), `${summary.monthJobs} this month`],
        ].map(([kicker, figure, note]) => (
          <div className="card metric-card" key={kicker}>
            <div className="kicker">{kicker}</div>
            <div className="num metric-figure">{figure}</div>
            <div className="metric-note" style={{ color: "var(--color-accent-text)" }}>{note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        {([["Trend", TrendUp], ["Mix", ChartPieSlice], ["Cadence", CalendarDots]] as const).map(([t, Icon]) => (
          <button key={t} className="chip" aria-pressed={tab === t} onClick={() => setTab(t)}>
            <Icon size={14} /> {t}
          </button>
        ))}
      </div>

      {tab === "Trend" && <TrendTab yoy={yoy} ytd={summary.ytd} budget={budget} />}
      {tab === "Mix" && (
        <MixTab byCategory={byCategory} byContractor={byContractor} laborParts={laborParts} />
      )}
      {tab === "Cadence" && <CadenceTab heatmap={heatmap} planned={planned} movers={movers} />}
    </>
  );
}

/* ————————————————— Trend ————————————————— */

function TrendTab({ yoy, ytd, budget }: { yoy: Props["yoy"]; ytd: number; budget: number }) {
  const maxBar = Math.max(...yoy.current, ...yoy.prior, 1);
  // Cumulative series for the SVG line chart
  const cum = (arr: number[]) => {
    let s = 0;
    return arr.map((v) => (s += v));
  };
  const cumCurrent = cum(yoy.current).slice(0, 7);
  const cumPrior = cum(yoy.prior);
  const maxCum = Math.max(budget, cumPrior[11] ?? 0, cumCurrent[cumCurrent.length - 1] ?? 0) * 1.05;
  const X = (i: number) => 30 + (i * (620 - 50)) / 11;
  const Y = (v: number) => 190 - (v / maxCum) * 170;
  const pathFrom = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${X(i)},${Y(v)}`).join(" ");

  return (
    <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="card-title">Year over year</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11 }} className="text-muted">
            <span><span className="dot" style={{ display: "inline-block", background: "var(--color-accent)", marginRight: 4 }} />2026</span>
            <span><span className="dot" style={{ display: "inline-block", background: "var(--color-accent-2-600)", marginRight: 4 }} />2025</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 190 }}>
          {MONTHS.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, height: "100%" }}>
              <div style={{ width: "46%", borderRadius: "3px 3px 1px 1px", background: "var(--color-accent)", height: `${(yoy.current[i] / maxBar) * 100}%` }} title={`2026 ${m}: ${money(yoy.current[i])}`} />
              <div style={{ width: "46%", borderRadius: "3px 3px 1px 1px", background: "var(--color-accent-2-600)", height: `${(yoy.prior[i] / maxBar) * 100}%` }} title={`2025 ${m}: ${money(yoy.prior[i])}`} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {MONTHS.map((m, i) => <div key={i} className="axis-label" style={{ flex: 1 }}>{m}</div>)}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Cumulative spend vs. budget</div>
        <svg viewBox="0 0 620 200" style={{ width: "100%", height: "auto" }}>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={30} x2={600} y1={Y(maxCum * f * 0.95)} y2={Y(maxCum * f * 0.95)}
              stroke="color-mix(in srgb, var(--color-text) 10%, transparent)" strokeWidth={1} />
          ))}
          <line x1={30} x2={600} y1={Y(budget)} y2={Y(budget)} stroke="var(--color-signal)"
            strokeWidth={1.5} strokeDasharray="6 5" opacity={0.8} />
          <defs>
            <linearGradient id="cumfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={`${pathFrom(cumCurrent)} L${X(cumCurrent.length - 1)},190 L${X(0)},190 Z`} fill="url(#cumfill)" />
          <path d={pathFrom(cumPrior)} fill="none" stroke="var(--color-accent-2)" strokeWidth={1.5} strokeDasharray="5 5" opacity={0.8} />
          <path d={pathFrom(cumCurrent)} fill="none" stroke="var(--color-accent)" strokeWidth={2.5} />
          {cumCurrent.map((v, i) => (
            <circle key={i} cx={X(i)} cy={Y(v)} r={3} fill="var(--color-accent)"
              stroke="var(--color-surface)" strokeWidth={1.5} />
          ))}
          {MONTHS.map((m, i) => (
            <text key={i} x={X(i)} y={199} textAnchor="middle" fontSize={10}
              fill="color-mix(in srgb, var(--color-text) 60%, transparent)">{m}</text>
          ))}
        </svg>
        <div className="card-meta num">
          {money(ytd)} of {money(budget)} · {Math.round((ytd / budget) * 100)}% used
        </div>
      </div>
    </div>
  );
}

/* ————————————————— Mix ————————————————— */

const DONUT_COLORS = [
  "var(--color-accent)", "var(--color-accent-2)", "var(--color-accent-300)",
  "var(--color-accent-2-700)", "var(--color-signal-400)", "var(--color-neutral-500)",
  "var(--color-accent-700)",
];

function MixTab({
  byCategory, byContractor, laborParts,
}: Pick<Props, "byCategory" | "byContractor" | "laborParts">) {
  const total = byCategory.reduce((a, b) => a + b.total, 0);
  const C = 2 * Math.PI * 15.9;
  let offset = 0;
  const maxStack = Math.max(...laborParts.map((m) => m.labor + m.parts + m.fees), 1);
  const maxCat = Math.max(...byCategory.map((c) => c.total), 1);
  const maxContractor = Math.max(...byContractor.map((c) => c.total), 1);

  return (
    <>
      <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="card-title">Share of spend</div>
          <div style={{ display: "flex", gap: "var(--space-6)", alignItems: "center", flexWrap: "wrap" }}>
            <svg viewBox="0 0 42 42" style={{ width: 172, height: 172, transform: "rotate(-90deg)", flex: "none" }}>
              {byCategory.map((c, i) => {
                const frac = c.total / total;
                const el = (
                  <circle key={c.category} cx={21} cy={21} r={15.9} fill="none"
                    stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth={6}
                    strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-offset * C} />
                );
                offset += frac;
                return el;
              })}
              <text x={21} y={21} textAnchor="middle" dominantBaseline="central" fontSize={6}
                fill="var(--color-text)" transform="rotate(90 21 21)"
                style={{ fontFamily: "var(--font-mono)" }}>
                {money(total)}
              </text>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 160 }}>
              {byCategory.map((c, i) => (
                <div key={c.category} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: DONUT_COLORS[i % DONUT_COLORS.length], flex: "none" }} />
                  <span style={{ flex: 1 }}>{c.category}</span>
                  <span className="num text-muted">{Math.round((c.total / total) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div className="card-title">Labor vs. parts</div>
            <div style={{ display: "flex", gap: 10, fontSize: 11 }} className="text-muted">
              <span><span className="dot" style={{ display: "inline-block", background: "var(--color-signal-700)", marginRight: 4 }} />Fees</span>
              <span><span className="dot" style={{ display: "inline-block", background: "var(--color-accent-2-500)", marginRight: 4 }} />Parts</span>
              <span><span className="dot" style={{ display: "inline-block", background: "var(--color-accent)", marginRight: 4 }} />Labor</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150 }}>
            {laborParts.map((m, i) => {
              const sum = m.labor + m.parts + m.fees;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%", gap: 1 }}
                  title={`${MONTHS[i]}: labor ${money(m.labor)} · parts ${money(m.parts)} · fees ${money(m.fees)}`}>
                  {sum > 0 && (
                    <>
                      <div style={{ background: "var(--color-signal-700)", height: `${(m.fees / maxStack) * 100}%`, borderRadius: "3px 3px 0 0" }} />
                      <div style={{ background: "var(--color-accent-2-500)", height: `${(m.parts / maxStack) * 100}%` }} />
                      <div style={{ background: "var(--color-accent)", height: `${(m.labor / maxStack) * 100}%`, borderRadius: "0 0 2px 2px" }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {MONTHS.map((m, i) => <div key={i} className="axis-label" style={{ flex: 1 }}>{m}</div>)}
          </div>
        </div>
      </div>

      <div className="split-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="card">
          <div className="card-title">By category</div>
          {byCategory.map((c) => (
            <div key={c.category}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span>{c.category}</span>
                <span className="num">{money(c.total)}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${(c.total / maxCat) * 100}%`, background: "var(--color-accent)" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">By contractor</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr><th>Contractor</th><th>Jobs</th><th style={{ width: "30%" }}>Share</th><th style={{ textAlign: "right" }}>Spend</th></tr>
              </thead>
              <tbody>
                {byContractor.map((c) => (
                  <tr key={c.name}>
                    <td style={{ fontSize: 13 }}>{c.name}</td>
                    <td className="num">{c.jobs}</td>
                    <td>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${(c.total / maxContractor) * 100}%`, background: "var(--color-accent-2)" }} />
                      </div>
                    </td>
                    <td className="num-cell">{money(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ————————————————— Cadence ————————————————— */

function CadenceTab({
  heatmap, planned, movers,
}: Pick<Props, "heatmap" | "planned" | "movers">) {
  const maxCell = Math.max(...heatmap.flatMap((r) => r.months), 1);
  const totalPR = planned.planned + planned.reactive;
  const plannedPct = Math.round((planned.planned / totalPR) * 100);
  const ratio = planned.avgPlanned ? (planned.avgReactive / planned.avgPlanned).toFixed(1) : "—";
  const maxMove = Math.max(...movers.map((m) => Math.abs(m.current - m.prior)), 1);

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="card-title">Spend intensity by month</div>
          <span className="text-muted" style={{ fontSize: 11 }}>Darker cells are heavier months for that trade</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "130px repeat(12, minmax(0, 1fr))", gap: 4, minWidth: 560 }}>
            <span />
            {MONTHS.map((m, i) => <div key={i} className="axis-label">{m}</div>)}
            {heatmap.map((row) => (
              <RowCells key={row.trade} row={row} maxCell={maxCell} />
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Planned vs. reactive</div>
        <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ width: `${plannedPct}%`, background: "var(--color-accent)" }} title={`Planned ${money(planned.planned)}`} />
          <div style={{ flex: 1, background: "var(--color-signal-700)" }} title={`Reactive ${money(planned.reactive)}`} />
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span><span className="dot" style={{ display: "inline-block", background: "var(--color-accent)", marginRight: 5 }} />
            Planned <span className="num">{money(planned.planned)}</span> · {plannedPct}%</span>
          <span><span className="dot" style={{ display: "inline-block", background: "var(--color-signal-700)", marginRight: 5 }} />
            Reactive <span className="num">{money(planned.reactive)}</span> · {100 - plannedPct}%</span>
        </div>
        <p className="card-body" style={{ margin: 0 }}>
          Reactive work ran {ratio}× the cost per job of scheduled work. Keeping the recurring plan current is the cheapest insurance.
        </p>
      </div>

      <div className="card">
        <div className="card-title">Biggest movers</div>
        {movers.map((m) => {
          const delta = m.current - m.prior;
          const up = delta >= 0;
          return (
            <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{m.name}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {up ? "More work this year" : "Less work this year"}
                </div>
              </div>
              <div className="progress-track" style={{ width: 120, flex: "none" }}>
                <div className="progress-fill" style={{
                  width: `${(Math.abs(delta) / maxMove) * 100}%`,
                  background: up ? "var(--color-signal)" : "var(--color-neutral-600)",
                }} />
              </div>
              <span className="num" style={{
                fontSize: 13, width: 84, textAlign: "right", flex: "none",
                color: up ? "var(--color-signal)" : "color-mix(in srgb, var(--color-text) 55%, transparent)",
              }}>
                {up ? "+" : "−"}{money(Math.abs(delta))}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function RowCells({ row, maxCell }: { row: { trade: string; months: number[] }; maxCell: number }) {
  return (
    <>
      <div style={{ fontSize: 12, display: "flex", alignItems: "center" }}>{row.trade}</div>
      {row.months.map((v, i) => (
        <div key={i}
          title={`${row.trade} · ${MONTHS[i]}: ${money(v)}`}
          style={{
            height: 26, borderRadius: 4,
            background: `color-mix(in srgb, var(--color-accent) ${Math.round((v / maxCell) * 88)}%, color-mix(in srgb, var(--color-text) 6%, transparent))`,
          }}
        />
      ))}
    </>
  );
}

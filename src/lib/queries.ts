import { q, qOne } from "./db";
import type {
  Bid,
  BidRequest,
  ContractorWithStats,
  Invoice,
  InvoiceLineItem,
  Job,
  JobPhoto,
  MaintenanceTask,
  ScheduledEvent,
  User,
} from "./types";

// ------------------------------------------------------------ contractors

const STATS_SELECT = `
  SELECT c.*,
    (SELECT COUNT(*)::int FROM jobs j WHERE j.contractor_id = c.id) AS job_count,
    COALESCE((SELECT SUM(j.amount) FROM jobs j WHERE j.contractor_id = c.id), 0)::float8 AS lifetime_spend,
    (SELECT MAX(j.performed_on) FROM jobs j WHERE j.contractor_id = c.id) AS last_job
  FROM contractors c`;

export async function listContractors(trade?: string): Promise<ContractorWithStats[]> {
  if (trade && trade !== "All trades") {
    return q<ContractorWithStats>(
      `${STATS_SELECT} WHERE c.trade = $1 AND c.status != 'archived' ORDER BY c.business_name`,
      [trade]
    );
  }
  return q<ContractorWithStats>(
    `${STATS_SELECT} WHERE c.status != 'archived' ORDER BY c.business_name`
  );
}

export async function getContractor(id: number): Promise<ContractorWithStats | null> {
  return qOne<ContractorWithStats>(`${STATS_SELECT} WHERE c.id = $1`, [id]);
}

export async function contractorJobs(id: number) {
  return q<Job & { invoice_status: string | null; invoice_id: number | null }>(
    `SELECT j.*, i.payment_status AS invoice_status, i.id AS invoice_id
     FROM jobs j LEFT JOIN invoices i ON i.job_id = j.id
     WHERE j.contractor_id = $1 ORDER BY j.performed_on DESC NULLS LAST LIMIT 12`,
    [id]
  );
}

export async function contractorDocuments(id: number) {
  return q<{ id: number; filename: string; size: number; kind: string }>(
    "SELECT * FROM contractor_documents WHERE contractor_id = $1",
    [id]
  );
}

// --------------------------------------------------------------- invoices

export async function listInvoices(limit = 20) {
  return q<Invoice & { contractor_name: string | null }>(
    `SELECT i.*, c.business_name AS contractor_name
     FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id
     ORDER BY i.invoice_date DESC NULLS LAST, i.id DESC LIMIT $1`,
    [limit]
  );
}

export async function getInvoice(
  id: number
): Promise<(Invoice & { line_items: InvoiceLineItem[] }) | null> {
  const inv = await qOne<Invoice>("SELECT * FROM invoices WHERE id = $1", [id]);
  if (!inv) return null;
  const line_items = await q<InvoiceLineItem>(
    "SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY id",
    [id]
  );
  return { ...inv, line_items };
}

// ----------------------------------------------------------------- photos

export async function listJobsWithPhotos() {
  const jobs = await q<Job & { contractor_name: string | null; invoice_number: string | null }>(
    `SELECT j.*, c.business_name AS contractor_name, i.invoice_number
     FROM jobs j
     LEFT JOIN contractors c ON c.id = j.contractor_id
     LEFT JOIN invoices i ON i.job_id = j.id
     WHERE EXISTS (SELECT 1 FROM job_photos p WHERE p.job_id = j.id)
     ORDER BY j.performed_on DESC NULLS LAST`
  );
  const out = [];
  for (const j of jobs) {
    const photos = await q<JobPhoto>(
      "SELECT * FROM job_photos WHERE job_id = $1 ORDER BY id",
      [j.id]
    );
    out.push({ ...j, photos });
  }
  return out;
}

export async function listJobs(limit = 50) {
  return q<{ id: number; title: string; performed_on: string; contractor_name: string | null }>(
    `SELECT j.id, j.title, j.performed_on, c.business_name AS contractor_name
     FROM jobs j LEFT JOIN contractors c ON c.id = j.contractor_id
     ORDER BY j.performed_on DESC NULLS LAST LIMIT $1`,
    [limit]
  );
}

// -------------------------------------------------------------- dashboard

export async function dashboardMetrics(today = "2026-08-03") {
  const ym = today.slice(0, 7);
  const [y, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const spendRow = async (yymm: string) =>
    (await qOne<{ s: number }>(
      "SELECT COALESCE(SUM(amount),0)::float8 AS s FROM jobs WHERE substr(performed_on,1,7) = $1",
      [yymm]
    ))!.s;
  // "This month" reads as the most recent month with spend.
  const thisMonth = (await spendRow(ym)) || (await spendRow(prevYm));
  const openJobs = (await qOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM jobs j WHERE j.status != 'done'
       OR (j.status = 'done' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id))`
  ))!.n;
  const awaitingInvoice = (await qOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM jobs j WHERE j.status = 'done'
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id)`
  ))!.n;
  const tasksDue = (await qOne<{ n: number; overdue: number }>(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(CASE WHEN status = 'overdue' OR scheduled_for < $1 THEN 1 ELSE 0 END),0)::int AS overdue
     FROM scheduled_events WHERE status != 'done' AND substr(scheduled_for,1,7) <= $2`,
    [today, ym]
  ))!;
  const contractors = (await qOne<{ n: number; preferred: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(preferred),0)::int AS preferred
     FROM contractors WHERE status = 'active'`
  ))!;
  return {
    thisMonth,
    openJobs,
    awaitingInvoice,
    tasksDue: tasksDue.n,
    overdue: tasksDue.overdue,
    contractors: contractors.n,
    preferred: contractors.preferred,
  };
}

export async function monthlySpend(months = 12, endYm = "2026-07") {
  const rows = await q<{ ym: string; total: number }>(
    `SELECT substr(performed_on,1,7) AS ym, COALESCE(SUM(amount),0)::float8 AS total
     FROM jobs WHERE performed_on IS NOT NULL GROUP BY 1`
  );
  const byYm = new Map(rows.map((r) => [r.ym, r.total]));
  const out: { ym: string; label: string; total: number }[] = [];
  let [y, m] = [Number(endYm.slice(0, 4)), Number(endYm.slice(5, 7))];
  for (let i = 0; i < months; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.unshift({ ym, label: "JFMAMJJASOND"[m - 1], total: byYm.get(ym) ?? 0 });
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out;
}

export async function recentActivity(limit = 5) {
  return q<{ id: number; kind: string; message: string; created_at: string }>(
    "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1",
    [limit]
  );
}

export async function topTradesBySpend(year: string, limit = 5) {
  return q<{ trade: string; total: number }>(
    `SELECT trade, SUM(amount)::float8 AS total FROM jobs
     WHERE substr(performed_on,1,4) = $1 GROUP BY trade ORDER BY total DESC LIMIT $2`,
    [year, limit]
  );
}

export async function frequentContractors(limit = 4) {
  return q<ContractorWithStats>(
    `${STATS_SELECT} WHERE c.status = 'active' ORDER BY job_count DESC, lifetime_spend DESC LIMIT $1`,
    [limit]
  );
}

// ---------------------------------------------------------------- reports

export async function reportSummary(ym = "2026-07") {
  const year = ym.slice(0, 4);
  const priorYm = `${Number(year) - 1}${ym.slice(4)}`;
  const sum = async (sql: string, params: unknown[]) =>
    (await qOne<{ s: number }>(sql, params))!.s;
  const monthSpend = await sum(
    "SELECT COALESCE(SUM(amount),0)::float8 AS s FROM jobs WHERE substr(performed_on,1,7) = $1",
    [ym]
  );
  const priorMonthSpend = await sum(
    "SELECT COALESCE(SUM(amount),0)::float8 AS s FROM jobs WHERE substr(performed_on,1,7) = $1",
    [priorYm]
  );
  const ytd = await sum(
    "SELECT COALESCE(SUM(amount),0)::float8 AS s FROM jobs WHERE substr(performed_on,1,4) = $1 AND substr(performed_on,1,7) <= $2",
    [year, ym]
  );
  const priorYtd = await sum(
    "SELECT COALESCE(SUM(amount),0)::float8 AS s FROM jobs WHERE substr(performed_on,1,4) = $1 AND substr(performed_on,1,7) <= $2",
    [String(Number(year) - 1), priorYm]
  );
  const jobs = (await qOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM jobs WHERE substr(performed_on,1,4) = $1 AND substr(performed_on,1,7) <= $2",
    [year, ym]
  ))!.n;
  const monthJobs = (await qOne<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM jobs WHERE substr(performed_on,1,7) = $1",
    [ym]
  ))!.n;
  return {
    ym, monthSpend, priorMonthSpend, ytd, priorYtd, jobsYtd: jobs, monthJobs,
    avgJobCost: jobs ? Math.round(ytd / jobs) : 0,
  };
}

export async function yearOverYear(year = "2026") {
  const toArr = async (y: string) => {
    const rows = await q<{ m: string; total: number }>(
      `SELECT substr(performed_on,6,2) AS m, SUM(amount)::float8 AS total
       FROM jobs WHERE substr(performed_on,1,4) = $1 GROUP BY 1`,
      [y]
    );
    const arr = Array(12).fill(0);
    rows.forEach((r) => (arr[Number(r.m) - 1] = r.total));
    return arr;
  };
  return { current: await toArr(year), prior: await toArr(String(Number(year) - 1)) };
}

export async function spendByCategory(year = "2026") {
  return q<{ category: string; total: number }>(
    `SELECT COALESCE(trade,'Other') AS category, SUM(amount)::float8 AS total
     FROM jobs WHERE substr(performed_on,1,4) = $1 GROUP BY 1 ORDER BY total DESC`,
    [year]
  );
}

export async function spendByContractor(year = "2026") {
  return q<{ name: string; total: number; jobs: number }>(
    `SELECT c.business_name AS name, SUM(j.amount)::float8 AS total, COUNT(*)::int AS jobs
     FROM jobs j JOIN contractors c ON c.id = j.contractor_id
     WHERE substr(j.performed_on,1,4) = $1 GROUP BY c.id, c.business_name ORDER BY total DESC`,
    [year]
  );
}

export async function laborPartsSplit(year = "2026") {
  const rows = await q<{ m: string; type: "labor" | "parts" | "fees"; total: number }>(
    `SELECT substr(i.invoice_date,6,2) AS m, li.type, SUM(li.amount)::float8 AS total
     FROM invoice_line_items li JOIN invoices i ON i.id = li.invoice_id
     WHERE substr(i.invoice_date,1,4) = $1 GROUP BY 1, 2`,
    [year]
  );
  const out = Array.from({ length: 12 }, () => ({ labor: 0, parts: 0, fees: 0 }));
  rows.forEach((r) => (out[Number(r.m) - 1][r.type] = r.total));
  return out;
}

export async function plannedVsReactive(year = "2026") {
  return (await qOne<{ planned: number; reactive: number; avgPlanned: number; avgReactive: number }>(
    `SELECT COALESCE(SUM(CASE WHEN planned = 1 THEN amount END),0)::float8 AS planned,
            COALESCE(SUM(CASE WHEN planned = 0 THEN amount END),0)::float8 AS reactive,
            COALESCE(AVG(CASE WHEN planned = 1 THEN amount END),0)::float8 AS "avgPlanned",
            COALESCE(AVG(CASE WHEN planned = 0 THEN amount END),0)::float8 AS "avgReactive"
     FROM jobs WHERE substr(performed_on,1,4) = $1`,
    [year]
  ))!;
}

export async function spendHeatmap(year = "2026") {
  const rows = await q<{ trade: string; m: string; total: number }>(
    `SELECT COALESCE(trade,'Other') AS trade, substr(performed_on,6,2) AS m, SUM(amount)::float8 AS total
     FROM jobs WHERE substr(performed_on,1,4) = $1 GROUP BY 1, 2`,
    [year]
  );
  const trades = [...new Set(rows.map((r) => r.trade))];
  const grid = trades.map((t) => ({ trade: t, months: Array(12).fill(0) as number[] }));
  rows.forEach((r) => {
    grid.find((g) => g.trade === r.trade)!.months[Number(r.m) - 1] = r.total;
  });
  grid.sort((a, b) => b.months.reduce((x, y) => x + y) - a.months.reduce((x, y) => x + y));
  return grid;
}

export async function biggestMovers(year = "2026") {
  return q<{ name: string; current: number; prior: number }>(
    `SELECT * FROM (
       SELECT c.business_name AS name,
         COALESCE(SUM(CASE WHEN substr(j.performed_on,1,4) = $1 THEN j.amount END),0)::float8 AS current,
         COALESCE(SUM(CASE WHEN substr(j.performed_on,1,4) = $2 THEN j.amount END),0)::float8 AS prior
       FROM jobs j JOIN contractors c ON c.id = j.contractor_id
       GROUP BY c.id, c.business_name
     ) t WHERE t.current + t.prior > 0
     ORDER BY ABS(t.current - t.prior) DESC LIMIT 5`,
    [year, String(Number(year) - 1)]
  );
}

// --------------------------------------------------------------- schedule

export async function eventsForMonth(ym: string) {
  return q<ScheduledEvent & { contractor_name: string | null }>(
    `SELECT e.*, c.business_name AS contractor_name
     FROM scheduled_events e LEFT JOIN contractors c ON c.id = e.contractor_id
     WHERE substr(e.scheduled_for,1,7) = $1 ORDER BY e.scheduled_for`,
    [ym]
  );
}

export async function recurringPlan() {
  return q<MaintenanceTask & { contractor_name: string | null; next_due: string | null }>(
    `SELECT t.*, c.business_name AS contractor_name,
       (SELECT MIN(e.scheduled_for) FROM scheduled_events e
         WHERE e.task_id = t.id AND e.status != 'done') AS next_due
     FROM maintenance_tasks t LEFT JOIN contractors c ON c.id = t.assigned_contractor_id
     ORDER BY next_due IS NULL, next_due`
  );
}

export async function dueThisMonth(ym: string, _today: string) {
  return q<ScheduledEvent & { contractor_name: string | null }>(
    `SELECT e.*, c.business_name AS contractor_name
     FROM scheduled_events e LEFT JOIN contractors c ON c.id = e.contractor_id
     WHERE e.status != 'done' AND substr(e.scheduled_for,1,7) <= $1
     ORDER BY e.scheduled_for LIMIT 6`,
    [ym]
  );
}

// ------------------------------------------------------------------- bids

export async function openBidRequest(): Promise<(BidRequest & { bids: Bid[] }) | null> {
  const req = await qOne<BidRequest>(
    "SELECT * FROM bid_requests ORDER BY posted_at DESC LIMIT 1"
  );
  if (!req) return null;
  const bids = await q<Bid>(
    "SELECT * FROM bids WHERE bid_request_id = $1 ORDER BY (price IS NULL), price",
    [req.id]
  );
  return { ...req, bids };
}

// ------------------------------------------------------------------ users

export async function listUsers() {
  return q<User & { properties: number }>(
    `SELECT u.*, (SELECT COUNT(*)::int FROM user_properties up WHERE up.user_id = u.id) AS properties
     FROM users u ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`
  );
}

import { getDb } from "./db";
import type {
  Bid,
  BidRequest,
  Contractor,
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
    (SELECT COUNT(*) FROM jobs j WHERE j.contractor_id = c.id) AS job_count,
    COALESCE((SELECT SUM(j.amount) FROM jobs j WHERE j.contractor_id = c.id), 0) AS lifetime_spend,
    (SELECT MAX(j.performed_on) FROM jobs j WHERE j.contractor_id = c.id) AS last_job
  FROM contractors c`;

export function listContractors(trade?: string): ContractorWithStats[] {
  const db = getDb();
  if (trade && trade !== "All trades") {
    return db
      .prepare(`${STATS_SELECT} WHERE c.trade = ? AND c.status != 'archived' ORDER BY c.business_name`)
      .all(trade) as ContractorWithStats[];
  }
  return db
    .prepare(`${STATS_SELECT} WHERE c.status != 'archived' ORDER BY c.business_name`)
    .all() as ContractorWithStats[];
}

export function getContractor(id: number): ContractorWithStats | null {
  return (getDb().prepare(`${STATS_SELECT} WHERE c.id = ?`).get(id) as ContractorWithStats) ?? null;
}

export function contractorJobs(id: number): (Job & { invoice_status: string | null; invoice_id: number | null })[] {
  return getDb()
    .prepare(
      `SELECT j.*, i.payment_status AS invoice_status, i.id AS invoice_id
       FROM jobs j LEFT JOIN invoices i ON i.job_id = j.id
       WHERE j.contractor_id = ? ORDER BY j.performed_on DESC LIMIT 12`
    )
    .all(id) as (Job & { invoice_status: string | null; invoice_id: number | null })[];
}

export function contractorDocuments(id: number) {
  return getDb()
    .prepare("SELECT * FROM contractor_documents WHERE contractor_id = ?")
    .all(id) as { id: number; filename: string; size: number; kind: string }[];
}

// --------------------------------------------------------------- invoices

export function listInvoices(limit = 20): (Invoice & { contractor_name: string | null })[] {
  return getDb()
    .prepare(
      `SELECT i.*, c.business_name AS contractor_name
       FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id
       ORDER BY i.invoice_date DESC, i.id DESC LIMIT ?`
    )
    .all(limit) as (Invoice & { contractor_name: string | null })[];
}

export function getInvoice(id: number): (Invoice & { line_items: InvoiceLineItem[] }) | null {
  const db = getDb();
  const inv = db.prepare("SELECT * FROM invoices WHERE id = ?").get(id) as Invoice | undefined;
  if (!inv) return null;
  const line_items = db
    .prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?")
    .all(id) as InvoiceLineItem[];
  return { ...inv, line_items };
}

// ----------------------------------------------------------------- photos

export function listJobsWithPhotos() {
  const db = getDb();
  const jobs = db
    .prepare(
      `SELECT j.*, c.business_name AS contractor_name, i.invoice_number
       FROM jobs j
       LEFT JOIN contractors c ON c.id = j.contractor_id
       LEFT JOIN invoices i ON i.job_id = j.id
       WHERE EXISTS (SELECT 1 FROM job_photos p WHERE p.job_id = j.id)
       ORDER BY j.performed_on DESC`
    )
    .all() as (Job & { contractor_name: string | null; invoice_number: string | null })[];
  return jobs.map((j) => ({
    ...j,
    photos: db.prepare("SELECT * FROM job_photos WHERE job_id = ? ORDER BY id").all(j.id) as JobPhoto[],
  }));
}

export function listJobs(limit = 50) {
  return getDb()
    .prepare(
      `SELECT j.id, j.title, j.performed_on, c.business_name AS contractor_name
       FROM jobs j LEFT JOIN contractors c ON c.id = j.contractor_id
       ORDER BY j.performed_on DESC LIMIT ?`
    )
    .all(limit) as { id: number; title: string; performed_on: string; contractor_name: string | null }[];
}

// -------------------------------------------------------------- dashboard

export function dashboardMetrics(today = "2026-08-03") {
  const db = getDb();
  const ym = today.slice(0, 7);
  const [y, m] = [Number(ym.slice(0, 4)), Number(ym.slice(5, 7))];
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const spendRow = (yymm: string) =>
    (db
      .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,7) = ?")
      .get(yymm) as { s: number }).s;
  // "This month" on the dashboard reads as the most recent month with spend (July in the seed).
  const thisMonth = spendRow(ym) || spendRow(prevYm);
  const openJobs = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM jobs j WHERE j.status != 'done'
        OR (j.status = 'done' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id))`
    )
    .get() as { n: number }).n;
  const awaitingInvoice = (db
    .prepare(
      `SELECT COUNT(*) AS n FROM jobs j WHERE j.status = 'done'
       AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id)`
    )
    .get() as { n: number }).n;
  const tasksDue = db
    .prepare(
      `SELECT COUNT(*) AS n,
              SUM(CASE WHEN status = 'overdue' OR scheduled_for < ? THEN 1 ELSE 0 END) AS overdue
       FROM scheduled_events WHERE status NOT IN ('done') AND substr(scheduled_for,1,7) <= ?`
    )
    .get(today, ym) as { n: number; overdue: number };
  const contractors = db
    .prepare(
      "SELECT COUNT(*) AS n, SUM(preferred) AS preferred FROM contractors WHERE status = 'active'"
    )
    .get() as { n: number; preferred: number };
  return { thisMonth, openJobs, awaitingInvoice, tasksDue: tasksDue.n, overdue: tasksDue.overdue ?? 0, contractors: contractors.n, preferred: contractors.preferred ?? 0 };
}

export function monthlySpend(months = 12, endYm = "2026-07") {
  const db = getDb();
  const out: { ym: string; label: string; total: number }[] = [];
  let [y, m] = [Number(endYm.slice(0, 4)), Number(endYm.slice(5, 7))];
  for (let i = 0; i < months; i++) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.unshift({
      ym,
      label: "JFMAMJJASOND"[m - 1],
      total: (db
        .prepare("SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,7) = ?")
        .get(ym) as { s: number }).s,
    });
    m--; if (m === 0) { m = 12; y--; }
  }
  return out;
}

export function recentActivity(limit = 5) {
  return getDb()
    .prepare("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?")
    .all(limit) as { id: number; kind: string; message: string; created_at: string }[];
}

export function topTradesBySpend(year: string, limit = 5) {
  return getDb()
    .prepare(
      `SELECT trade, SUM(amount) AS total FROM jobs
       WHERE substr(performed_on,1,4) = ? GROUP BY trade ORDER BY total DESC LIMIT ?`
    )
    .all(year, limit) as { trade: string; total: number }[];
}

export function frequentContractors(limit = 4) {
  return getDb()
    .prepare(
      `${STATS_SELECT} WHERE c.status = 'active' ORDER BY job_count DESC, lifetime_spend DESC LIMIT ?`
    )
    .all(limit) as ContractorWithStats[];
}

// ---------------------------------------------------------------- reports

export function reportSummary(ym = "2026-07") {
  const db = getDb();
  const year = ym.slice(0, 4);
  const priorYm = `${Number(year) - 1}${ym.slice(4)}`;
  const sum = (sql: string, ...args: unknown[]) =>
    (db.prepare(sql).get(...args) as { s: number }).s;
  const monthSpend = sum(
    "SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,7) = ?", ym);
  const priorMonthSpend = sum(
    "SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,7) = ?", priorYm);
  const ytd = sum(
    "SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,4) = ? AND substr(performed_on,1,7) <= ?",
    year, ym);
  const priorYtd = sum(
    "SELECT COALESCE(SUM(amount),0) AS s FROM jobs WHERE substr(performed_on,1,4) = ? AND substr(performed_on,1,7) <= ?",
    String(Number(year) - 1), priorYm);
  const jobs = (db
    .prepare(
      "SELECT COUNT(*) AS n FROM jobs WHERE substr(performed_on,1,4) = ? AND substr(performed_on,1,7) <= ?"
    )
    .get(year, ym) as { n: number }).n;
  const monthJobs = (db
    .prepare("SELECT COUNT(*) AS n FROM jobs WHERE substr(performed_on,1,7) = ?")
    .get(ym) as { n: number }).n;
  return {
    ym, monthSpend, priorMonthSpend, ytd, priorYtd, jobsYtd: jobs, monthJobs,
    avgJobCost: jobs ? Math.round(ytd / jobs) : 0,
  };
}

export function yearOverYear(year = "2026") {
  const db = getDb();
  const q = db.prepare(
    "SELECT substr(performed_on,6,2) AS m, SUM(amount) AS total FROM jobs WHERE substr(performed_on,1,4) = ? GROUP BY m"
  );
  const toArr = (y: string) => {
    const rows = q.all(y) as { m: string; total: number }[];
    const arr = Array(12).fill(0);
    rows.forEach((r) => (arr[Number(r.m) - 1] = r.total));
    return arr;
  };
  return { current: toArr(year), prior: toArr(String(Number(year) - 1)) };
}

export function spendByCategory(year = "2026") {
  return getDb()
    .prepare(
      "SELECT COALESCE(trade,'Other') AS category, SUM(amount) AS total FROM jobs WHERE substr(performed_on,1,4) = ? GROUP BY category ORDER BY total DESC"
    )
    .all(year) as { category: string; total: number }[];
}

export function spendByContractor(year = "2026") {
  return getDb()
    .prepare(
      `SELECT c.business_name AS name, SUM(j.amount) AS total, COUNT(*) AS jobs
       FROM jobs j JOIN contractors c ON c.id = j.contractor_id
       WHERE substr(j.performed_on,1,4) = ? GROUP BY c.id ORDER BY total DESC`
    )
    .all(year) as { name: string; total: number; jobs: number }[];
}

export function laborPartsSplit(year = "2026") {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT substr(i.invoice_date,6,2) AS m, li.type, SUM(li.amount) AS total
       FROM invoice_line_items li JOIN invoices i ON i.id = li.invoice_id
       WHERE substr(i.invoice_date,1,4) = ? GROUP BY m, li.type`
    )
    .all(year) as { m: string; type: "labor" | "parts" | "fees"; total: number }[];
  const out = Array.from({ length: 12 }, () => ({ labor: 0, parts: 0, fees: 0 }));
  rows.forEach((r) => (out[Number(r.m) - 1][r.type] = r.total));
  return out;
}

export function plannedVsReactive(year = "2026") {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN planned = 1 THEN amount END),0) AS planned,
              COALESCE(SUM(CASE WHEN planned = 0 THEN amount END),0) AS reactive,
              COALESCE(AVG(CASE WHEN planned = 1 THEN amount END),0) AS avgPlanned,
              COALESCE(AVG(CASE WHEN planned = 0 THEN amount END),0) AS avgReactive
       FROM jobs WHERE substr(performed_on,1,4) = ?`
    )
    .get(year) as { planned: number; reactive: number; avgPlanned: number; avgReactive: number };
  return row;
}

export function spendHeatmap(year = "2026") {
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(trade,'Other') AS trade, substr(performed_on,6,2) AS m, SUM(amount) AS total
       FROM jobs WHERE substr(performed_on,1,4) = ? GROUP BY trade, m`
    )
    .all(year) as { trade: string; m: string; total: number }[];
  const trades = [...new Set(rows.map((r) => r.trade))];
  const grid = trades.map((t) => ({ trade: t, months: Array(12).fill(0) as number[] }));
  rows.forEach((r) => {
    grid.find((g) => g.trade === r.trade)!.months[Number(r.m) - 1] = r.total;
  });
  grid.sort((a, b) => b.months.reduce((x, y) => x + y) - a.months.reduce((x, y) => x + y));
  return grid;
}

export function biggestMovers(year = "2026") {
  return getDb()
    .prepare(
      `SELECT c.business_name AS name,
        COALESCE(SUM(CASE WHEN substr(j.performed_on,1,4) = ? THEN j.amount END),0) AS current,
        COALESCE(SUM(CASE WHEN substr(j.performed_on,1,4) = ? THEN j.amount END),0) AS prior
       FROM jobs j JOIN contractors c ON c.id = j.contractor_id
       GROUP BY c.id HAVING current + prior > 0
       ORDER BY ABS(current - prior) DESC LIMIT 5`
    )
    .all(year, String(Number(year) - 1)) as { name: string; current: number; prior: number }[];
}

// --------------------------------------------------------------- schedule

export function eventsForMonth(ym: string): (ScheduledEvent & { contractor_name: string | null })[] {
  return getDb()
    .prepare(
      `SELECT e.*, c.business_name AS contractor_name
       FROM scheduled_events e LEFT JOIN contractors c ON c.id = e.contractor_id
       WHERE substr(e.scheduled_for,1,7) = ? ORDER BY e.scheduled_for`
    )
    .all(ym) as (ScheduledEvent & { contractor_name: string | null })[];
}

export function recurringPlan(): (MaintenanceTask & { contractor_name: string | null; next_due: string | null })[] {
  return getDb()
    .prepare(
      `SELECT t.*, c.business_name AS contractor_name,
        (SELECT MIN(e.scheduled_for) FROM scheduled_events e
          WHERE e.task_id = t.id AND e.status != 'done') AS next_due
       FROM maintenance_tasks t LEFT JOIN contractors c ON c.id = t.assigned_contractor_id
       ORDER BY next_due IS NULL, next_due`
    )
    .all() as (MaintenanceTask & { contractor_name: string | null; next_due: string | null })[];
}

export function dueThisMonth(ym: string, today: string) {
  return getDb()
    .prepare(
      `SELECT e.*, c.business_name AS contractor_name
       FROM scheduled_events e LEFT JOIN contractors c ON c.id = e.contractor_id
       WHERE e.status != 'done' AND substr(e.scheduled_for,1,7) <= ?
       ORDER BY e.scheduled_for LIMIT 6`
    )
    .all(ym) as (ScheduledEvent & { contractor_name: string | null })[];
}

// ------------------------------------------------------------------- bids

export function openBidRequest(): (BidRequest & { bids: Bid[] }) | null {
  const db = getDb();
  const req = db
    .prepare("SELECT * FROM bid_requests ORDER BY posted_at DESC LIMIT 1")
    .get() as BidRequest | undefined;
  if (!req) return null;
  const bids = db
    .prepare("SELECT * FROM bids WHERE bid_request_id = ? ORDER BY (price IS NULL), price")
    .all(req.id) as Bid[];
  return { ...req, bids };
}

// ------------------------------------------------------------------ users

export function listUsers(): (User & { properties: number })[] {
  return getDb()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM user_properties up WHERE up.user_id = u.id) AS properties
       FROM users u ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`
    )
    .all() as (User & { properties: number })[];
}

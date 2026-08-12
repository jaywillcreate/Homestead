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
  return q<{ id: number; filename: string; size: number; kind: string; stored_path: string | null }>(
    "SELECT * FROM contractor_documents WHERE contractor_id = $1 ORDER BY id",
    [id]
  );
}

// --------------------------------------------------------------- invoices

export async function listInvoices(limit = 20) {
  return q<Invoice & { contractor_name: string | null; property_label: string | null }>(
    `SELECT i.*, c.business_name AS contractor_name,
       p.label || COALESCE(' — ' || p.address, '') AS property_label
     FROM invoices i
     LEFT JOIN contractors c ON c.id = i.contractor_id
     LEFT JOIN properties p ON p.id = COALESCE(i.property_id, (SELECT j.property_id FROM jobs j WHERE j.id = i.job_id))
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
  // Sections: any job that has photos, plus photo-album jobs created from the
  // photos page (zero-amount, no invoice) so new empty sections show up.
  const jobs = await q<Job & { contractor_name: string | null; invoice_number: string | null; has_invoice: boolean }>(
    `SELECT j.*, c.business_name AS contractor_name, i.invoice_number,
       (i.id IS NOT NULL) AS has_invoice
     FROM jobs j
     LEFT JOIN contractors c ON c.id = j.contractor_id
     LEFT JOIN invoices i ON i.job_id = j.id
     WHERE EXISTS (SELECT 1 FROM job_photos p WHERE p.job_id = j.id)
        OR (j.notes = '__photo_section__')
     ORDER BY j.performed_on DESC NULLS LAST, j.id DESC`
  );
  const out = [];
  for (const j of jobs) {
    const photos = await q<JobPhoto & { sort_order: number | null }>(
      "SELECT * FROM job_photos WHERE job_id = $1 ORDER BY sort_order NULLS LAST, id",
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
     ORDER BY next_due NULLS LAST`
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
    "SELECT * FROM bid_requests ORDER BY posted_at DESC, id DESC LIMIT 1"
  );
  if (!req) return null;
  const bids = await q<Bid>(
    "SELECT * FROM bids WHERE bid_request_id = $1 ORDER BY (price IS NULL), price",
    [req.id]
  );
  return { ...req, bids };
}

/** Every past bid request with its bids, newest first — the household's bid history. */
export async function bidHistory(): Promise<(BidRequest & { bids: Bid[]; property_label: string | null })[]> {
  const requests = await q<BidRequest & { property_label: string | null }>(
    `SELECT r.*, p.label || COALESCE(' — ' || p.address, '') AS property_label
     FROM bid_requests r LEFT JOIN properties p ON p.id = r.property_id
     ORDER BY r.posted_at DESC, r.id DESC`
  );
  const out: (BidRequest & { bids: Bid[]; property_label: string | null })[] = [];
  for (const req of requests) {
    const bids = await q<Bid>(
      "SELECT * FROM bids WHERE bid_request_id = $1 ORDER BY (price IS NULL), price",
      [req.id]
    );
    out.push({ ...req, bids });
  }
  return out;
}

// ------------------------------------------------------------ app settings

export interface AppBrand {
  name: string;
  logo: string | null; // stored upload ref, resolved with fileHref()
}

export async function getAppBrand(): Promise<AppBrand> {
  const rows = await q<{ key: string; value: string }>(
    "SELECT key, value FROM app_settings WHERE key IN ('app_name', 'app_logo')"
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return { name: map.get("app_name") || "Homestead", logo: map.get("app_logo") || null };
}

export async function setAppSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await q("DELETE FROM app_settings WHERE key = $1", [key]);
  } else {
    await q(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

// ------------------------------------------------------------- properties

export async function listProperties() {
  return q<{ id: number; label: string; address: string | null }>(
    "SELECT id, label, address FROM properties ORDER BY id"
  );
}

export async function listPropertyProfiles() {
  return q<import("./types").PropertyProfile & {
    job_count: number;
    lifetime_spend: number;
    open_requests: number;
    upcoming_events: number;
  }>(
    `SELECT p.*,
       (SELECT COUNT(*)::int FROM jobs j WHERE j.property_id = p.id) AS job_count,
       COALESCE((SELECT SUM(j.amount) FROM jobs j WHERE j.property_id = p.id), 0)::float8 AS lifetime_spend,
       (SELECT COUNT(*)::int FROM bid_requests r WHERE r.property_id = p.id AND r.status = 'open') AS open_requests,
       (SELECT COUNT(*)::int FROM scheduled_events e WHERE e.property_id = p.id AND e.status != 'done') AS upcoming_events
     FROM properties p ORDER BY p.id`
  );
}

// ---------------------------------------------------- property insights

export interface PropertyRecommendation {
  severity: "warn" | "info";
  text: string;
  href: string;
}

export async function propertyInsights(today: string) {
  const property = await qOne<{ id: number; label: string; address: string | null }>(
    "SELECT id, label, address FROM properties ORDER BY id LIMIT 1"
  );
  const recentJobs = await q<{
    id: number; title: string; performed_on: string; amount: number; contractor_name: string | null;
  }>(
    `SELECT j.id, j.title, j.performed_on, j.amount::float8 AS amount, c.business_name AS contractor_name
     FROM jobs j LEFT JOIN contractors c ON c.id = j.contractor_id
     WHERE j.status = 'done' AND j.performed_on IS NOT NULL
     ORDER BY j.performed_on DESC LIMIT 5`
  );

  const recommendations: PropertyRecommendation[] = [];

  const overdue = await q<{ name: string }>(
    `SELECT name FROM scheduled_events
     WHERE status != 'done' AND (status = 'overdue' OR scheduled_for < $1) LIMIT 3`,
    [today]
  );
  if (overdue.length) {
    recommendations.push({
      severity: "warn",
      text: `${overdue.length === 1 ? "Overdue task" : `${overdue.length} overdue tasks`}: ${overdue.map((o) => o.name).join(", ")} — reschedule or mark done.`,
      href: "/schedule",
    });
  }

  const lapsing = await q<{ business_name: string; insurance_expires: string }>(
    `SELECT business_name, insurance_expires FROM contractors
     WHERE status = 'active' AND insurance_expires IS NOT NULL
       AND insurance_expires <= to_char(($1::date + interval '60 days'), 'YYYY-MM-DD')
     ORDER BY insurance_expires LIMIT 2`,
    [today]
  );
  for (const c of lapsing) {
    recommendations.push({
      severity: "warn",
      text: `${c.business_name}'s insurance lapses ${c.insurance_expires} — request an updated certificate.`,
      href: "/contractors",
    });
  }

  const emptyTickets = await q<{ title: string }>(
    `SELECT r.title FROM bid_requests r
     WHERE r.status = 'open' AND NOT EXISTS (SELECT 1 FROM bids b WHERE b.bid_request_id = r.id)
     LIMIT 2`
  );
  for (const t of emptyTickets) {
    recommendations.push({
      severity: "info",
      text: `Ticket “${t.title}” has no bids yet — invite contractors or search local pros.`,
      href: "/discover",
    });
  }

  const awaitingDecision = await q<{ name: string }>(
    `SELECT name FROM scheduled_events WHERE status = 'awaiting_decision' LIMIT 2`
  );
  for (const e of awaitingDecision) {
    recommendations.push({
      severity: "info",
      text: `“${e.name}” is awaiting a decision — review and confirm.`,
      href: "/schedule",
    });
  }

  const awaitingInvoice = await q<{ title: string }>(
    `SELECT j.title FROM jobs j WHERE j.status = 'done'
     AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id) LIMIT 2`
  );
  for (const j of awaitingInvoice) {
    recommendations.push({
      severity: "info",
      text: `“${j.title}” is done but has no invoice on file — upload it to keep reports accurate.`,
      href: "/invoices",
    });
  }

  const year = today.slice(0, 4);
  const pr = await plannedVsReactive(year);
  const totalPR = pr.planned + pr.reactive;
  if (totalPR > 0 && pr.reactive / totalPR > 0.35) {
    recommendations.push({
      severity: "info",
      text: `Reactive work is ${Math.round((pr.reactive / totalPR) * 100)}% of this year's spend — adding recurring maintenance usually lowers total cost.`,
      href: "/schedule",
    });
  }

  return { property, recentJobs, recommendations: recommendations.slice(0, 5) };
}

// ------------------------------------------------------ material estimates

export interface MaterialEstimateRow {
  id: number;
  bid_request_id: number | null;
  bid_id: number | null;
  title: string;
  query: string | null;
  items: string; // JSON MaterialItem[]
  total: number;
  source: string | null;
  created_at: string;
  request_title: string | null;
  bid_vendor: string | null;
}

export async function listMaterialEstimates() {
  return q<MaterialEstimateRow>(
    `SELECT e.*, r.title AS request_title, b.vendor_name AS bid_vendor
     FROM material_estimates e
     LEFT JOIN bid_requests r ON r.id = e.bid_request_id
     LEFT JOIN bids b ON b.id = e.bid_id
     ORDER BY e.id DESC LIMIT 25`
  );
}

// ------------------------------------------------------------------ users

export async function listUsers() {
  // Explicit columns: the pending phone_verify_code must never reach the client.
  return q<User & { properties: number }>(
    `SELECT u.id, u.name, u.email, u.role, u.last_active, u.theme_prefs, u.phone, u.phone_verified,
       (SELECT COUNT(*)::int FROM user_properties up WHERE up.user_id = u.id) AS properties
     FROM users u ORDER BY CASE u.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END`
  );
}

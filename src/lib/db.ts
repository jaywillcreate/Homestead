import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

/**
 * SQLite data layer. The database file and uploaded files live in ./storage,
 * which is created on demand. Schema is applied idempotently on first open.
 */

const STORAGE_DIR = path.join(process.cwd(), "storage");
const DB_PATH = path.join(STORAGE_DIR, "homestead.db");

export const UPLOADS_DIR = path.join(STORAGE_DIR, "uploads");

declare global {
  // eslint-disable-next-line no-var
  var __homesteadDb: Database.Database | undefined;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','viewer')),
  last_active TEXT,
  theme_prefs TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  address TEXT,
  owner_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS user_properties (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, property_id)
);

CREATE TABLE IF NOT EXISTS contractors (
  id INTEGER PRIMARY KEY,
  business_name TEXT NOT NULL,
  trade TEXT NOT NULL,
  primary_contact TEXT,
  phone TEXT,
  email TEXT,
  license_number TEXT,
  hourly_rate REAL,
  insurance_expires TEXT,
  service_area_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','archived')),
  tags TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  notes TEXT,
  preferred INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contractor_documents (
  id INTEGER PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('insurance','license','warranty','other')),
  stored_path TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  trade TEXT,
  performed_on TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  amount REAL NOT NULL DEFAULT 0,
  planned INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id),
  vendor TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  due_date TEXT,
  total REAL NOT NULL DEFAULT 0,
  category TEXT,
  warranty_months INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid','overdue')),
  source_file TEXT,
  source_filename TEXT,
  parse_confidence REAL,
  parsed_at TEXT,
  confirmed_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','filed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'labor' CHECK (type IN ('labor','parts','fees')),
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_photos (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stored_path TEXT NOT NULL,
  original_name TEXT,
  caption TEXT,
  stage TEXT NOT NULL DEFAULT 'record' CHECK (stage IN ('before','during','after','record')),
  taken_at TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id INTEGER PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  name TEXT NOT NULL,
  trade TEXT,
  cadence TEXT NOT NULL DEFAULT 'annual' CHECK (cadence IN ('quarterly','semiannual','annual','one_off')),
  assigned_contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  estimated_cost REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_events (
  id INTEGER PRIMARY KEY,
  task_id INTEGER REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id),
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  trade TEXT,
  scheduled_for TEXT NOT NULL,
  time_window TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('confirmed','todo','overdue','awaiting_decision','needs_pro','done')),
  cost REAL,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS bid_requests (
  id INTEGER PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  title TEXT NOT NULL,
  scope TEXT,
  posted_at TEXT NOT NULL DEFAULT (datetime('now')),
  closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','accepted'))
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY,
  bid_request_id INTEGER NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  meta TEXT,
  price REAL,
  start_date TEXT,
  rating REAL,
  review_count INTEGER,
  review_excerpt TEXT,
  badge TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','awaiting','accepted','declined'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_contractor ON jobs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_photos_job ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON scheduled_events(scheduled_for);
`;

export function getDb(): Database.Database {
  if (globalThis.__homesteadDb) return globalThis.__homesteadDb;
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  globalThis.__homesteadDb = db;
  return db;
}

export function logActivity(kind: string, message: string) {
  getDb()
    .prepare("INSERT INTO activity_log (kind, message) VALUES (?, ?)")
    .run(kind, message);
}

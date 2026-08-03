import { Pool, types } from "pg";

/**
 * Postgres data layer (Neon on Vercel, any Postgres locally).
 * Connection comes from DATABASE_URL. Schema is applied idempotently on the
 * first query of each cold start.
 *
 * Conventions carried over from the original SQLite schema:
 *  - dates are TEXT 'YYYY-MM-DD' and timestamps TEXT 'YYYY-MM-DD HH24:MI:SS' (UTC),
 *    so substr()-based month bucketing works identically;
 *  - money is double precision; counts are cast ::int in queries.
 */

// numeric (OID 1700) arrives as string by default — parse to JS number.
types.setTypeParser(1700, (v) => parseFloat(v));
// int8/bigint (OID 20) — counts fit safely in JS numbers here.
types.setTypeParser(20, (v) => parseInt(v, 10));

declare global {
  // eslint-disable-next-line no-var
  var __homesteadPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __homesteadSchemaReady: Promise<void> | undefined;
}

const NOW_UTC = `to_char(now() at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','manager','viewer')),
  last_active TEXT,
  theme_prefs TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
);

CREATE TABLE IF NOT EXISTS properties (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
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
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_name TEXT NOT NULL,
  trade TEXT NOT NULL,
  primary_contact TEXT,
  phone TEXT,
  email TEXT,
  license_number TEXT,
  hourly_rate DOUBLE PRECISION,
  insurance_expires TEXT,
  service_area_notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','archived')),
  tags TEXT NOT NULL DEFAULT '[]',
  rating DOUBLE PRECISION,
  notes TEXT,
  preferred INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW_UTC},
  updated_at TEXT NOT NULL DEFAULT ${NOW_UTC},
  updated_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contractor_documents (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('insurance','license','warranty','other')),
  stored_path TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  trade TEXT,
  performed_on TEXT,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  planned INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id),
  vendor TEXT,
  invoice_number TEXT,
  invoice_date TEXT,
  due_date TEXT,
  total DOUBLE PRECISION NOT NULL DEFAULT 0,
  category TEXT,
  warranty_months INTEGER,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('paid','unpaid','overdue')),
  source_file TEXT,
  source_filename TEXT,
  parse_confidence DOUBLE PRECISION,
  parsed_at TEXT,
  confirmed_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','filed')),
  created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'labor' CHECK (type IN ('labor','parts','fees')),
  amount DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS job_photos (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stored_path TEXT NOT NULL,
  original_name TEXT,
  caption TEXT,
  stage TEXT NOT NULL DEFAULT 'record' CHECK (stage IN ('before','during','after','record')),
  taken_at TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  name TEXT NOT NULL,
  trade TEXT,
  cadence TEXT NOT NULL DEFAULT 'annual' CHECK (cadence IN ('quarterly','semiannual','annual','one_off')),
  assigned_contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  estimated_cost DOUBLE PRECISION,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS scheduled_events (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id INTEGER REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id),
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  trade TEXT,
  scheduled_for TEXT NOT NULL,
  time_window TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('confirmed','todo','overdue','awaiting_decision','needs_pro','done')),
  cost DOUBLE PRECISION,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS bid_requests (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  property_id INTEGER REFERENCES properties(id),
  title TEXT NOT NULL,
  scope TEXT,
  posted_at TEXT NOT NULL DEFAULT ${NOW_UTC},
  closes_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','accepted'))
);

CREATE TABLE IF NOT EXISTS bids (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bid_request_id INTEGER NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
  contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL,
  meta TEXT,
  price DOUBLE PRECISION,
  start_date TEXT,
  rating DOUBLE PRECISION,
  review_count INTEGER,
  review_excerpt TEXT,
  badge TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','awaiting','accepted','declined'))
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ${NOW_UTC}
);

CREATE INDEX IF NOT EXISTS idx_jobs_contractor ON jobs(contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_photos_job ON job_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON scheduled_events(scheduled_for);

-- In-place migrations for databases created before these columns existed.
ALTER TABLE bids ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS favorable INTEGER;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE bid_requests ADD COLUMN IF NOT EXISTS budget DOUBLE PRECISION;
`;

function getPool(): Pool {
  if (globalThis.__homesteadPool) return globalThis.__homesteadPool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Locally: add it to .env.local. On Vercel: create a Neon Postgres database under Storage and connect it to this project."
    );
  }
  const pool = new Pool({
    connectionString: url,
    max: 3, // serverless-friendly; Neon's pooled endpoint handles fan-out
    idleTimeoutMillis: 30_000,
  });
  globalThis.__homesteadPool = pool;
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!globalThis.__homesteadSchemaReady) {
    globalThis.__homesteadSchemaReady = (async () => {
      await getPool().query(SCHEMA);
    })().catch((err) => {
      globalThis.__homesteadSchemaReady = undefined;
      throw err;
    });
  }
  return globalThis.__homesteadSchemaReady;
}

/** Run a parameterized query and get all rows. */
export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  await ensureSchema();
  const res = await getPool().query(text, params);
  return res.rows as T[];
}

/** Run a parameterized query and get the first row (or null). */
export async function qOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Run a statement; returns the inserted id when the query has RETURNING id. */
export async function run(text: string, params: unknown[] = []): Promise<number | null> {
  const rows = await q<{ id?: number }>(text, params);
  return rows[0]?.id ?? null;
}

export async function logActivity(kind: string, message: string): Promise<void> {
  await run("INSERT INTO activity_log (kind, message) VALUES ($1, $2)", [kind, message]);
}

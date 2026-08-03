# Homestead — House Maintenance Manager

A full-stack implementation of the Homestead design handoff: contractor CRM with a CMS,
AI invoice parsing, job-photo records, spend reports, a maintenance schedule, local-pro
bid comparison, and tiered user roles — all themed with the five built-in palettes plus
a custom theme builder.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | URL-routed screens per the spec, server components for data, API routes for the backend |
| Database | SQLite via better-sqlite3 (`storage/homestead.db`) | Zero-config, file-based, perfect for a household app; schema auto-applies on first run |
| Styling | Hand-built CSS design system (`src/app/globals.css`) | The handoff specifies exact tokens; tonal ramps derive via `color-mix` so themes are a token swap |
| Auth | Cookie sessions + profile picker | Passwordless household sign-in; roles enforced **server-side** on every API route |
| AI parsing | Claude API (`claude-opus-5`) with structured outputs | Extracts vendor, dates, totals, and labor/parts/fees line items from PDF/JPG scans |
| File storage | `storage/uploads/`, served via auth-gated `/api/files/*` | Invoice scans and job photos never leave your machine |

## Quick start

```bash
cd homestead
npm install
npm run db:seed     # seeds contractors, 2 years of jobs/invoices, schedule, bids, 3 users
npm run dev         # http://localhost:3000
```

Sign in as **Jason Williams (Owner)**, **Alex Rivera (Manager)**, or **Dana Whitfield
(Viewer)** to see each permission tier. Re-running `db:seed` resets all data.

### Enable AI invoice parsing (optional)

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY=sk-ant-...
```

Restart the dev server, then drop a PDF/JPG/HEIC invoice on the Invoices screen. Fields,
line items, and a confidence score are extracted and fuzzy-matched to a contractor in
your book — always as an editable draft you confirm. Without a key, uploads still work
with manual field entry (the scan is kept either way).

### Enable live local-pro search (optional)

Set `GOOGLE_PLACES_API_KEY` in `.env.local` (Places API New). The Find pros screen then
returns real nearby contractors with ratings and review excerpts; without it, it shows
labeled sample data so the flow is demonstrable.

## Screens

| Route | Screen |
| --- | --- |
| `/` | Dashboard — two switchable layouts (Command / Timeline) |
| `/contractors` | Directory with trade filter chips + search |
| `/contractors/:id` | Profile: facts, job history, contact, notes, documents |
| `/contractors/new`, `/contractors/:id/edit` | Contractor CMS form with validation (license required for licensed trades, insurance-lapse warnings) |
| `/invoices` | Dropzone → parse → editable draft → confirm & file; recent invoices table |
| `/photos` | Job photo grids with Before/During/After/Record stages + uploader |
| `/reports` | Monthly reports: Trend / Mix / Cadence chart tabs, print-to-PDF export |
| `/discover` | Open bid request comparison + local pro search |
| `/users` | People table, permissions matrix, role preview, invites (Owner only) |
| `/schedule` | Month calendar with event chips, detail card, recurring plan |

## Architecture notes

- **Roles** (`src/lib/permissions.ts`) — the permissions matrix from the design is the
  single source of truth; `requirePermission()` gates every mutating API route, and the
  UI additionally hides affordances a role lacks. Try editing a contractor as Dana
  (Viewer): the buttons are gone, and the API would return 403 regardless.
- **Invoice parsing** (`src/lib/invoice-parser.ts`) — Claude vision + structured outputs
  (Zod schema). Parse failures never discard the upload: the scan stays visible and the
  form drops to manual entry.
- **Reports** (`src/lib/queries.ts`) — all aggregations are SQL (spend by month/category/
  contractor, YoY, labor/parts/fees split, planned vs. reactive, month×trade heatmap).
- **Theming** (`src/lib/themes.ts`) — a theme is three colors over a dark/light ground.
  ~40 CSS variables are written to the document root; tonal ramps derive in CSS via
  `color-mix(in oklab, …)`. Custom themes persist per user server-side.
- **Soft deletes** — deleting a contractor archives it, preserving job/invoice history.

## Deploying

### Vercel (planned target)

Connecting the GitHub repo to Vercel is zero-config for the build — `next build` passes
as-is (verified). **But two pieces of this app assume a persistent disk, which Vercel's
serverless runtime does not have:**

| Local piece | Why it breaks on Vercel | Serverless replacement |
| --- | --- | --- |
| SQLite at `storage/homestead.db` | Serverless filesystems are read-only/ephemeral — data written during a request vanishes | Postgres (Neon via Vercel Marketplace) — swap `src/lib/db.ts` + `src/lib/queries.ts` |
| Uploads in `storage/uploads/` | Same — uploaded scans/photos disappear between invocations | Vercel Blob or S3/R2 — swap the write paths in the upload routes + `/api/files` |

Both are deliberately isolated behind small modules, so the migration is contained.
Until that swap is done, treat a Vercel deployment as a **preview of the UI only** —
records created there will not persist.

Vercel setup once the repo is on GitHub:

1. vercel.com → Add New Project → Import the `homestead` repo (framework auto-detects
   Next.js; no build settings needed).
2. Add environment variables as desired: `ANTHROPIC_API_KEY` (AI invoice parsing),
   `GOOGLE_PLACES_API_KEY` (live local-pro search).
3. Every push to `main` auto-deploys; pull requests get preview deployments.

Also note the profile-picker sign-in is designed for a trusted household — add a real
identity layer (e.g. next-auth with Google sign-in) before sharing a public URL.

### Self-hosted (works today, zero changes)

`npm run build && npm run start` on any box with Node — Mac mini, home server, Raspberry
Pi-class hardware. Keep `storage/` on persistent disk and back it up (it is the entire
application state). Put it behind Tailscale or a VPN for access away from home.

## Project layout

```
src/
  app/                 App Router pages + API routes
    (app)/             Authenticated shell (nav rail + app bar)
    api/               REST endpoints (auth, contractors, invoices, photos,
                       events, tasks, bids, users, discover, files, prefs)
  components/          Screen components (client) — Dashboard, InvoiceWorkbench,
                       ScheduleView, ReportsView, ContractorForm, …
  lib/                 db, queries (SQL aggregations), auth, permissions,
                       themes, invoice-parser, discovery, validation schemas
scripts/seed.ts        Seed data matching the design handoff
storage/               SQLite DB + uploaded files (gitignored)
```

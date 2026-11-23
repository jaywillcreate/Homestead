# Homestead — House Maintenance Manager

A full-stack implementation of the Homestead design handoff: contractor CRM with a CMS,
AI invoice parsing, job-photo records, spend reports, a maintenance schedule, local-pro
bid comparison, and tiered user roles — all themed with the five built-in palettes plus
a custom theme builder.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript | URL-routed screens per the spec, server components for data, API routes for the backend |
| Database | Postgres via `pg` (Neon on Vercel, any Postgres locally) | Serverless-compatible; schema auto-applies on first query; `DATABASE_URL` is the only config |
| Styling | Hand-built CSS design system (`src/app/globals.css`) | The handoff specifies exact tokens; tonal ramps derive via `color-mix` so themes are a token swap |
| Auth | Email + password, cookie sessions, invite links | Passwords hashed with scrypt; people are added by one-time invite link; roles enforced **server-side** on every API route |
| AI parsing | Claude API (`claude-opus-5`) with structured outputs | Extracts vendor, dates, totals, and labor/parts/fees line items from PDF/JPG scans |
| File storage | Vercel Blob in production, `storage/uploads/` locally | `src/lib/storage.ts` switches on `BLOB_READ_WRITE_TOKEN`; local files served via auth-gated `/api/files/*` |

## Quick start

```bash
cd homestead
npm install
brew install postgresql@17 && brew services start postgresql@17 && createdb homestead
cp .env.example .env.local   # set DATABASE_URL=postgres://localhost:5432/homestead
npm run db:seed     # creates the owner account + a starter property, prints a set-password link
npm run dev         # http://localhost:3000
```

Open the printed link to choose the owner's password, then sign in with that email and
password. `db:seed` never deletes anything and is safe to re-run.

### Command-line scripts

| Command | What it does |
| --- | --- |
| `npm run db:seed` | First-run setup: owner account (`OWNER_NAME` / `OWNER_EMAIL` to override), starter property, set-password link. Non-destructive. |
| `npm run user:link -- you@example.com` | Prints a fresh one-time set-password link for an existing account — the way back in if an owner is locked out. |
| `npm run db:cleanup` | **Dry run** listing the demo data and extra users that would be removed. Add `-- --yes` to actually remove them (keeps one owner, default `jaywillcreate@gmail.com`, plus properties and branding). Cannot be undone. |
| `npm run db:seed:demo` | Optional made-up contractors, invoices, schedule and bids for exploring the app. Replaces the data tables; leaves people and properties alone. |

Every script prints which database it is about to touch. Set `APP_URL` so printed links
point at the deployed site.

### People & sign-in

Owners add people from **Users & roles → Add person**. That creates the account in an
"invited" state and shows a one-time link (valid 7 days) to copy or email; the person
chooses their own password from it. From **Manage**, an owner can rename, change role,
create a password-reset link, disable sign-in, or remove a person. The last active owner
can't be demoted, disabled or removed. Sessions last 30 days; resetting or changing a
password signs out other devices; eight failed sign-ins lock an email for 15 minutes.

### Enable AI invoice parsing (optional)

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY=sk-ant-...
```

Restart the dev server, then drop a PDF/JPG/HEIC invoice on the Invoices screen. Fields,
line items, and a confidence score are extracted and fuzzy-matched to a contractor in
your book — always as an editable draft you confirm. Without a key, uploads still work
with manual field entry (the scan is kept either way).

### Materials: stores and vendor pricing by ZIP

The Materials screen takes a ZIP code (defaulting to your first property's) and:

- lists building-supply stores within ~15 miles — from OpenStreetMap with no key, or
  Google Places when `GOOGLE_PLACES_API_KEY` is set;
- lets you **Shop** any line item: with `SERPAPI_API_KEY` set it searches The Home Depot's
  catalog for that ZIP (price, pickup stock at a chosen store, delivery) and drops the
  chosen listing's price and link into the estimate; without the key it offers search
  links into Home Depot, Lowe's, Menards, Ace and Google Shopping;
- passes the ZIP to Claude's web research so researched prices are local.

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
| `/users` | People table, invite / reset links, disable & remove, permissions matrix, role preview |
| `/properties` | Property cards with photos; add / edit (Owner) |
| `/properties/:id` | Full profile: alerts, value & yearly costs, insurance & HOA, shutoffs, systems & appliance inventory with warranty tracking, document vault, paint records, maintenance history |
| `/materials` | Materials estimator: researched list, stores near a ZIP, per-item retailer pricing |
| `/login`, `/invite/:token` | Sign in · set a password from an invite or reset link |
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

## Deploying to Vercel

The app is fully serverless-compatible: Postgres for data, Vercel Blob for uploads.
One-time setup in the Vercel dashboard (project → **Storage** tab):

1. **Create a Database → Neon (Postgres)** and connect it to the project. This injects
   `DATABASE_URL` into the project's environment automatically.
2. **Create a Blob store** and connect it. This injects `BLOB_READ_WRITE_TOKEN`.
3. Optionally add `ANTHROPIC_API_KEY` (AI invoice parsing) and `GOOGLE_PLACES_API_KEY`
   (live local-pro search) under project → Settings → Environment Variables.
4. **Redeploy** (push any commit, or Deployments → Redeploy) so the new env takes effect.
5. **Set up the production database once** — copy the Neon `DATABASE_URL` from Vercel
   (Storage → your database → `.env.local` snippet) into your local `.env.local`,
   run `APP_URL=https://<your-site> npm run db:seed`, open the printed link to set the
   owner password, then switch `.env.local` back to your local Postgres. The schema
   itself auto-creates on first request. On an empty database the login screen tells
   you to run this.

Every push to `main` auto-deploys; pull requests get preview deployments.

Notes:
- Uploaded files live in Vercel Blob at public-but-unguessable URLs (standard Blob
  behavior); the database and all app screens remain session-gated.
- After the first deploy of the password sign-in, run `APP_URL=https://<your-site> npm run user:link -- <owner email>`
  against the production database to get the owner's set-password link.

## Self-hosting

Works anywhere Node + Postgres run: `npm run build && npm run start` with
`DATABASE_URL` set. Without `BLOB_READ_WRITE_TOKEN`, uploads store on local disk under
`storage/uploads/` — keep that folder (and your Postgres data) backed up.

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
scripts/               seed (first-run setup), user-link, cleanup-demo, seed-demo
storage/               Locally uploaded files (gitignored)
```

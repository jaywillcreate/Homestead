/**
 * Seed the Homestead database with the design handoff's illustrative data.
 * Run: npm run db:seed   (idempotent — wipes and recreates data tables)
 */
import fs from "fs";
import path from "path";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { getDb, UPLOADS_DIR } from "../src/lib/db.ts";

const db = getDb();

const wipe = [
  "activity_log",
  "bids",
  "bid_requests",
  "scheduled_events",
  "maintenance_tasks",
  "job_photos",
  "invoice_line_items",
  "invoices",
  "jobs",
  "contractor_documents",
  "contractors",
  "user_properties",
  "properties",
  "sessions",
  "users",
];
for (const t of wipe) db.prepare(`DELETE FROM ${t}`).run();

// ---------------------------------------------------------------- users
const insertUser = db.prepare(
  "INSERT INTO users (name, email, role, last_active) VALUES (?, ?, ?, datetime('now', ?))"
);
const jason = insertUser.run("Jason Williams", "jaywillcreate@gmail.com", "owner", "-1 hours").lastInsertRowid as number;
const alex = insertUser.run("Alex Rivera", "alex.rivera@example.com", "manager", "-1 days").lastInsertRowid as number;
const dana = insertUser.run("Dana Whitfield", "dana.whitfield@example.com", "viewer", "-6 days").lastInsertRowid as number;

const propId = db
  .prepare("INSERT INTO properties (label, address, owner_id) VALUES (?, ?, ?)")
  .run("Primary residence", "4218 Cedar Creek Ln", jason).lastInsertRowid as number;
for (const u of [jason, alex, dana])
  db.prepare("INSERT INTO user_properties (user_id, property_id) VALUES (?, ?)").run(u, propId);

// ---------------------------------------------------------- contractors
interface SeedContractor {
  name: string; trade: string; contact: string; phone: string; email: string;
  license: string | null; rate: number; rating: number; preferred: number; tags: string[];
}
const contractorSeeds: SeedContractor[] = [
  { name: "Delgado Plumbing & Drain", trade: "Plumbing", contact: "Marco Delgado", phone: "(210) 555-0147", email: "office@delgadoplumbing.com", license: "M-40412", rate: 125, rating: 4.8, preferred: 1, tags: ["Responsive", "Warranty work"] },
  { name: "Arcline Electric", trade: "Electrical", contact: "Priya Shah", phone: "(210) 555-0164", email: "dispatch@arclineelectric.com", license: "TECL-33891", rate: 110, rating: 4.6, preferred: 1, tags: ["Panel work"] },
  { name: "Northgate HVAC", trade: "HVAC", contact: "Ray Coleman", phone: "(210) 555-0180", email: "service@northgatehvac.com", license: "TACLA-58223", rate: 135, rating: 4.9, preferred: 1, tags: ["Maintenance plan"] },
  { name: "Truepaint Interiors", trade: "Painting", contact: "Lena Ortiz", phone: "(210) 555-0128", email: "hello@truepaint.co", license: null, rate: 85, rating: 4.4, preferred: 0, tags: ["Interior"] },
  { name: "Bexar Pest Solutions", trade: "Pest control", contact: "Gil Navarro", phone: "(210) 555-0195", email: "gil@bexarpest.com", license: "TPCL-77104", rate: 95, rating: 4.7, preferred: 1, tags: ["Quarterly plan"] },
  { name: "Halvorsen Builders", trade: "General contracting", contact: "Erik Halvorsen", phone: "(210) 555-0102", email: "erik@halvorsenbuilders.com", license: null, rate: 150, rating: 4.5, preferred: 0, tags: ["Remodel"] },
  { name: "Green Ridge Lawn & Tree", trade: "Outdoor & landscaping", contact: "Tomás Vega", phone: "(210) 555-0171", email: "crew@greenridgelawn.com", license: null, rate: 70, rating: 4.2, preferred: 1, tags: ["Seasonal"] },
  { name: "Sentinel Backflow Testing", trade: "Backflow & irrigation", contact: "June Park", phone: "(210) 555-0139", email: "june@sentinelbackflow.com", license: "BPAT-2210", rate: 105, rating: 5.0, preferred: 1, tags: ["Certification"] },
];
const insertContractor = db.prepare(`
  INSERT INTO contractors (business_name, trade, primary_contact, phone, email, license_number,
    hourly_rate, insurance_expires, service_area_notes, status, tags, rating, preferred, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`);
const cid: Record<string, number> = {};
for (const c of contractorSeeds) {
  cid[c.name] = insertContractor.run(
    c.name, c.trade, c.contact, c.phone, c.email, c.license, c.rate,
    "2027-03-01", "Greater San Antonio · 25 mi radius", JSON.stringify(c.tags),
    c.rating, c.preferred, jason
  ).lastInsertRowid as number;
}

db.prepare(
  "INSERT INTO contractor_documents (contractor_id, filename, size, kind) VALUES (?, ?, ?, ?)"
).run(cid["Delgado Plumbing & Drain"], "COI-2026-delgado.pdf", 182_000, "insurance");
db.prepare(
  "INSERT INTO contractor_documents (contractor_id, filename, size, kind) VALUES (?, ?, ?, ?)"
).run(cid["Delgado Plumbing & Drain"], "water-heater-warranty.pdf", 96_000, "warranty");

// ------------------------------------------------------- jobs & invoices
// Monthly totals engineered to match the design figures:
// 2026 Jan–Jul sums to $18,940 YTD with July at $2,445; 2025 July ≈ $2,021 (+21% YoY).
// July is 1160 seeded + the $1,285 water-heater job below = $2,445 total.
const MONTHS_2026 = [2900, 2350, 3100, 2600, 2745, 2800, 1160];
const MONTHS_2025 = [1800, 2100, 2400, 2300, 2050, 2600, 2021, 2380, 2150, 2500, 2700, 2450];

// Rotation of (contractor, category, planned) used to split each month's spend.
const rotation: [string, string, string, number][] = [
  ["Northgate HVAC", "HVAC", "Seasonal tune-up & filter service", 1],
  ["Delgado Plumbing & Drain", "Plumbing", "Water heater & supply line service", 0],
  ["Green Ridge Lawn & Tree", "Outdoor", "Lawn treatment & tree trim", 1],
  ["Arcline Electric", "Electrical", "Panel & GFCI maintenance", 1],
  ["Bexar Pest Solutions", "Pest control", "Quarterly pest treatment", 1],
  ["Truepaint Interiors", "Painting", "Interior touch-up & trim", 0],
  ["Sentinel Backflow Testing", "Backflow & irrigation", "Backflow test & irrigation check", 1],
  ["Halvorsen Builders", "General", "Carpentry & repair punch list", 0],
];

const insertJob = db.prepare(`
  INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, location, status, amount, planned, notes)
  VALUES (?, ?, ?, ?, ?, ?, 'done', ?, ?, NULL)`);
const insertInvoice = db.prepare(`
  INSERT INTO invoices (job_id, contractor_id, property_id, vendor, invoice_number, invoice_date,
    due_date, total, category, warranty_months, payment_status, status, parse_confidence, parsed_at, confirmed_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'filed', ?, ?, ?)`);
const insertLine = db.prepare(
  "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES (?, ?, ?, ?)"
);

let invoiceCounter = 11000;
function seedMonth(year: number, monthIdx: number, total: number) {
  const parts = monthIdx % 2 === 0 ? 2 : 3; // 2–3 jobs a month
  const shares = parts === 2 ? [0.62, 0.38] : [0.5, 0.3, 0.2];
  let allocated = 0;
  for (let p = 0; p < parts; p++) {
    const rot = rotation[(monthIdx * 3 + p * 2 + (year % 4)) % rotation.length];
    const [cname, category, title, planned] = rot;
    const amount =
      p === parts - 1 ? Math.round((total - allocated) * 100) / 100 : Math.round(total * shares[p]);
    allocated += amount;
    const day = String(4 + p * 9).padStart(2, "0");
    const date = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${day}`;
    const jobId = insertJob.run(
      propId, cid[cname], title, category, date, "4218 Cedar Creek Ln", amount, planned
    ).lastInsertRowid as number;
    const labor = Math.round(amount * 0.64 * 100) / 100;
    const partsAmt = Math.round(amount * 0.3 * 100) / 100;
    const fees = Math.round((amount - labor - partsAmt) * 100) / 100;
    const invId = insertInvoice.run(
      jobId, cid[cname], propId, cname, `INV-${invoiceCounter++}`, date, date, amount, category,
      12, "paid", 0.96, date, jason
    ).lastInsertRowid as number;
    insertLine.run(invId, `${title} — labor`, "labor", labor);
    insertLine.run(invId, "Materials & parts", "parts", partsAmt);
    if (fees > 0) insertLine.run(invId, "Trip & disposal fees", "fees", fees);
  }
}
MONTHS_2025.forEach((t, i) => seedMonth(2025, i, t));
MONTHS_2026.forEach((t, i) => seedMonth(2026, i, t));

// The featured water-heater job from the invoice screen (part of July 2026 spend).
const whJob = insertJob.run(
  propId, cid["Delgado Plumbing & Drain"], "Water heater replacement", "Plumbing",
  "2026-07-18", "Garage utility closet", 1285, 0
).lastInsertRowid as number;
const whInv = insertInvoice.run(
  whJob, cid["Delgado Plumbing & Drain"], propId, "Delgado Plumbing & Drain", "DP-11482",
  "2026-07-18", "2026-08-17", 1285, "Plumbing", 12, "unpaid", 0.96, "2026-07-18 14:05:00", null
).lastInsertRowid as number;
insertLine.run(whInv, "Rheem 50-gal gas water heater", "parts", 430);
insertLine.run(whInv, "Expansion tank & flex connectors", "parts", 75);
insertLine.run(whInv, "Removal & disposal of old unit", "labor", 120);
insertLine.run(whInv, "Install labor (4.5 hrs)", "labor", 560);
insertLine.run(whInv, "Permit & inspection fee", "fees", 100);

// Open jobs for the dashboard metric: two in flight, one awaiting its invoice.
db.prepare(
  `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, location, status, amount, planned)
   VALUES (?, ?, ?, ?, NULL, ?, 'in_progress', 0, 1)`
).run(propId, cid["Halvorsen Builders"], "Fence post layout & materials staging", "General", "North property line");
db.prepare(
  `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, location, status, amount, planned)
   VALUES (?, ?, ?, ?, NULL, ?, 'in_progress', 0, 1)`
).run(propId, cid["Truepaint Interiors"], "Hallway & trim repaint", "Painting", "Interior");
db.prepare(
  `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, location, status, amount, planned)
   VALUES (?, ?, ?, ?, '2026-08-01', ?, 'done', 0, 1)`
).run(propId, cid["Bexar Pest Solutions"], "Quarterly pest treatment (Aug)", "Pest control", "Perimeter");

// A couple of open invoices for the "Recent invoices" table variety.
const overdueInv = insertInvoice.run(
  null, cid["Green Ridge Lawn & Tree"], propId, "Green Ridge Lawn & Tree", "GR-2214",
  "2026-06-25", "2026-07-10", 340, "Outdoor", null, "overdue", 0.91, "2026-06-25 10:00:00", null
).lastInsertRowid as number;
insertLine.run(overdueInv, "Storm limb removal", "labor", 340);

// --------------------------------------------------------------- photos
const seedPhotoDir = path.join(UPLOADS_DIR, "seed");
fs.mkdirSync(seedPhotoDir, { recursive: true });
const stages: ["before" | "during" | "after" | "record", string][] = [
  ["before", "Old 40-gal unit, corrosion at the base"],
  ["during", "New supply lines & expansion tank"],
  ["after", "Installed unit with drain pan"],
  ["record", "Data plate & serial number"],
];
const photoInsert = db.prepare(`
  INSERT INTO job_photos (job_id, stored_path, original_name, caption, stage, taken_at, uploaded_by)
  VALUES (?, ?, ?, ?, ?, ?, ?)`);
stages.forEach(([stage, caption], i) => {
  const file = `seed/photo-${stage}.svg`;
  const hue = [265, 190, 150, 40][i];
  fs.writeFileSync(
    path.join(seedPhotoDir, `photo-${stage}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${hue},28%,16%)"/><rect x="24" y="24" width="592" height="432" rx="16" fill="none" stroke="hsl(${hue},45%,42%)" stroke-width="2" stroke-dasharray="8 8"/><text x="320" y="236" fill="hsl(${hue},45%,68%)" font-family="system-ui" font-size="26" text-anchor="middle">${stage.toUpperCase()}</text><text x="320" y="272" fill="hsl(${hue},25%,55%)" font-family="system-ui" font-size="15" text-anchor="middle">Water heater replacement</text></svg>`
  );
  photoInsert.run(whJob, file, `IMG_20${i + 40}.jpg`, caption, stage, "2026-07-18", jason);
});

// ---------------------------------------------------- maintenance tasks
const taskSeeds: [string, string, string, string | null, string][] = [
  // name, trade, cadence, contractor, next due (ISO)
  ["Gutter clearing", "Outdoor", "semiannual", "Green Ridge Lawn & Tree", "2026-08-14"],
  ["HVAC filter change", "HVAC", "quarterly", null, "2026-08-11"],
  ["Backflow certification", "Backflow & irrigation", "annual", "Sentinel Backflow Testing", "2026-09-12"],
  ["Irrigation zone check", "Backflow & irrigation", "semiannual", "Sentinel Backflow Testing", "2026-08-22"],
  ["Water heater flush", "Plumbing", "annual", "Delgado Plumbing & Drain", "2027-01-16"],
  ["Termite inspection", "Pest control", "annual", "Bexar Pest Solutions", "2026-08-05"],
  ["Dryer vent cleaning", "HVAC", "annual", null, "2026-08-28"],
  ["Panel & GFCI test", "Electrical", "annual", "Arcline Electric", "2026-11-09"],
  ["Tree canopy trim", "Outdoor", "annual", "Green Ridge Lawn & Tree", "2027-02-20"],
];
const insertTask = db.prepare(`
  INSERT INTO maintenance_tasks (property_id, name, trade, cadence, assigned_contractor_id, estimated_cost)
  VALUES (?, ?, ?, ?, ?, ?)`);
const insertEvent = db.prepare(`
  INSERT INTO scheduled_events (task_id, property_id, contractor_id, name, trade, scheduled_for, time_window, status, cost, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const eventStatus: Record<string, [string, string | null, number | null, string | null]> = {
  // name -> [status, time_window, cost, notes]
  "Termite inspection": ["confirmed", "8–10 AM", 180, "Annual WDI inspection; gate code 4218."],
  "HVAC filter change": ["todo", null, 40, "MERV-13, 16×25×1 — two filters."],
  "Gutter clearing": ["overdue", null, 220, "Book before fall storms; check downspout splash blocks."],
  "Irrigation zone check": ["todo", "Afternoon", 105, "Zone 4 head was misting in June."],
  "Dryer vent cleaning": ["todo", null, 140, "Roof termination — bring 25 ft rods."],
};
for (const [name, trade, cadence, contractor, due] of taskSeeds) {
  const contractorId = contractor ? cid[contractor] : null;
  const taskId = insertTask.run(propId, name, trade, cadence, contractorId, 150)
    .lastInsertRowid as number;
  if (due.startsWith("2026-08") || due.startsWith("2026-09")) {
    const [status, win, cost, notes] = eventStatus[name] ?? ["todo", null, null, null];
    insertEvent.run(taskId, propId, contractorId, name, trade, due, win, status, cost, notes);
  }
}
// The bid-walkthrough event visible on the calendar.
insertEvent.run(
  null, propId, null, "Cedar Creek bid walkthrough", "General", "2026-08-19", "5 PM",
  "awaiting_decision", null, "Walk the fence line with Halvorsen and the two Thumbtack bidders."
);

// ---------------------------------------------------------------- bids
const reqId = db
  .prepare(
    "INSERT INTO bid_requests (property_id, title, scope, posted_at, closes_at, status) VALUES (?, ?, ?, ?, ?, 'open')"
  )
  .run(
    propId,
    "Replace cedar privacy fence — 120 linear ft",
    "Tear out existing 6-ft cedar fence along the north property line, haul away, set new posts in concrete, board-on-board cedar with cap rail. Stain optional — price separately.",
    "2026-07-28",
    "2026-08-05"
  ).lastInsertRowid as number;
const insertBid = db.prepare(`
  INSERT INTO bids (bid_request_id, contractor_id, vendor_name, meta, price, start_date, rating, review_count, review_excerpt, badge, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertBid.run(reqId, cid["Halvorsen Builders"], "Halvorsen Builders", "Known contractor · 2 past jobs", 6840, "2026-08-17", 4.5, 41, "“Kept the site spotless and finished a day early.”", "In your book", "received");
insertBid.run(reqId, null, "Lone Star Fence Co.", "New · 1.4 mi away", 5980, "2026-08-24", 4.6, 213, "“Best price of five quotes and the crew was fast.”", "Best price", "received");
insertBid.run(reqId, null, "Heritage Fence & Deck", "New · 3.2 mi away", 7420, "2026-08-12", 4.9, 388, "“Premium work — the board-on-board detail is flawless.”", "Top rated", "received");
insertBid.run(reqId, null, "Alamo Outdoor Builds", "New · 5.0 mi away", 6510, "2026-08-31", 4.3, 97, "“Solid value, communication could be quicker.”", null, "received");
insertBid.run(reqId, null, "Cedar & Post Co.", "Invited · quote pending", null, null, null, null, null, "Awaiting bid", "awaiting");

// ------------------------------------------------------------- activity
const act = db.prepare("INSERT INTO activity_log (kind, message, created_at) VALUES (?, ?, datetime('now', ?))");
act.run("invoice", "Invoice DP-11482 parsed and matched to Delgado Plumbing", "-2 hours");
act.run("photo", "4 photos added to Water heater replacement", "-1 days");
act.run("bid", "3 of 5 bids returned for the cedar fence request", "-2 days");
act.run("schedule", "Termite inspection confirmed for Aug 5", "-3 days");

console.log("Seeded Homestead database ✔");
console.log(`  DB: storage/homestead.db`);

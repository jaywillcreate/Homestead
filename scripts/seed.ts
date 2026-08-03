/**
 * Seed the Homestead database with the design handoff's illustrative data.
 * Run: npm run db:seed          (uses DATABASE_URL from .env.local)
 * Idempotent — wipes and recreates data tables. Seed photos go to Vercel Blob
 * when BLOB_READ_WRITE_TOKEN is set, otherwise to storage/uploads/.
 */
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { q, qOne, run } from "../src/lib/db.ts";
// @ts-expect-error — .ts extension required by node --experimental-strip-types
import { saveUpload } from "../src/lib/storage.ts";

async function main() {
  const wipe = [
    "activity_log", "bids", "bid_requests", "scheduled_events", "maintenance_tasks",
    "job_photos", "invoice_line_items", "invoices", "jobs", "contractor_documents",
    "contractors", "user_properties", "properties", "sessions", "users",
  ];
  for (const t of wipe) await q(`DELETE FROM ${t}`);

  // ---------------------------------------------------------------- users
  const user = async (name: string, email: string, role: string, offset: string) =>
    (await run(
      `INSERT INTO users (name, email, role, last_active)
       VALUES ($1, $2, $3, to_char(now() at time zone 'utc' - $4::interval, 'YYYY-MM-DD HH24:MI:SS'))
       RETURNING id`,
      [name, email, role, offset]
    ))!;
  const jason = await user("Jason Williams", "jaywillcreate@gmail.com", "owner", "1 hour");
  const alex = await user("Alex Rivera", "alex.rivera@example.com", "manager", "1 day");
  const dana = await user("Dana Whitfield", "dana.whitfield@example.com", "viewer", "6 days");

  const propId = (await run(
    "INSERT INTO properties (label, address, owner_id) VALUES ($1, $2, $3) RETURNING id",
    ["Primary residence", "4218 Cedar Creek Ln", jason]
  ))!;
  for (const u of [jason, alex, dana])
    await run("INSERT INTO user_properties (user_id, property_id) VALUES ($1, $2)", [u, propId]);

  // ---------------------------------------------------------- contractors
  const contractorSeeds: [string, string, string, string, string, string | null, number, number, number, string[]][] = [
    ["Delgado Plumbing & Drain", "Plumbing", "Marco Delgado", "(210) 555-0147", "office@delgadoplumbing.com", "M-40412", 125, 4.8, 1, ["Responsive", "Warranty work"]],
    ["Arcline Electric", "Electrical", "Priya Shah", "(210) 555-0164", "dispatch@arclineelectric.com", "TECL-33891", 110, 4.6, 1, ["Panel work"]],
    ["Northgate HVAC", "HVAC", "Ray Coleman", "(210) 555-0180", "service@northgatehvac.com", "TACLA-58223", 135, 4.9, 1, ["Maintenance plan"]],
    ["Truepaint Interiors", "Painting", "Lena Ortiz", "(210) 555-0128", "hello@truepaint.co", null, 85, 4.4, 0, ["Interior"]],
    ["Bexar Pest Solutions", "Pest control", "Gil Navarro", "(210) 555-0195", "gil@bexarpest.com", "TPCL-77104", 95, 4.7, 1, ["Quarterly plan"]],
    ["Halvorsen Builders", "General contracting", "Erik Halvorsen", "(210) 555-0102", "erik@halvorsenbuilders.com", null, 150, 4.5, 0, ["Remodel"]],
    ["Green Ridge Lawn & Tree", "Outdoor & landscaping", "Tomás Vega", "(210) 555-0171", "crew@greenridgelawn.com", null, 70, 4.2, 1, ["Seasonal"]],
    ["Sentinel Backflow Testing", "Backflow & irrigation", "June Park", "(210) 555-0139", "june@sentinelbackflow.com", "BPAT-2210", 105, 5.0, 1, ["Certification"]],
  ];
  const cid: Record<string, number> = {};
  for (const [name, trade, contact, phone, email, license, rate, rating, preferred, tags] of contractorSeeds) {
    cid[name] = (await run(
      `INSERT INTO contractors (business_name, trade, primary_contact, phone, email, license_number,
         hourly_rate, insurance_expires, service_area_notes, status, tags, rating, preferred, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2027-03-01','Greater San Antonio · 25 mi radius','active',$8,$9,$10,$11)
       RETURNING id`,
      [name, trade, contact, phone, email, license, rate, JSON.stringify(tags), rating, preferred, jason]
    ))!;
  }

  await run(
    "INSERT INTO contractor_documents (contractor_id, filename, size, kind) VALUES ($1,$2,$3,$4) RETURNING id",
    [cid["Delgado Plumbing & Drain"], "COI-2026-delgado.pdf", 182_000, "insurance"]
  );
  await run(
    "INSERT INTO contractor_documents (contractor_id, filename, size, kind) VALUES ($1,$2,$3,$4) RETURNING id",
    [cid["Delgado Plumbing & Drain"], "water-heater-warranty.pdf", 96_000, "warranty"]
  );

  // ------------------------------------------------------- jobs & invoices
  // 2026 Jan–Jul sums to $18,940 YTD with July at $2,445 (1160 seeded + the
  // $1,285 water-heater job below); 2025 July ≈ $2,021 (+21% YoY).
  const MONTHS_2026 = [2900, 2350, 3100, 2600, 2745, 2800, 1160];
  const MONTHS_2025 = [1800, 2100, 2400, 2300, 2050, 2600, 2021, 2380, 2150, 2500, 2700, 2450];

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

  const insertJob = async (
    contractor: number | null, title: string, trade: string | null, date: string | null,
    location: string, amount: number, planned: number, status = "done"
  ) =>
    (await run(
      `INSERT INTO jobs (property_id, contractor_id, title, trade, performed_on, location, status, amount, planned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [propId, contractor, title, trade, date, location, status, amount, planned]
    ))!;
  const insertInvoice = async (
    jobId: number | null, contractor: number | null, vendor: string, num: string,
    date: string, due: string, total: number, category: string, warranty: number | null,
    payment: string, status: string, confirmed: number | null
  ) =>
    (await run(
      `INSERT INTO invoices (job_id, contractor_id, property_id, vendor, invoice_number, invoice_date,
         due_date, total, category, warranty_months, payment_status, status, parse_confidence, parsed_at, confirmed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0.96,$6,$13) RETURNING id`,
      [jobId, contractor, propId, vendor, num, date, due, total, category, warranty, payment, status, confirmed]
    ))!;
  const insertLine = (inv: number, desc: string, type: string, amount: number) =>
    run(
      "INSERT INTO invoice_line_items (invoice_id, description, type, amount) VALUES ($1,$2,$3,$4) RETURNING id",
      [inv, desc, type, amount]
    );

  let invoiceCounter = 11000;
  async function seedMonth(year: number, monthIdx: number, total: number) {
    const parts = monthIdx % 2 === 0 ? 2 : 3;
    const shares = parts === 2 ? [0.62, 0.38] : [0.5, 0.3, 0.2];
    let allocated = 0;
    for (let p = 0; p < parts; p++) {
      const [cname, category, title, planned] = rotation[(monthIdx * 3 + p * 2 + (year % 4)) % rotation.length];
      const amount =
        p === parts - 1 ? Math.round((total - allocated) * 100) / 100 : Math.round(total * shares[p]);
      allocated += amount;
      const date = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(4 + p * 9).padStart(2, "0")}`;
      const jobId = await insertJob(cid[cname], title, category, date, "4218 Cedar Creek Ln", amount, planned);
      const labor = Math.round(amount * 0.64 * 100) / 100;
      const partsAmt = Math.round(amount * 0.3 * 100) / 100;
      const fees = Math.round((amount - labor - partsAmt) * 100) / 100;
      const invId = await insertInvoice(
        jobId, cid[cname], cname, `INV-${invoiceCounter++}`, date, date, amount, category, 12, "paid", "filed", jason
      );
      await insertLine(invId, `${title} — labor`, "labor", labor);
      await insertLine(invId, "Materials & parts", "parts", partsAmt);
      if (fees > 0) await insertLine(invId, "Trip & disposal fees", "fees", fees);
    }
  }
  for (let i = 0; i < MONTHS_2025.length; i++) await seedMonth(2025, i, MONTHS_2025[i]);
  for (let i = 0; i < MONTHS_2026.length; i++) await seedMonth(2026, i, MONTHS_2026[i]);

  // The featured water-heater job from the invoice screen (part of July 2026 spend).
  const whJob = await insertJob(
    cid["Delgado Plumbing & Drain"], "Water heater replacement", "Plumbing",
    "2026-07-18", "Garage utility closet", 1285, 0
  );
  const whInv = await insertInvoice(
    whJob, cid["Delgado Plumbing & Drain"], "Delgado Plumbing & Drain", "DP-11482",
    "2026-07-18", "2026-08-17", 1285, "Plumbing", 12, "unpaid", "filed", null
  );
  await insertLine(whInv, "Rheem 50-gal gas water heater", "parts", 430);
  await insertLine(whInv, "Expansion tank & flex connectors", "parts", 75);
  await insertLine(whInv, "Removal & disposal of old unit", "labor", 120);
  await insertLine(whInv, "Install labor (4.5 hrs)", "labor", 560);
  await insertLine(whInv, "Permit & inspection fee", "fees", 100);

  // Open jobs for the dashboard metric: two in flight, one awaiting its invoice.
  await insertJob(cid["Halvorsen Builders"], "Fence post layout & materials staging", "General", null, "North property line", 0, 1, "in_progress");
  await insertJob(cid["Truepaint Interiors"], "Hallway & trim repaint", "Painting", null, "Interior", 0, 1, "in_progress");
  await insertJob(cid["Bexar Pest Solutions"], "Quarterly pest treatment (Aug)", "Pest control", "2026-08-01", "Perimeter", 0, 1, "done");

  // Overdue invoice for table variety.
  const overdueInv = await insertInvoice(
    null, cid["Green Ridge Lawn & Tree"], "Green Ridge Lawn & Tree", "GR-2214",
    "2026-06-25", "2026-07-10", 340, "Outdoor", null, "overdue", "filed", null
  );
  await insertLine(overdueInv, "Storm limb removal", "labor", 340);

  // --------------------------------------------------------------- photos
  const stages: [string, string, number][] = [
    ["before", "Old 40-gal unit, corrosion at the base", 265],
    ["during", "New supply lines & expansion tank", 190],
    ["after", "Installed unit with drain pan", 150],
    ["record", "Data plate & serial number", 40],
  ];
  for (const [stage, caption, hue] of stages) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="hsl(${hue},30%,22%)"/><rect x="24" y="24" width="592" height="432" rx="16" fill="none" stroke="hsl(${hue},50%,52%)" stroke-width="2" stroke-dasharray="8 8"/><text x="320" y="236" fill="hsl(${hue},55%,75%)" font-family="system-ui" font-size="28" text-anchor="middle">${stage.toUpperCase()}</text><text x="320" y="272" fill="hsl(${hue},30%,62%)" font-family="system-ui" font-size="15" text-anchor="middle">Water heater replacement</text></svg>`;
    const stored = await saveUpload(Buffer.from(svg), `seed/photo-${stage}.svg`, "image/svg+xml");
    await run(
      `INSERT INTO job_photos (job_id, stored_path, original_name, caption, stage, taken_at, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,'2026-07-18',$6) RETURNING id`,
      [whJob, stored, `IMG_${stage}.jpg`, caption, stage, jason]
    );
  }

  // ---------------------------------------------------- maintenance tasks
  const taskSeeds: [string, string, string, string | null, string][] = [
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
  const eventDetail: Record<string, [string, string | null, number | null, string | null]> = {
    "Termite inspection": ["confirmed", "8–10 AM", 180, "Annual WDI inspection; gate code 4218."],
    "HVAC filter change": ["todo", null, 40, "MERV-13, 16×25×1 — two filters."],
    "Gutter clearing": ["overdue", null, 220, "Book before fall storms; check downspout splash blocks."],
    "Irrigation zone check": ["todo", "Afternoon", 105, "Zone 4 head was misting in June."],
    "Dryer vent cleaning": ["todo", null, 140, "Roof termination — bring 25 ft rods."],
  };
  for (const [name, trade, cadence, contractor, due] of taskSeeds) {
    const contractorId = contractor ? cid[contractor] : null;
    const taskId = (await run(
      `INSERT INTO maintenance_tasks (property_id, name, trade, cadence, assigned_contractor_id, estimated_cost)
       VALUES ($1,$2,$3,$4,$5,150) RETURNING id`,
      [propId, name, trade, cadence, contractorId]
    ))!;
    if (due.startsWith("2026-08") || due.startsWith("2026-09")) {
      const [status, win, cost, notes] = eventDetail[name] ?? ["todo", null, null, null];
      await run(
        `INSERT INTO scheduled_events (task_id, property_id, contractor_id, name, trade, scheduled_for, time_window, status, cost, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [taskId, propId, contractorId, name, trade, due, win, status, cost, notes]
      );
    }
  }
  await run(
    `INSERT INTO scheduled_events (task_id, property_id, contractor_id, name, trade, scheduled_for, time_window, status, cost, notes)
     VALUES (NULL,$1,NULL,'Cedar Creek bid walkthrough','General','2026-08-19','5 PM','awaiting_decision',NULL,
       'Walk the fence line with Halvorsen and the two Thumbtack bidders.') RETURNING id`,
    [propId]
  );

  // ---------------------------------------------------------------- bids
  const reqId = (await run(
    `INSERT INTO bid_requests (property_id, title, scope, posted_at, closes_at, status)
     VALUES ($1,$2,$3,'2026-07-28','2026-08-05','open') RETURNING id`,
    [
      propId,
      "Replace cedar privacy fence — 120 linear ft",
      "Tear out existing 6-ft cedar fence along the north property line, haul away, set new posts in concrete, board-on-board cedar with cap rail. Stain optional — price separately.",
    ]
  ))!;
  const bid = (vals: unknown[]) =>
    run(
      `INSERT INTO bids (bid_request_id, contractor_id, vendor_name, meta, price, start_date, rating, review_count, review_excerpt, badge, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [reqId, ...vals]
    );
  await bid([cid["Halvorsen Builders"], "Halvorsen Builders", "Known contractor · 2 past jobs", 6840, "2026-08-17", 4.5, 41, "“Kept the site spotless and finished a day early.”", "In your book", "received"]);
  await bid([null, "Lone Star Fence Co.", "New · 1.4 mi away", 5980, "2026-08-24", 4.6, 213, "“Best price of five quotes and the crew was fast.”", "Best price", "received"]);
  await bid([null, "Heritage Fence & Deck", "New · 3.2 mi away", 7420, "2026-08-12", 4.9, 388, "“Premium work — the board-on-board detail is flawless.”", "Top rated", "received"]);
  await bid([null, "Alamo Outdoor Builds", "New · 5.0 mi away", 6510, "2026-08-31", 4.3, 97, "“Solid value, communication could be quicker.”", null, "received"]);
  await bid([null, "Cedar & Post Co.", "Invited · quote pending", null, null, null, null, null, "Awaiting bid", "awaiting"]);
  await run(
    `UPDATE bids SET favorable = 1, notes = 'Known crew — did our punch list last spring; showed up on time every day'
     WHERE vendor_name = 'Halvorsen Builders'`
  );

  // ------------------------------------------------------------- activity
  const act = (kind: string, message: string, offset: string) =>
    run(
      `INSERT INTO activity_log (kind, message, created_at)
       VALUES ($1, $2, to_char(now() at time zone 'utc' - $3::interval, 'YYYY-MM-DD HH24:MI:SS')) RETURNING id`,
      [kind, message, offset]
    );
  await act("invoice", "Invoice DP-11482 parsed and matched to Delgado Plumbing", "2 hours");
  await act("photo", "4 photos added to Water heater replacement", "1 day");
  await act("bid", "3 of 5 bids returned for the cedar fence request", "2 days");
  await act("schedule", "Termite inspection confirmed for Aug 5", "3 days");

  console.log("Seeded Homestead database ✔ (Postgres)");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

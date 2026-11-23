export type Role = "owner" | "manager" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  last_active: string | null;
  theme_prefs: string;
  phone: string | null;
  /** 1 once the number has been authenticated with an SMS code. */
  phone_verified: number;
  /** invited = link sent, no password yet · disabled = sign-in blocked. */
  status: UserStatus;
}

export type UserStatus = "active" | "invited" | "disabled";

export interface PropertyPhoto {
  id: number;
  property_id: number;
  stored_path: string;
  original_name: string | null;
  caption: string | null;
  sort_order: number | null;
  created_at: string;
}

export interface ContractorDocument {
  id: number;
  contractor_id: number;
  filename: string;
  size: number;
  kind: "insurance" | "license" | "warranty" | "other";
  stored_path: string | null;
}

export interface Contractor {
  id: number;
  business_name: string;
  trade: string;
  primary_contact: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  hourly_rate: number | null;
  insurance_expires: string | null;
  service_area_notes: string | null;
  status: "active" | "on_hold" | "archived";
  tags: string; // JSON array
  rating: number | null;
  notes: string | null;
  preferred: number;
  created_at: string;
  updated_at: string;
  updated_by: number | null;
}

export interface ContractorWithStats extends Contractor {
  job_count: number;
  lifetime_spend: number;
  last_job: string | null;
}

export interface Job {
  id: number;
  property_id: number | null;
  contractor_id: number | null;
  title: string;
  trade: string | null;
  performed_on: string | null;
  location: string | null;
  status: string;
  amount: number;
  planned: number;
  notes: string | null;
}

export interface Invoice {
  id: number;
  job_id: number | null;
  contractor_id: number | null;
  property_id: number | null;
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  total: number;
  category: string | null;
  warranty_months: number | null;
  payment_status: "paid" | "unpaid" | "overdue";
  source_file: string | null;
  source_filename: string | null;
  parse_confidence: number | null;
  parsed_at: string | null;
  confirmed_by: number | null;
  status: "draft" | "filed";
  created_at: string;
}

export interface InvoiceLineItem {
  id: number;
  invoice_id: number;
  description: string;
  type: "labor" | "parts" | "fees";
  amount: number;
}

export interface JobPhoto {
  id: number;
  job_id: number;
  stored_path: string;
  original_name: string | null;
  caption: string | null;
  stage: "before" | "during" | "after" | "record";
  taken_at: string | null;
  created_at: string;
}

export interface MaintenanceTask {
  id: number;
  property_id: number | null;
  name: string;
  trade: string | null;
  cadence: "quarterly" | "semiannual" | "annual" | "one_off";
  assigned_contractor_id: number | null;
  estimated_cost: number | null;
  notes: string | null;
}

export type EventStatus =
  | "confirmed"
  | "todo"
  | "overdue"
  | "awaiting_decision"
  | "needs_pro"
  | "done";

export interface ScheduledEvent {
  id: number;
  task_id: number | null;
  property_id: number | null;
  contractor_id: number | null;
  name: string;
  trade: string | null;
  scheduled_for: string;
  time_window: string | null;
  status: EventStatus;
  cost: number | null;
  notes: string | null;
}

export interface BidRequest {
  id: number;
  property_id: number | null;
  title: string;
  scope: string | null;
  posted_at: string;
  closes_at: string | null;
  /** Ticket pipeline: open (bidding) → accepted → scheduled → closed. */
  status: "open" | "closed" | "accepted" | "scheduled";
  /** Trade category, e.g. "Plumbing", "Outdoor & landscaping". */
  category: string | null;
  priority: "low" | "normal" | "high" | null;
  /** Target budget for the job, if set. */
  budget: number | null;
}

export interface Bid {
  id: number;
  bid_request_id: number;
  contractor_id: number | null;
  vendor_name: string;
  meta: string | null;
  price: number | null;
  start_date: string | null;
  rating: number | null;
  review_count: number | null;
  review_excerpt: string | null;
  badge: string | null;
  status: "received" | "awaiting" | "accepted" | "declined";
  /** Why this pro was called or searched. */
  notes: string | null;
  /** 1 favorable, 0 not favorable, null undecided. */
  favorable: number | null;
}

export interface PropertyProfile {
  id: number;
  label: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  year_built: number | null;
  sqft: number | null;
  lot_size: string | null;
  beds: number | null;
  baths: number | null;
  roof_type: string | null;
  hvac_type: string | null;
  water_heater: string | null;
  notes: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  estimated_value: number | null;
  property_tax_annual: number | null;
  parcel_number: string | null;
  insurance_carrier: string | null;
  insurance_policy: string | null;
  insurance_renewal: string | null;
  insurance_premium: number | null;
  hoa_name: string | null;
  hoa_contact: string | null;
  hoa_dues_monthly: number | null;
  water_shutoff: string | null;
  gas_shutoff: string | null;
  electrical_panel: string | null;
}

/** A system, appliance or fixture tracked for a property. */
export interface PropertyAsset {
  id: number;
  property_id: number;
  name: string;
  category: string;
  room: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  installed_on: string | null;
  warranty_expires: string | null;
  expected_life_years: number | null;
  purchase_price: number | null;
  notes: string | null;
}

export interface PropertyPaint {
  id: number;
  property_id: number;
  room: string;
  surface: string | null;
  brand: string | null;
  color_name: string | null;
  color_code: string | null;
  finish: string | null;
  painted_on: string | null;
  notes: string | null;
}

export interface PropertyDocument {
  id: number;
  property_id: number;
  filename: string;
  title: string | null;
  size: number;
  kind: string;
  stored_path: string;
  expires_on: string | null;
  created_at: string;
}

export const PROPERTY_TYPES = [
  "Single family",
  "Townhome",
  "Condo",
  "Duplex",
  "Rental",
  "Other",
] as const;

export const TRADES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "Painting",
  "Pest control",
  "Outdoor & landscaping",
  "General contracting",
  "Backflow & irrigation",
  "Other",
] as const;

/** Trades whose contractors must carry a license number. */
export const LICENSED_TRADES = ["Plumbing", "Electrical", "HVAC", "Pest control"];

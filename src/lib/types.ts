export type Role = "owner" | "manager" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  last_active: string | null;
  theme_prefs: string;
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
  status: "open" | "closed" | "accepted";
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

import type { Role } from "./types";

/**
 * The permissions matrix from the design spec (Users & permissions screen).
 * Enforced server-side by requirePermission() in auth.ts; the UI additionally
 * hides affordances the current role lacks.
 */
export type Capability =
  | "view_records"
  | "edit_contractors"
  | "upload_invoices"
  | "upload_photos"
  | "run_reports"
  | "manage_bids"
  | "manage_users"
  | "manage_properties"
  | "manage_schedule"
  | "send_notifications";

export const PERMISSIONS: Record<Capability, Role[]> = {
  view_records: ["owner", "manager", "viewer"],
  edit_contractors: ["owner", "manager"],
  upload_invoices: ["owner", "manager"],
  upload_photos: ["owner", "manager"],
  run_reports: ["owner", "manager", "viewer"],
  manage_bids: ["owner", "manager"],
  manage_users: ["owner"],
  manage_properties: ["owner"],
  manage_schedule: ["owner", "manager"],
  send_notifications: ["owner", "manager"],
};

export function can(role: Role, capability: Capability): boolean {
  return PERMISSIONS[capability].includes(role);
}

/** Rows for the permissions matrix UI, in display order. */
export const MATRIX_ROWS: { label: string; capability: Capability }[] = [
  { label: "View contractors, invoices & photos", capability: "view_records" },
  { label: "Add or edit contractors", capability: "edit_contractors" },
  { label: "Upload & parse invoices", capability: "upload_invoices" },
  { label: "Upload job photos", capability: "upload_photos" },
  { label: "Run and export reports", capability: "run_reports" },
  { label: "Request and accept bids", capability: "manage_bids" },
  { label: "Invite people & set roles", capability: "manage_users" },
  { label: "Add or remove properties", capability: "manage_properties" },
  { label: "Send phone notifications", capability: "send_notifications" },
];

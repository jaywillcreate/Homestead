import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const dollars = z.coerce.number().min(0).max(1_000_000_000).nullable().optional();
const date = isoDate.nullable().optional();

/** Shared validation for property profiles. */
export const propertySchema = z.object({
  label: z.string().trim().min(1).max(120),
  address: text(200),
  city: text(120),
  state: text(40),
  zip: z.string().trim().regex(/^$|^\d{5}$/, "ZIP must be 5 digits").nullable().optional(),
  property_type: text(40),
  year_built: z.coerce.number().int().min(1700).max(2100).nullable().optional(),
  sqft: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  lot_size: text(60),
  beds: z.coerce.number().int().min(0).max(50).nullable().optional(),
  baths: z.coerce.number().min(0).max(50).nullable().optional(),
  roof_type: text(120),
  hvac_type: text(120),
  water_heater: text(120),
  notes: text(4000),
  // Ownership & value
  purchase_date: date,
  purchase_price: dollars,
  estimated_value: dollars,
  property_tax_annual: dollars,
  parcel_number: text(80),
  // Insurance
  insurance_carrier: text(120),
  insurance_policy: text(80),
  insurance_renewal: date,
  insurance_premium: dollars,
  // HOA
  hoa_name: text(120),
  hoa_contact: text(200),
  hoa_dues_monthly: dollars,
  // Emergency shutoffs
  water_shutoff: text(300),
  gas_shutoff: text(300),
  electrical_panel: text(300),
});

export const PROPERTY_FIELDS = [
  "label", "address", "city", "state", "zip", "property_type", "year_built", "sqft",
  "lot_size", "beds", "baths", "roof_type", "hvac_type", "water_heater", "notes",
  "purchase_date", "purchase_price", "estimated_value", "property_tax_annual", "parcel_number",
  "insurance_carrier", "insurance_policy", "insurance_renewal", "insurance_premium",
  "hoa_name", "hoa_contact", "hoa_dues_monthly",
  "water_shutoff", "gas_shutoff", "electrical_panel",
] as const;

// ------------------------------------------------ inventory & paint records

export const ASSET_CATEGORIES = [
  "Appliance", "HVAC", "Plumbing", "Electrical", "Roof & exterior", "Outdoor", "Safety", "Other",
] as const;

export const assetSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.enum(ASSET_CATEGORIES),
  room: text(120),
  brand: text(120),
  model: text(120),
  serial_number: text(120),
  installed_on: date,
  warranty_expires: date,
  expected_life_years: z.coerce.number().int().min(0).max(100).nullable().optional(),
  purchase_price: dollars,
  notes: text(2000),
});
export const ASSET_FIELDS = [
  "name", "category", "room", "brand", "model", "serial_number", "installed_on",
  "warranty_expires", "expected_life_years", "purchase_price", "notes",
] as const;

export const PAINT_SURFACES = ["Walls", "Ceiling", "Trim", "Doors", "Cabinets", "Exterior", "Other"] as const;

export const paintSchema = z.object({
  room: z.string().trim().min(1).max(120),
  surface: text(60),
  brand: text(120),
  color_name: text(120),
  color_code: text(60),
  finish: text(60),
  painted_on: date,
  notes: text(2000),
});
export const PAINT_FIELDS = [
  "room", "surface", "brand", "color_name", "color_code", "finish", "painted_on", "notes",
] as const;

/** The two list-style record types a property holds, keyed by URL segment. */
export const ITEM_KINDS = {
  assets: { table: "property_assets", schema: assetSchema, fields: ASSET_FIELDS, noun: "Inventory item", labelKey: "name" },
  paints: { table: "property_paints", schema: paintSchema, fields: PAINT_FIELDS, noun: "Paint record", labelKey: "room" },
} as const;
export type ItemKind = keyof typeof ITEM_KINDS;

// ------------------------------------------------------------ document vault

export const DOCUMENT_KINDS = [
  "deed", "mortgage", "insurance", "tax", "hoa", "permit", "inspection", "warranty", "manual",
  "floor_plan", "other",
] as const;
export const DOCUMENT_KIND_LABEL: Record<(typeof DOCUMENT_KINDS)[number], string> = {
  deed: "Deed & title", mortgage: "Mortgage", insurance: "Insurance", tax: "Property tax",
  hoa: "HOA", permit: "Permit", inspection: "Inspection", warranty: "Warranty", manual: "Manual",
  floor_plan: "Floor plan", other: "Other",
};

export const documentMetaSchema = z.object({
  title: text(160),
  kind: z.enum(DOCUMENT_KINDS).optional(),
  expires_on: date,
});

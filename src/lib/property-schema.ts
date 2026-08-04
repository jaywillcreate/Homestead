import { z } from "zod";

/** Shared validation for property profiles. */
export const propertySchema = z.object({
  label: z.string().trim().min(1).max(120),
  address: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(40).nullable().optional(),
  zip: z.string().trim().regex(/^$|^\d{5}$/, "ZIP must be 5 digits").nullable().optional(),
  property_type: z.string().max(40).nullable().optional(),
  year_built: z.coerce.number().int().min(1700).max(2100).nullable().optional(),
  sqft: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  lot_size: z.string().max(60).nullable().optional(),
  beds: z.coerce.number().int().min(0).max(50).nullable().optional(),
  baths: z.coerce.number().min(0).max(50).nullable().optional(),
  roof_type: z.string().max(120).nullable().optional(),
  hvac_type: z.string().max(120).nullable().optional(),
  water_heater: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const PROPERTY_FIELDS = [
  "label", "address", "city", "state", "zip", "property_type", "year_built", "sqft",
  "lot_size", "beds", "baths", "roof_type", "hvac_type", "water_heater", "notes",
] as const;

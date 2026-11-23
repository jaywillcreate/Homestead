"use client";

import { PROPERTY_TYPES, type PropertyProfile } from "@/lib/types";
import { FormDialog, sendJson, type FormSection } from "./FormDialog";

const SECTIONS: FormSection[] = [
  {
    fields: [
      { key: "label", label: "Label", required: true, full: true, placeholder: "e.g. Primary residence, Lake house, Rental #2" },
      { key: "address", label: "Street address", full: true },
      { key: "city", label: "City" },
      { key: "state", label: "State", maxLength: 20, placeholder: "TX" },
      { key: "zip", label: "ZIP", type: "digits", maxLength: 5 },
    ],
  },
  {
    title: "The home",
    fields: [
      { key: "property_type", label: "Type", type: "select", options: PROPERTY_TYPES },
      { key: "year_built", label: "Year built", type: "number", placeholder: "1998" },
      { key: "sqft", label: "Square feet", type: "number" },
      { key: "lot_size", label: "Lot size", placeholder: "0.28 acre" },
      { key: "beds", label: "Bedrooms", type: "number" },
      { key: "baths", label: "Bathrooms", type: "number", step: "0.5" },
      { key: "roof_type", label: "Roof", placeholder: "Architectural shingle, 2019" },
      { key: "hvac_type", label: "HVAC", placeholder: "Gas furnace + AC, 2021" },
      { key: "water_heater", label: "Water heater", placeholder: "50-gal gas, 2026" },
    ],
  },
  {
    title: "Ownership & value",
    hint: "Used for the value and yearly-cost summary on the property's profile.",
    fields: [
      { key: "purchase_date", label: "Purchase date", type: "date" },
      { key: "purchase_price", label: "Purchase price", type: "money", step: "1" },
      { key: "estimated_value", label: "Estimated value today", type: "money", step: "1" },
      { key: "property_tax_annual", label: "Property tax per year", type: "money", step: "1" },
      { key: "parcel_number", label: "Parcel / account number" },
    ],
  },
  {
    title: "Insurance",
    fields: [
      { key: "insurance_carrier", label: "Carrier" },
      { key: "insurance_policy", label: "Policy number" },
      { key: "insurance_renewal", label: "Renewal date", type: "date" },
      { key: "insurance_premium", label: "Premium per year", type: "money", step: "1" },
    ],
  },
  {
    title: "HOA",
    fields: [
      { key: "hoa_name", label: "Association" },
      { key: "hoa_contact", label: "Contact — phone, email or portal" },
      { key: "hoa_dues_monthly", label: "Dues per month", type: "money", step: "1" },
    ],
  },
  {
    title: "Emergency shutoffs",
    hint: "Where to go when something is leaking, sparking or smells of gas.",
    fields: [
      { key: "water_shutoff", label: "Main water shutoff", full: true, placeholder: "Garage, left of the water heater" },
      { key: "gas_shutoff", label: "Gas shutoff", full: true, placeholder: "At the meter, east side — wrench hangs on the fence" },
      { key: "electrical_panel", label: "Electrical panel", full: true, placeholder: "Garage north wall; sub-panel in the laundry" },
    ],
  },
  {
    fields: [
      { key: "notes", label: "Notes — access, gate codes, quirks", type: "textarea", full: true, maxLength: 4000 },
    ],
  },
];

/** Add or edit a property profile. Owner only (the API enforces it). */
export function PropertyDialog({
  existing, canDelete, onClose, onDone,
}: {
  existing: PropertyProfile | null;
  canDelete: boolean;
  onClose: () => void;
  onDone: (msg: string, deleted?: boolean) => void;
}) {
  return (
    <FormDialog
      wide
      title={existing ? "Edit property" : "Add property"}
      sections={SECTIONS}
      initial={existing as unknown as Record<string, string | number | null> | null}
      submitLabel={existing ? "Save property" : "Add property"}
      onClose={onClose}
      onSubmit={async (payload) => {
        const problem = await sendJson(
          existing ? `/api/properties/${existing.id}` : "/api/properties",
          existing ? "PATCH" : "POST",
          payload
        );
        if (!problem) onDone(existing ? "Property updated." : `Property added: ${payload.label}`);
        return problem;
      }}
      deleteLabel="Remove property"
      onDelete={existing && canDelete ? async () => {
        const problem = await sendJson(`/api/properties/${existing.id}`, "DELETE");
        if (!problem) onDone("Property removed.", true);
        return problem;
      } : undefined}
    />
  );
}

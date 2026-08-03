import { z } from "zod";
import { LICENSED_TRADES, TRADES } from "./types";

/** Shared validation for the contractor CMS form — used client- and server-side. */
export const contractorSchema = z
  .object({
    business_name: z.string().trim().min(1, "Business name is required").max(120),
    trade: z.enum(TRADES, { message: "Pick a trade" }),
    primary_contact: z.string().trim().max(120).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .regex(/^$|^[\d\s().+-]{7,20}$/, "Enter a valid phone number")
      .optional()
      .or(z.literal("")),
    email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
    license_number: z.string().trim().max(60).optional().or(z.literal("")),
    hourly_rate: z.coerce.number().min(0).max(10000).optional().nullable(),
    insurance_expires: z.string().optional().or(z.literal("")),
    service_area_notes: z.string().max(2000).optional().or(z.literal("")),
    status: z.enum(["active", "on_hold", "archived"]).default("active"),
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  })
  .superRefine((val, ctx) => {
    if (LICENSED_TRADES.includes(val.trade) && !val.license_number) {
      ctx.addIssue({
        code: "custom",
        path: ["license_number"],
        message: `License number is required for ${val.trade.toLowerCase()} work`,
      });
    }
    if (val.insurance_expires) {
      const d = new Date(val.insurance_expires + "T00:00:00");
      if (Number.isNaN(d.getTime())) {
        ctx.addIssue({ code: "custom", path: ["insurance_expires"], message: "Enter a valid date" });
      } else if (d < new Date()) {
        ctx.addIssue({
          code: "custom",
          path: ["insurance_expires"],
          message: "Insurance expiry must be a future date",
        });
      }
    }
  });

export type ContractorInput = z.infer<typeof contractorSchema>;

/** Warn (not block) when insurance lapses within 30 days. */
export function insuranceWarning(insurance_expires?: string | null): string | null {
  if (!insurance_expires) return null;
  const d = new Date(insurance_expires + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((d.getTime() - Date.now()) / 86400000);
  if (days >= 0 && days <= 30) return `Insurance lapses in ${days} day${days === 1 ? "" : "s"}`;
  return null;
}

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { getDb } from "./db";
import type { Contractor } from "./types";

/**
 * Invoice parsing pipeline.
 * Sends the uploaded scan (PDF or image) to Claude with a structured-output
 * schema, then fuzzy-matches the vendor to a contractor in the book.
 * Parsing always returns a DRAFT — the user confirms every field in the UI.
 * If no API credentials are available the caller falls back to manual entry.
 */

const lineItemSchema = z.object({
  description: z.string(),
  type: z.enum(["labor", "parts", "fees"]),
  amount: z.number(),
});

const extractionSchema = z.object({
  vendor: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe("ISO date YYYY-MM-DD"),
  due_date: z.string().nullable().describe("ISO date YYYY-MM-DD"),
  total: z.number().nullable(),
  category: z
    .string()
    .nullable()
    .describe("Trade category: Plumbing, Electrical, HVAC, Painting, Pest control, Outdoor, General"),
  warranty_months: z.number().nullable(),
  line_items: z.array(lineItemSchema),
  confidence: z.number().describe("0-1 confidence in the extraction overall"),
});

export type InvoiceExtraction = z.infer<typeof extractionSchema>;

export interface ParseResult {
  extraction: InvoiceExtraction | null;
  matched_contractor_id: number | null;
  error: string | null;
}

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function parsingAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function parseInvoiceFile(
  buffer: Buffer,
  mimeType: string
): Promise<ParseResult> {
  if (!parsingAvailable()) {
    return {
      extraction: null,
      matched_contractor_id: null,
      error: "Automatic parsing is not configured (set ANTHROPIC_API_KEY). Enter the fields manually.",
    };
  }
  try {
    const client = new Anthropic();
    const data = buffer.toString("base64");
    const fileBlock =
      mimeType === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
        : ({
            type: "image",
            source: {
              type: "base64",
              media_type: (SUPPORTED_IMAGE_TYPES.has(mimeType) ? mimeType : "image/jpeg") as
                | "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data,
            },
          } as const);

    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            fileBlock,
            {
              type: "text",
              text: "Extract the fields from this home-maintenance invoice. Classify each line item as labor, parts, or fees. Use null for anything not present. Dates as YYYY-MM-DD.",
            },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(extractionSchema) },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return {
        extraction: null,
        matched_contractor_id: null,
        error: "The parser could not read this file. Enter the fields manually.",
      };
    }
    const extraction = response.parsed_output;
    return {
      extraction,
      matched_contractor_id: extraction.vendor ? matchContractor(extraction.vendor) : null,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown parsing error";
    return {
      extraction: null,
      matched_contractor_id: null,
      error: `Parsing failed (${message}). The scan is kept — enter the fields manually.`,
    };
  }
}

/** Fuzzy-match a parsed vendor string to a contractor in the book. */
export function matchContractor(vendor: string): number | null {
  const db = getDb();
  const contractors = db
    .prepare("SELECT id, business_name FROM contractors WHERE status != 'archived'")
    .all() as Pick<Contractor, "id" | "business_name">[];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const v = norm(vendor);
  if (!v) return null;

  let best: { id: number; score: number } | null = null;
  for (const c of contractors) {
    const name = norm(c.business_name);
    let score = 0;
    if (name === v) score = 1;
    else if (name.includes(v) || v.includes(name)) score = 0.85;
    else {
      const vTokens = new Set(v.split(/\s+/));
      const nTokens = name.split(/\s+/);
      const overlap = nTokens.filter((t) => vTokens.has(t)).length;
      score = overlap / Math.max(nTokens.length, vTokens.size);
    }
    if (!best || score > best.score) best = { id: c.id, score };
  }
  return best && best.score >= 0.5 ? best.id : null;
}

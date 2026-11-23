import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";

/**
 * Project-materials research. With ANTHROPIC_API_KEY set, Claude runs live
 * web searches for current retail material pricing and returns a structured
 * list. Without it, a deterministic sample catalog keeps the flow working,
 * clearly labeled as sample pricing.
 */

export interface MaterialItem {
  name: string;
  /** Spec / size / unit, e.g. "50 lb bag", "per linear ft", "4x4x8 post". */
  spec: string;
  unit_price: number;
  quantity: number;
  note?: string | null;
  /** Set when the price came from a specific retailer listing. */
  vendor?: string | null;
  url?: string | null;
}

export interface ResearchResult {
  items: MaterialItem[];
  source: "web" | "sample";
  summary: string | null;
  error: string | null;
}

const materialSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string(),
        spec: z.string(),
        unit_price: z.number(),
        quantity: z.number().describe("suggested quantity for the described job"),
        note: z.string().nullable().describe("retailer or price context, e.g. 'Home Depot ~$'"),
      })
    )
    .max(15),
  summary: z.string().describe("one-sentence note on pricing basis and assumptions"),
});

export function researchAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** `where` is a human place name ("San Antonio, TX 78230") used to localize prices. */
export async function researchMaterials(query: string, where?: string | null): Promise<ResearchResult> {
  if (!researchAvailable()) {
    return { ...sampleMaterials(query), error: null };
  }
  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4096,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content: `Research current US retail prices for the materials needed for this home-maintenance job: "${query}".
Use web search to ground prices in real current listings (big-box home improvement retailers are ideal).${where ? `\nThe shopper is in ${where} — prefer prices and availability at stores serving that area, and say so in the summary.` : ""}
Return 5-12 line items covering the main materials, each with a realistic unit price, a sensible spec/unit, and a suggested quantity for the job as described. Round prices to cents.`,
        },
      ],
      output_config: { format: zodOutputFormat(materialSchema) },
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { ...sampleMaterials(query), error: "Live research unavailable — showing sample pricing." };
    }
    const out = response.parsed_output;
    return {
      items: out.items.map((i) => ({ ...i, note: i.note ?? null })),
      source: "web",
      summary: out.summary,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "research failed";
    return { ...sampleMaterials(query), error: `Live research failed (${message}) — showing sample pricing.` };
  }
}

function sampleMaterials(query: string): Omit<ResearchResult, "error"> {
  const q = query.toLowerCase();
  const catalogs: [string[], MaterialItem[]][] = [
    [
      ["fence", "picket", "gate"],
      [
        { name: "Cedar fence picket", spec: '5/8" x 5-1/2" x 6 ft', unit_price: 4.98, quantity: 240 },
        { name: "Pressure-treated post", spec: "4x4x8 ft", unit_price: 13.48, quantity: 16 },
        { name: "Cedar 2x4 rail", spec: "8 ft", unit_price: 8.75, quantity: 45 },
        { name: "Concrete mix", spec: "50 lb fast-setting bag", unit_price: 6.7, quantity: 32 },
        { name: "Exterior screws", spec: '5 lb box, 3"', unit_price: 42.98, quantity: 2 },
        { name: "Post caps", spec: "4x4", unit_price: 3.25, quantity: 16 },
      ],
    ],
    [
      ["gutter", "downspout"],
      [
        { name: "Gutter guard", spec: "per 4 ft section", unit_price: 8.98, quantity: 40 },
        { name: "Aluminum gutter", spec: '5" x 10 ft K-style', unit_price: 14.72, quantity: 16 },
        { name: "Downspout", spec: "2x3 in x 10 ft", unit_price: 12.98, quantity: 6 },
        { name: "Hangers & fasteners", spec: "pack of 10", unit_price: 11.47, quantity: 5 },
        { name: "Sealant", spec: "10 oz tube", unit_price: 7.28, quantity: 4 },
      ],
    ],
    [
      ["roof", "shingle"],
      [
        { name: "Architectural shingles", spec: "per bundle (33 sq ft)", unit_price: 42.5, quantity: 60 },
        { name: "Synthetic underlayment", spec: "10 sq roll", unit_price: 119.0, quantity: 3 },
        { name: "Drip edge", spec: "10 ft section", unit_price: 9.87, quantity: 14 },
        { name: "Roofing nails", spec: "30 lb box", unit_price: 64.98, quantity: 2 },
        { name: "Ridge cap shingles", spec: "per bundle", unit_price: 58.97, quantity: 4 },
      ],
    ],
    [
      ["paint", "primer", "trim"],
      [
        { name: "Interior paint", spec: "1 gal, eggshell", unit_price: 43.98, quantity: 6 },
        { name: "Primer", spec: "1 gal", unit_price: 26.98, quantity: 2 },
        { name: "Painter's tape", spec: '1.88" x 60 yd', unit_price: 8.97, quantity: 4 },
        { name: "Roller & tray kit", spec: "9 in, 11-piece", unit_price: 24.97, quantity: 2 },
        { name: "Caulk", spec: "10 oz paintable", unit_price: 4.48, quantity: 6 },
      ],
    ],
    [
      ["water heater", "plumbing"],
      [
        { name: "Gas water heater", spec: "50 gal, 12-yr", unit_price: 799.0, quantity: 1 },
        { name: "Expansion tank", spec: "2 gal", unit_price: 47.53, quantity: 1 },
        { name: "Flex water connectors", spec: '3/4" x 18", pair', unit_price: 21.98, quantity: 1 },
        { name: "Gas connector kit", spec: '3/4" x 24"', unit_price: 24.36, quantity: 1 },
        { name: "Drain pan", spec: '24" aluminum', unit_price: 27.98, quantity: 1 },
      ],
    ],
  ];
  const generic: MaterialItem[] = [
    { name: "Dimensional lumber", spec: "2x4x8 stud", unit_price: 3.98, quantity: 24 },
    { name: "Plywood sheathing", spec: '15/32" 4x8 sheet', unit_price: 36.5, quantity: 6 },
    { name: "Construction screws", spec: "5 lb box", unit_price: 39.97, quantity: 1 },
    { name: "Construction adhesive", spec: "28 oz tube", unit_price: 7.98, quantity: 4 },
    { name: "Contractor bags", spec: "42 gal, 32-pack", unit_price: 21.98, quantity: 1 },
  ];
  const matched = catalogs.find(([keys]) => keys.some((k) => q.includes(k)));
  return {
    items: (matched?.[1] ?? generic).map((i) => ({ ...i, note: "Sample price" })),
    source: "sample",
    summary: "Sample catalog pricing — set ANTHROPIC_API_KEY for live web-researched prices.",
  };
}

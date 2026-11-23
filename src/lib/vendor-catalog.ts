/**
 * Live retailer catalog: The Home Depot's product search, priced for a ZIP code
 * (and, when a store number is given, with that store's pickup stock), through
 * SerpApi's Home Depot engine. Enabled by SERPAPI_API_KEY; without it the
 * Materials screen still offers store lookup and retailer search links.
 * Docs: https://serpapi.com/home-depot-search-api
 */

export interface VendorProduct {
  vendor: "Home Depot";
  product_id: string;
  title: string;
  brand: string | null;
  model: string | null;
  price: number | null;
  price_was: number | null;
  unit: string | null;
  rating: number | null;
  reviews: number | null;
  url: string | null;
  thumbnail: string | null;
  /** Pickup stock at the chosen / nearest store, when the retailer reports it. */
  pickup: { store: string | null; quantity: number | null; distance_mi: number | null } | null;
  free_delivery: boolean | null;
}

export interface CatalogResult {
  available: boolean;
  products: VendorProduct[];
  error: string | null;
}

export function catalogAvailable(): boolean {
  return Boolean(process.env.SERPAPI_API_KEY);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function searchProducts(query: string, zip: string, storeId?: string): Promise<CatalogResult> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return { available: false, products: [], error: null };
  const params = new URLSearchParams({ engine: "home_depot", q: query, delivery_zip: zip, ps: "12", api_key: key });
  if (storeId) params.set("store_id", storeId);
  try {
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(25_000) });
    const data = (await res.json().catch(() => null)) as { products?: Record<string, unknown>[]; error?: string } | null;
    if (!res.ok || !data) {
      return { available: true, products: [], error: data?.error ?? `Catalog search failed (${res.status}).` };
    }
    // SerpApi reports "no results" as an error string on an otherwise fine response.
    if (!data.products?.length) return { available: true, products: [], error: null };
    const products = data.products.map((p): VendorProduct => {
      const pickup = (p.pickup ?? null) as Record<string, unknown> | null;
      const delivery = (p.delivery ?? null) as Record<string, unknown> | null;
      const thumbs = Array.isArray(p.thumbnails) ? (p.thumbnails as unknown[]).flat() : [];
      return {
        vendor: "Home Depot",
        product_id: String(p.product_id ?? ""),
        title: str(p.title) ?? "Untitled product",
        brand: str(p.brand),
        model: str(p.model_number),
        price: num(p.price),
        price_was: num(p.price_was),
        unit: str(p.unit),
        rating: num(p.rating),
        reviews: num(p.reviews),
        url: str(p.link),
        thumbnail: str(thumbs[0]),
        pickup: pickup && (pickup.quantity != null || pickup.store_name != null)
          ? { store: str(pickup.store_name), quantity: num(pickup.quantity), distance_mi: num(pickup.distance) }
          : null,
        free_delivery: typeof delivery?.free === "boolean" ? delivery.free : null,
      };
    });
    return { available: true, products, error: null };
  } catch (err) {
    return {
      available: true, products: [],
      error: `Catalog search failed (${err instanceof Error ? err.message : "network error"}).`,
    };
  }
}

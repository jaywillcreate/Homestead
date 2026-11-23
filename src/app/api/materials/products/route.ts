import { requirePermission, permissionResponse } from "@/lib/auth";
import { searchProducts } from "@/lib/vendor-catalog";

/** GET ?q=cedar+picket&zip=78230[&store_id=6543] → live retailer products priced for that ZIP. */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const params = new URL(req.url).searchParams;
    const q = (params.get("q") ?? "").trim().slice(0, 160);
    const zip = (params.get("zip") ?? "").trim();
    const storeId = (params.get("store_id") ?? "").trim();
    if (q.length < 2) return Response.json({ error: "Enter what to search for" }, { status: 400 });
    if (!/^\d{5}$/.test(zip)) return Response.json({ error: "Enter a 5-digit ZIP code" }, { status: 400 });
    if (storeId && !/^\d{3,5}$/.test(storeId)) return Response.json({ error: "Invalid store" }, { status: 400 });
    return Response.json(await searchProducts(q, zip, storeId || undefined));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Catalog search failed" }, { status: 500 });
  }
}

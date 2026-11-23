import { requirePermission, permissionResponse } from "@/lib/auth";
import { nearbyStores } from "@/lib/stores";

/** GET ?zip=78230 → building-supply stores near that ZIP, closest first. */
export async function GET(req: Request) {
  try {
    await requirePermission("view_records");
    const zip = (new URL(req.url).searchParams.get("zip") ?? "").trim();
    if (!/^\d{5}$/.test(zip)) return Response.json({ error: "Enter a 5-digit ZIP code" }, { status: 400 });
    return Response.json(await nearbyStores(zip));
  } catch (err) {
    return permissionResponse(err) ?? Response.json({ error: "Store lookup failed" }, { status: 500 });
  }
}

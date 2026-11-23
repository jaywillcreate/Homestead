import { bidHistory, listMaterialEstimates } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { researchAvailable } from "@/lib/materials";
import { catalogAvailable } from "@/lib/vendor-catalog";
import { qOne } from "@/lib/db";
import { MaterialsView } from "@/components/MaterialsView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MaterialsPage() {
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  const [requests, estimates, home] = await Promise.all([
    bidHistory(),
    listMaterialEstimates(),
    qOne<{ zip: string }>("SELECT zip FROM properties WHERE zip ~ '^[0-9]{5}$' ORDER BY id LIMIT 1"),
  ]);
  return (
    <MaterialsView
      requests={requests.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        bids: r.bids.map((b) => ({ id: b.id, vendor_name: b.vendor_name, price: b.price, status: b.status })),
      }))}
      estimates={estimates}
      liveResearch={researchAvailable()}
      liveCatalog={catalogAvailable()}
      defaultZip={home?.zip ?? ""}
      canSave={role ? can(role, "manage_bids") : false}
    />
  );
}

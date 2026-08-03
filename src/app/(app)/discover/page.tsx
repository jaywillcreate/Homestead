import { bidHistory, listContractors } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DiscoverView } from "@/components/DiscoverView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  const [requests, contractors] = await Promise.all([bidHistory(), listContractors()]);
  return (
    <DiscoverView
      requests={requests}
      contractors={contractors.map((c) => ({ id: c.id, name: c.business_name, trade: c.trade }))}
      canBid={role ? can(role, "manage_bids") : false}
      canSchedule={role ? can(role, "manage_schedule") : false}
    />
  );
}

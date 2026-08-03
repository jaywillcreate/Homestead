import { bidHistory } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DiscoverView } from "@/components/DiscoverView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  const history = await bidHistory();
  return (
    <DiscoverView
      request={history[0] ?? null}
      history={history.slice(1)}
      canBid={role ? can(role, "manage_bids") : false}
      canSchedule={role ? can(role, "manage_schedule") : false}
    />
  );
}

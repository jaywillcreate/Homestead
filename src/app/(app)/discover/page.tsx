import { openBidRequest } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { DiscoverView } from "@/components/DiscoverView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  const canBid = user ? can(user.role as Role, "manage_bids") : false;
  return <DiscoverView request={await openBidRequest()} canBid={canBid} />;
}

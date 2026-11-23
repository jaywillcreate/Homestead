import { notFound } from "next/navigation";
import { getPropertyDetail } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PropertyDetail } from "@/components/PropertyDetail";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  const detail = /^\d+$/.test(id) ? await getPropertyDetail(Number(id)) : null;
  if (!detail) notFound();
  // The household's local date, not UTC, so "due today" doesn't flip at 7 pm.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.HOMESTEAD_TZ ?? "America/New_York",
  }).format(new Date());
  return (
    <PropertyDetail
      {...detail}
      today={today}
      canManage={role ? can(role, "manage_properties") : false}
      canEdit={role ? can(role, "edit_property_records") : false}
    />
  );
}

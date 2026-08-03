import { eventsForMonth, recurringPlan, listContractors } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ScheduleView } from "@/components/ScheduleView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; event?: string }>;
}) {
  const { month, event } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const ym = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.slice(0, 7);
  const user = await getCurrentUser();
  const canManage = user ? can(user.role as Role, "manage_schedule") : false;

  return (
    <ScheduleView
      ym={ym}
      today={today}
      events={JSON.parse(JSON.stringify(eventsForMonth(ym)))}
      plan={JSON.parse(JSON.stringify(recurringPlan()))}
      contractors={JSON.parse(
        JSON.stringify(listContractors().map((c) => ({ id: c.id, name: c.business_name })))
      )}
      canManage={canManage}
      initialEventId={event ? Number(event) : null}
    />
  );
}

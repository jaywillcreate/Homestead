import { listPropertyProfiles } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PropertiesView } from "@/components/PropertiesView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  return (
    <PropertiesView
      properties={await listPropertyProfiles()}
      canManage={role ? can(role, "manage_properties") : false}
    />
  );
}

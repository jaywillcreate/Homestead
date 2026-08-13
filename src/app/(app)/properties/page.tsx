import { listPropertyProfiles, listPropertyPhotos } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PropertiesView } from "@/components/PropertiesView";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const user = await getCurrentUser();
  const role = user?.role as Role | undefined;
  const [properties, photos] = await Promise.all([listPropertyProfiles(), listPropertyPhotos()]);
  return (
    <PropertiesView
      properties={properties.map((p) => ({
        ...p,
        photos: photos.filter((ph) => ph.property_id === p.id),
      }))}
      canManage={role ? can(role, "manage_properties") : false}
      canUpload={role ? can(role, "upload_photos") : false}
    />
  );
}

import { listJobsWithPhotos, listContractors } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PhotoGallery } from "@/components/PhotoGallery";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await getCurrentUser();
  const canUpload = user ? can(user.role as Role, "upload_photos") : false;
  const [jobs, contractors] = await Promise.all([listJobsWithPhotos(), listContractors()]);
  return (
    <PhotoGallery
      jobs={jobs}
      contractors={contractors.map((c) => ({ id: c.id, name: c.business_name }))}
      canUpload={canUpload}
    />
  );
}

import { listJobsWithPhotos, listJobs } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { PhotoGallery } from "@/components/PhotoGallery";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await getCurrentUser();
  const canUpload = user ? can(user.role as Role, "upload_photos") : false;
  return (
    <PhotoGallery
      jobs={JSON.parse(JSON.stringify(listJobsWithPhotos()))}
      allJobs={JSON.parse(JSON.stringify(listJobs()))}
      canUpload={canUpload}
    />
  );
}

import { listUsers } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { UsersView } from "@/components/UsersView";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const current = await getCurrentUser();
  return (
    <UsersView
      users={JSON.parse(JSON.stringify(listUsers()))}
      currentUserId={current?.id ?? 0}
    />
  );
}

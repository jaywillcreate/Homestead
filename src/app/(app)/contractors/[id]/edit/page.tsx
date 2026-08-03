import { notFound, redirect } from "next/navigation";
import { getContractor } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ContractorForm } from "@/components/ContractorForm";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EditContractorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role as Role, "edit_contractors")) redirect(`/contractors/${id}`);
  const contractor = getContractor(Number(id));
  if (!contractor) notFound();
  return <ContractorForm existing={JSON.parse(JSON.stringify(contractor))} />;
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ContractorForm } from "@/components/ContractorForm";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NewContractorPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role as Role, "edit_contractors")) redirect("/contractors");
  return <ContractorForm />;
}

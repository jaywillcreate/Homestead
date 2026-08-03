import { listInvoices, listContractors } from "@/lib/queries";
import { getInvoice } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { InvoiceWorkbench } from "@/components/InvoiceWorkbench";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const user = await getCurrentUser();
  const canUpload = user ? can(user.role as Role, "upload_invoices") : false;
  const invoices = listInvoices(15);
  // Open the most recent unconfirmed draft in the workbench by default.
  const draft = invoices.find((i) => i.status === "draft");
  return (
    <InvoiceWorkbench
      canUpload={canUpload}
      initialDraft={draft ? JSON.parse(JSON.stringify(getInvoice(draft.id))) : null}
      recent={JSON.parse(JSON.stringify(invoices))}
      contractors={JSON.parse(
        JSON.stringify(listContractors().map((c) => ({ id: c.id, name: c.business_name })))
      )}
    />
  );
}

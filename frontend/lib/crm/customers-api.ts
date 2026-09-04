import { crmApiFetch } from "@/lib/crm/browser-api";

export type CustomerBulkDeleteResult = {
  deleted: string[];
  failed: Array<{
    customerId: string;
    message: string;
    code: string;
  }>;
};

export async function deleteCustomers(customerIds: string[]) {
  if (customerIds.length === 1) {
    await crmApiFetch<{ deleted: true; customerId: string }>(
      `/api/customers/${encodeURIComponent(customerIds[0]!)}`,
      { method: "DELETE" },
    );
    return {
      deleted: customerIds,
      failed: [],
    } satisfies CustomerBulkDeleteResult;
  }

  return crmApiFetch<CustomerBulkDeleteResult>("/api/customers/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ customerIds }),
  });
}

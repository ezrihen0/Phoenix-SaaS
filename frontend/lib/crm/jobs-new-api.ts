import { crmApiFetch } from "@/lib/crm/browser-api";

export type CustomerSearchRow = {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
};

export type ServiceCatalogRow = {
  id: string;
  name: string;
  service_type: string;
  default_price_cents: number;
  duration_minutes: number;
};

export type CustomerDetailRecord = {
  customer: {
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
    service_address_line_1: string;
    service_address_line_2: string | null;
    service_city: string;
    service_state_or_region: string | null;
    service_postal_code: string;
    preferred_service_type: string | null;
    notes: string | null;
  };
};

export async function searchCustomers(query: string, signal?: AbortSignal) {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [] as CustomerSearchRow[];
  }

  return crmApiFetch<CustomerSearchRow[]>(
    `/api/customers/search?q=${encodeURIComponent(trimmed)}`,
    { signal },
  );
}

export async function fetchCustomerDetail(customerId: string) {
  return crmApiFetch<CustomerDetailRecord>(`/api/customers/${encodeURIComponent(customerId)}`);
}

export async function createCustomer(payload: {
  fullName: string;
  phone: string;
  email: string | null;
  serviceAddressLine1: string;
  serviceAddressLine2: string | null;
  serviceCity: string;
  serviceStateOrRegion: string | null;
  servicePostalCode: string;
}) {
  return crmApiFetch<{ id: string }>("/api/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchServicesCatalog() {
  return crmApiFetch<ServiceCatalogRow[]>("/api/services");
}

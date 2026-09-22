import { redirect } from "next/navigation";

import { requireServerPermission } from "@/lib/auth/server-session";

type SearchParam = string | string[] | undefined;

type NewEstimateRedirectContext = {
  searchParams: Promise<{
    customerId?: SearchParam;
    q?: SearchParam;
  }>;
};

function firstValue(value: SearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewEstimateRedirectPage({ searchParams }: NewEstimateRedirectContext) {
  await requireServerPermission("/estimates/new", "estimates.manage");

  const resolvedSearchParams = await searchParams;
  const customerId = (firstValue(resolvedSearchParams.customerId) ?? "").trim();
  const query = (firstValue(resolvedSearchParams.q) ?? "").trim();
  const params = new URLSearchParams();

  if (customerId) {
    params.set("customerId", customerId);
  }

  if (query) {
    params.set("q", query);
  }

  const queryString = params.toString();
  redirect(queryString ? `/estimates/create?${queryString}` : "/estimates/create");
}

import { notFound } from "next/navigation";

import { PricebookForm } from "@/components/pricebook-form";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type {
  PricebookCategoryListResult,
  PricebookItem,
  PricebookSystemListResult,
} from "@/lib/crm/pricebook-model";

export default async function PricebookItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const session = await requireServerSession(`/pricebook/${itemId}`);
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;

  let item: PricebookItem | null = null;
  let systems: PricebookSystemListResult["systems"] = [];
  let categories: PricebookCategoryListResult["categories"] = [];

  try {
    const [itemResult, systemsResult, categoriesResult] = await Promise.all([
      serverApiFetch<PricebookItem>(`/api/pricebook/items/${itemId}`),
      serverApiFetch<PricebookSystemListResult>("/api/pricebook/systems"),
      serverApiFetch<PricebookCategoryListResult>("/api/pricebook/categories"),
    ]);
    item = itemResult;
    systems = systemsResult.systems ?? [];
    categories = categoriesResult.categories ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";

    if (message.includes("could not be found") || message.includes("not be found")) {
      notFound();
    }

    throw error;
  }

  if (!item) {
    notFound();
  }

  return (
    <PricebookForm
      mode="edit"
      initialItem={item}
      sessionRole={sessionRole}
      systems={systems}
      categories={categories}
    />
  );
}
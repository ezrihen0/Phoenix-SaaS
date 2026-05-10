import { notFound } from "next/navigation";

import { PricebookForm } from "@/components/pricebook-form";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { PricebookItem } from "@/lib/crm/pricebook-model";

export default async function PricebookItemDetailPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  await requireServerSession(`/pricebook/${itemId}`);

  let item: PricebookItem | null = null;

  try {
    item = await serverApiFetch<PricebookItem>(`/api/pricebook/items/${itemId}`);
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

  return <PricebookForm mode="edit" initialItem={item} />;
}
import { PricebookAddItemForm } from "@/components/pricebook-add-item-form";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { requireServerSession } from "@/lib/auth/server-session";
import type { PricebookCategoryListResult, PricebookSystemListResult } from "@/lib/crm/pricebook-model";

export default async function NewPricebookItemPage() {
  const session = await requireServerSession("/pricebook/new");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;

  let systems: PricebookSystemListResult["systems"] = [];
  let categories: PricebookCategoryListResult["categories"] = [];

  try {
    const [systemsResult, categoriesResult] = await Promise.all([
      serverApiFetch<PricebookSystemListResult>("/api/pricebook/systems"),
      serverApiFetch<PricebookCategoryListResult>("/api/pricebook/categories"),
    ]);
    systems = systemsResult.systems ?? [];
    categories = categoriesResult.categories ?? [];
  } catch {
    systems = [];
    categories = [];
  }

  return (
    <PricebookAddItemForm
      sessionRole={sessionRole}
      systems={systems}
      categories={categories}
    />
  );
}

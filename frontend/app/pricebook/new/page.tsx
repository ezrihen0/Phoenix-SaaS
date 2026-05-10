import { requireServerSession } from "@/lib/auth/server-session";
import { PricebookForm } from "@/components/pricebook-form";

export default async function NewPricebookItemPage() {
  await requireServerSession("/pricebook/new");
  return <PricebookForm mode="create" />;
}
import { requireServerSession } from "@/lib/auth/server-session";
import { PricebookForm } from "@/components/pricebook-form";

export default async function NewPricebookItemPage() {
  const session = await requireServerSession("/pricebook/new");
  const sessionRole = session.profile?.role ?? session.active_membership?.role ?? null;

  return <PricebookForm mode="create" sessionRole={sessionRole} />;
}
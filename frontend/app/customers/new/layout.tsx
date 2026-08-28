import { requireServerPermission } from "@/lib/auth/server-session";

export default async function NewCustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireServerPermission("/customers/new", "customers.manage");
  return children;
}

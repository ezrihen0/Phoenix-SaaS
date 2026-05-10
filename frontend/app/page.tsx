import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/server-session";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const role = session.profile?.role ?? null;

  if (role === "technician") {
    redirect("/technician");
  }

  if (role === "csr") {
    redirect("/jobs");
  }

  if (role) {
    redirect("/home");
  }

  redirect("/login?reason=unsupported-account");
}
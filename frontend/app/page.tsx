import { redirect } from "next/navigation";

import { getServerDestination, getServerSession } from "@/lib/auth/server-session";

export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const destination = await getServerDestination();

  if (destination) {
    redirect(destination);
  }

  redirect("/login?reason=unsupported-account");
}
import { logoutSession } from "@/lib/auth/client-auth";

type LogoutRouter = {
  replace: (href: string) => void;
  refresh: () => void;
};

export async function handleLogout(router: LogoutRouter) {
  await logoutSession().catch(() => undefined);
  router.replace("/login");
  router.refresh();
}
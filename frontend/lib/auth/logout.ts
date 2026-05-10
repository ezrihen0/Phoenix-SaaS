type LogoutRouter = {
  replace: (href: string) => void;
  refresh: () => void;
};

export async function handleLogout(router: LogoutRouter) {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  router.replace("/login");
  router.refresh();
}
import { isSafeInternalAppPath } from "@/lib/auth/post-login-redirect";

export function buildCustomerCreateHref(returnPath: string) {
  if (!isSafeInternalAppPath(returnPath)) {
    return "/customers/new";
  }

  return `/customers/new?${new URLSearchParams({ next: returnPath }).toString()}`;
}

export function resolveHrefAfterCustomerCreate(nextPath: string | null | undefined, customerId: string) {
  if (nextPath && isSafeInternalAppPath(nextPath)) {
    const questionIndex = nextPath.indexOf("?");
    const pathname = questionIndex === -1 ? nextPath : nextPath.slice(0, questionIndex);
    const params = new URLSearchParams(questionIndex === -1 ? undefined : nextPath.slice(questionIndex + 1));
    params.set("customerId", customerId);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return `/customers/${customerId}`;
}

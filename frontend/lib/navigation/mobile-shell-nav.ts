export const MOBILE_PRIMARY_SLOT_COUNT = 4;

const MOBILE_PRIMARY_PREFERENCE = [
  "/home",
  "/leads",
  "/calls",
  "/messaging",
  "/schedule",
  "/jobs",
  "/customers",
] as const;

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function splitMobileNavItems<T extends { href: string }>(visiblePrimaryNav: readonly T[]) {
  const visibleByHref = new Map(visiblePrimaryNav.map((item) => [item.href, item]));
  const primary: T[] = [];
  const usedHrefs = new Set<string>();

  function addIfVisible(href: string) {
    if (primary.length >= MOBILE_PRIMARY_SLOT_COUNT) {
      return;
    }

    const item = visibleByHref.get(href);

    if (item && !usedHrefs.has(href)) {
      primary.push(item);
      usedHrefs.add(href);
    }
  }

  for (const href of MOBILE_PRIMARY_PREFERENCE) {
    if (primary.length >= MOBILE_PRIMARY_SLOT_COUNT) {
      break;
    }

    addIfVisible(href);
  }

  for (const item of visiblePrimaryNav) {
    if (primary.length >= MOBILE_PRIMARY_SLOT_COUNT) {
      break;
    }

    if (!usedHrefs.has(item.href)) {
      primary.push(item);
      usedHrefs.add(item.href);
    }
  }

  const primaryHrefs = new Set(primary.map((item) => item.href));
  const more = visiblePrimaryNav.filter((item) => !primaryHrefs.has(item.href));

  return { primary, more };
}

export function isMobileMoreTabActive(
  pathname: string | null,
  primaryItems: readonly { href: string }[],
  moreItems: readonly { href: string }[],
) {
  if (!pathname) {
    return false;
  }

  for (const item of primaryItems) {
    if (isRouteActive(pathname, item.href)) {
      return false;
    }
  }

  if (isRouteActive(pathname, "/settings")) {
    return true;
  }

  return moreItems.some((item) => isRouteActive(pathname, item.href));
}

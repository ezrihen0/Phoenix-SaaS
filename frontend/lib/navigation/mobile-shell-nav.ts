import { getMobileMoreMenuHrefs, MOBILE_FIELD_COMMAND_PRIMARY } from "@/lib/navigation/mobile-more-menu";

export function isRouteActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolve fixed Field Command primary tabs — no backfill of other routes. */
export function resolveMobilePrimaryNav<T extends { href: string }>(visibleNav: readonly T[]): T[] {
  const visibleByHref = new Map(visibleNav.map((item) => [item.href, item]));
  const primary: T[] = [];

  for (const href of MOBILE_FIELD_COMMAND_PRIMARY) {
    const item = visibleByHref.get(href);

    if (item) {
      primary.push(item);
    }
  }

  return primary;
}

export function isMobileMoreTabActive(
  pathname: string | null,
  primaryItems: readonly { href: string }[],
  visibleMoreHrefs: readonly string[],
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

  return visibleMoreHrefs.some((href) => isRouteActive(pathname, href));
}

/** @deprecated Use resolveMobilePrimaryNav — kept for any external references during migration. */
export const MOBILE_PRIMARY_SLOT_COUNT = MOBILE_FIELD_COMMAND_PRIMARY.length;

/** @deprecated Use resolveMobilePrimaryNav. */
export function splitMobileNavItems<T extends { href: string }>(visiblePrimaryNav: readonly T[]) {
  const primary = resolveMobilePrimaryNav(visiblePrimaryNav);
  const primaryHrefs = new Set(primary.map((item) => item.href));
  const moreHrefs = new Set(getMobileMoreMenuHrefs());
  const more = visiblePrimaryNav.filter(
    (item) => !primaryHrefs.has(item.href) && moreHrefs.has(item.href),
  );

  return { primary, more };
}

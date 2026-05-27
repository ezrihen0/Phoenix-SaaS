export type MobileMoreMenuSectionId = "workspace" | "operations" | "money" | "admin";

export type MobileMoreMenuLink = {
  href: string;
};

export type MobileMoreMenuSection = {
  id: MobileMoreMenuSectionId;
  links: MobileMoreMenuLink[];
};

/** Field Command primary bottom tabs — fixed order, no backfill. */
export const MOBILE_FIELD_COMMAND_PRIMARY = [
  "/home",
  "/leads",
  "/jobs",
  "/schedule",
] as const;

export const MOBILE_MORE_MENU_SECTIONS: MobileMoreMenuSection[] = [
  {
    id: "workspace",
    links: [{ href: "/settings" }],
  },
  {
    id: "operations",
    links: [
      { href: "/home" },
      { href: "/jobs" },
      { href: "/customers" },
      { href: "/inspections" },
    ],
  },
  {
    id: "money",
    links: [
      { href: "/invoices" },
      { href: "/estimates" },
    ],
  },
];

export function getMobileMoreMenuHrefs(): string[] {
  return MOBILE_MORE_MENU_SECTIONS.flatMap((section) => section.links.map((link) => link.href));
}

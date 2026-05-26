import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CreditCard,
  Globe2,
  Languages,
  Palette,
  ShieldCheck,
  UserCog,
  UsersRound,
} from "lucide-react";

export type SettingsTopicId =
  | "business"
  | "profile"
  | "appearance"
  | "roles"
  | "billing"
  | "languages";

export type SettingsSectionKind = "panel" | "external-link";

export type SettingsMetricKey =
  | "businessProfile"
  | "ownerTools"
  | "teamMembers"
  | "languagesLinked";

export type SettingsSectionConfig = {
  id: SettingsTopicId;
  kind: SettingsSectionKind;
  labelKey: string;
  titleKey: string;
  helperKey: string;
  icon: LucideIcon;
  ownerOnlyNav?: boolean;
  ownerOnlyPanel?: boolean;
  externalHref?: string;
  metricKey?: SettingsMetricKey;
};

const SETTINGS_TOPIC_IDS: SettingsTopicId[] = [
  "business",
  "profile",
  "appearance",
  "roles",
  "billing",
  "languages",
];

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: "business",
    kind: "panel",
    labelKey: "business.label",
    titleKey: "business.title",
    helperKey: "business.helper",
    icon: Building2,
    metricKey: "businessProfile",
  },
  {
    id: "profile",
    kind: "panel",
    labelKey: "profile.label",
    titleKey: "profile.title",
    helperKey: "profile.helper",
    icon: UserCog,
  },
  {
    id: "appearance",
    kind: "panel",
    labelKey: "appearance.label",
    titleKey: "appearance.title",
    helperKey: "appearance.helper",
    icon: Palette,
  },
  {
    id: "roles",
    kind: "panel",
    labelKey: "roles.label",
    titleKey: "roles.title",
    helperKey: "roles.helper",
    icon: UsersRound,
    ownerOnlyPanel: true,
    metricKey: "teamMembers",
  },
  {
    id: "billing",
    kind: "panel",
    labelKey: "billing.label",
    titleKey: "billing.title",
    helperKey: "billing.helper",
    icon: CreditCard,
    ownerOnlyNav: true,
  },
  {
    id: "languages",
    kind: "external-link",
    labelKey: "languages.label",
    titleKey: "languages.title",
    helperKey: "languages.helper",
    icon: Languages,
    externalHref: "/language-store",
    metricKey: "languagesLinked",
  },
];

export function isSettingsTopic(value: string | null | undefined): value is SettingsTopicId {
  return SETTINGS_TOPIC_IDS.includes(value as SettingsTopicId);
}

export function getVisibleSections(
  sections: SettingsSectionConfig[],
  ownerMode: boolean,
): SettingsSectionConfig[] {
  return sections.filter((section) => !section.ownerOnlyNav || ownerMode);
}

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export function resolveSectionLabels(section: SettingsSectionConfig, t: TranslateFn) {
  return {
    label: t(section.labelKey),
    title: t(section.titleKey),
    helper: t(section.helperKey),
  };
}

export type SettingsMetricsContext = {
  t: TranslateFn;
  ownerMode: boolean;
  organizationBusinessName: string | null;
  staffCount: number | null;
  staffLoadError: string | null;
};

export type SettingsMetricTile = {
  metricKey: SettingsMetricKey;
  icon: LucideIcon;
  label: string;
  value: string | number;
  helper: string;
};

const METRIC_ICONS: Record<SettingsMetricKey, LucideIcon> = {
  businessProfile: Building2,
  ownerTools: ShieldCheck,
  teamMembers: UsersRound,
  languagesLinked: Globe2,
};

export function resolveSettingsMetrics(ctx: SettingsMetricsContext): SettingsMetricTile[] {
  const {
    t,
    ownerMode,
    organizationBusinessName,
    staffCount,
    staffLoadError,
  } = ctx;

  const businessName = organizationBusinessName?.trim() ?? "";

  return [
    {
      metricKey: "businessProfile",
      icon: METRIC_ICONS.businessProfile,
      label: t("metrics.businessProfile.label"),
      value: t("metrics.businessProfile.active"),
      helper: businessName
        ? t("metrics.businessProfile.loadedHelper", { name: businessName })
        : t("metrics.businessProfile.unnamedHelper"),
    },
    {
      metricKey: "ownerTools",
      icon: METRIC_ICONS.ownerTools,
      label: t("metrics.ownerTools.label"),
      value: ownerMode ? t("enabled") : t("locked"),
      helper: ownerMode
        ? t("metrics.ownerTools.enabledHelper")
        : t("metrics.ownerTools.lockedHelper"),
    },
    {
      metricKey: "teamMembers",
      icon: METRIC_ICONS.teamMembers,
      label: t("metrics.teamMembers.label"),
      value: ownerMode && !staffLoadError && staffCount !== null ? staffCount : "—",
      helper: ownerMode && !staffLoadError
        ? t("metrics.teamMembers.countHelper")
        : t("metrics.teamMembers.lockedHelper"),
    },
    {
      metricKey: "languagesLinked",
      icon: METRIC_ICONS.languagesLinked,
      label: t("metrics.languagesLinked.label"),
      value: t("metrics.languagesLinked.linked"),
      helper: t("metrics.languagesLinked.helper"),
    },
  ];
}

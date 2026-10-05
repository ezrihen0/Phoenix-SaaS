import type { MetadataRoute } from "next";

import {
  CRM_BRAND_NAME,
  CRM_PWA_DESCRIPTION,
  CRM_PWA_ICON_192,
  CRM_PWA_ICON_512,
  CRM_PWA_ICON_512_MASKABLE,
  CRM_SPLASH_BACKGROUND,
} from "@/lib/branding/crm-brand";

const PHOENIX_PWA_SHORT_NAME = "Phoenix";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CRM_BRAND_NAME,
    short_name: PHOENIX_PWA_SHORT_NAME,
    description: CRM_PWA_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: CRM_SPLASH_BACKGROUND,
    theme_color: CRM_SPLASH_BACKGROUND,
    icons: [
      {
        src: CRM_PWA_ICON_192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: CRM_PWA_ICON_512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: CRM_PWA_ICON_512_MASKABLE,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

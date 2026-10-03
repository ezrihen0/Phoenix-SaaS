import type { MetadataRoute } from "next";

import {
  CRM_BRAND_NAME,
  CRM_FAVICON_SRC,
  CRM_PWA_DESCRIPTION,
  CRM_SPLASH_BACKGROUND,
} from "@/lib/branding/crm-brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: CRM_BRAND_NAME,
    short_name: CRM_BRAND_NAME,
    description: CRM_PWA_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: CRM_SPLASH_BACKGROUND,
    theme_color: CRM_SPLASH_BACKGROUND,
    icons: [
      {
        src: CRM_FAVICON_SRC,
        sizes: "695x724",
        type: "image/png",
        purpose: "any",
      },
      {
        src: CRM_FAVICON_SRC,
        sizes: "695x724",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

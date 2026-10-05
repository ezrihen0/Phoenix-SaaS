import type { Metadata, Viewport } from "next";
import type { CSSProperties } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { PhoenixBootProvider } from "@/components/phoenix/phoenix-boot-provider";
import { PhoenixStaticBoot } from "@/components/phoenix/phoenix-static-boot";
import {
  CRM_BRAND_NAME,
  CRM_FAVICON_SRC,
  CRM_PWA_ICON_192,
  CRM_PWA_DESCRIPTION,
  CRM_SPLASH_BACKGROUND,
} from "@/lib/branding/crm-brand";
import { IOS_STARTUP_IMAGES } from "@/lib/branding/ios-startup-images";
import { getWorkerUiDirection, resolveSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import "./globals.css";

const PHOENIX_BOOT_INLINE_SCRIPT = `(function(){var bright=false;try{var storageKey="wizfield.appearance.theme";var stored=localStorage.getItem(storageKey);if(stored){document.documentElement.dataset.theme=stored;bright=stored==="fire-ember";}}catch(e){}document.documentElement.style.backgroundColor=bright?"#f8fafc":"${CRM_SPLASH_BACKGROUND}";document.documentElement.style.colorScheme=bright?"light":"dark";var themeColor=document.querySelector('meta[name="theme-color"]');if(themeColor){themeColor.setAttribute("content",bright?"#f8fafc":"${CRM_SPLASH_BACKGROUND}");}})();`;

const fontVariables = {
  "--font-geist-sans": 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-geist-mono": 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  "--font-flat-display": 'Georgia, "Times New Roman", serif',
} as CSSProperties;

export const viewport: Viewport = {
  themeColor: CRM_SPLASH_BACKGROUND,
  colorScheme: "dark",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: CRM_BRAND_NAME,
  description: CRM_PWA_DESCRIPTION,
  applicationName: CRM_BRAND_NAME,
  icons: {
    icon: [
      { url: CRM_PWA_ICON_192, sizes: "192x192", type: "image/png" },
      { url: CRM_FAVICON_SRC, type: "image/png" },
    ],
    apple: CRM_PWA_ICON_192,
  },
  appleWebApp: {
    capable: true,
    title: CRM_BRAND_NAME,
    statusBarStyle: "black-translucent",
    startupImage: IOS_STARTUP_IMAGES,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = resolveSupportedWorkerUiLocale(await getLocale());
  const direction = getWorkerUiDirection(locale);

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme="brown-cream"
      suppressHydrationWarning
      className="h-full antialiased"
      style={{ ...fontVariables, backgroundColor: CRM_SPLASH_BACKGROUND }}
    >
      <body className="min-h-full flex flex-col bg-[color:var(--cmp-surface-canvas,#05070C)]">
        <Script id="phoenix-boot-inline" strategy="beforeInteractive">
          {PHOENIX_BOOT_INLINE_SCRIPT}
        </Script>
        <NextIntlClientProvider>
          <PhoenixBootProvider>
            <PhoenixStaticBoot />
            <AppShell>{children}</AppShell>
          </PhoenixBootProvider>
        </NextIntlClientProvider>
        {process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL ? (
          <Script
            src={process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT_URL}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  );
}

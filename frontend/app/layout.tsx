import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { getWorkerUiDirection, resolveSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import "./globals.css";

const fontVariables = {
  "--font-geist-sans": 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "--font-geist-mono": 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  "--font-flat-display": 'Georgia, "Times New Roman", serif',
} as CSSProperties;

export const metadata: Metadata = {
  title: "WizField",
  description:
    "Field-service operating system for owners who are tired of losing calls, jobs, estimates, invoices, and customer history.",
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
      style={fontVariables}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          <AppShell>{children}</AppShell>
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

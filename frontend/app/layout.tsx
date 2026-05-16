import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import Script from "next/script";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { getWorkerUiDirection, resolveSupportedWorkerUiLocale } from "@/lib/i18n/locales";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-flat-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WizField",
  description:
    "Field-service operating system for owners who are tired of losing calls, jobs, estimates, invoices, and customer history.",
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
      className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} h-full antialiased`}
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

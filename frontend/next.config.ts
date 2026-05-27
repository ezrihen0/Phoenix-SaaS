import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { readAllowedDevOrigins } from "./lib/dev/allowed-dev-origins";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
  ?? process.env.BACKEND_INTERNAL_URL
  ?? "http://localhost:4000";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const allowedDevOrigins = readAllowedDevOrigins();

if (process.env.NODE_ENV !== "production" && allowedDevOrigins.length > 0) {
  console.log(`[dev] allowedDevOrigins: ${allowedDevOrigins.join(", ")}`);
}

const nextConfig: NextConfig = {
  allowedDevOrigins,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
};

export default withNextIntl(nextConfig);

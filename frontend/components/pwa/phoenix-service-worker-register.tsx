"use client";

import { useEffect } from "react";

import { registerPhoenixServiceWorker } from "@/lib/pwa/register-phoenix-service-worker";

/** Registers the Phoenix PWA service worker on every authenticated shell load (Android installability). */
export function PhoenixServiceWorkerRegister() {
  useEffect(() => {
    void registerPhoenixServiceWorker();
  }, []);

  return null;
}

const PHOENIX_SW_URL = "/push-sw.js";
const PHOENIX_SW_SCOPE = "/";

let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerPhoenixServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker
      .register(PHOENIX_SW_URL, { scope: PHOENIX_SW_SCOPE })
      .catch(() => null);
  }

  return registrationPromise;
}

export async function getPhoenixServiceWorkerRegistration() {
  const registration = await registerPhoenixServiceWorker();
  if (registration) {
    await navigator.serviceWorker.ready;
  }
  return registration;
}

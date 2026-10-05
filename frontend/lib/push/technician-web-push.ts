import { crmApiFetch } from "@/lib/crm/browser-api";
import { getPhoenixServiceWorkerRegistration } from "@/lib/pwa/register-phoenix-service-worker";

type VapidKeyResponse = {
  enabled: boolean;
  publicKey: string | null;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export function isTechnicianWebPushSupported() {
  return (
    typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
  );
}

export function getTechnicianNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isTechnicianWebPushSupported()) {
    return "unsupported";
  }

  return Notification.permission;
}

async function fetchVapidPublicKey() {
  const response = await crmApiFetch<VapidKeyResponse>("/api/push/vapid-public-key");

  if (!response.enabled || !response.publicKey) {
    return null;
  }

  return response.publicKey;
}

async function ensurePushServiceWorker() {
  const registration = await getPhoenixServiceWorkerRegistration();
  if (!registration) {
    throw new Error("Service worker registration is unavailable.");
  }
  return registration;
}

export async function registerTechnicianWebPush(options?: { requestPermission?: boolean }) {
  if (!isTechnicianWebPushSupported()) {
    return { status: "unsupported" as const };
  }

  const vapidPublicKey = await fetchVapidPublicKey();
  if (!vapidPublicKey) {
    return { status: "disabled" as const };
  }

  let permission = Notification.permission;

  if (permission === "default" && options?.requestPermission) {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { status: "denied" as const, permission };
  }

  const registration = await ensurePushServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing
    ?? (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { status: "invalid_subscription" as const };
  }

  await crmApiFetch("/api/push/subscriptions", {
    method: "PUT",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    }),
  });

  return { status: "registered" as const };
}

export async function unregisterTechnicianWebPush() {
  if (!isTechnicianWebPushSupported()) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  const json = subscription.toJSON();
  if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
    await crmApiFetch("/api/push/subscriptions", {
      method: "DELETE",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      }),
    });
  }

  await subscription.unsubscribe();
}

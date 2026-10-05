self.addEventListener("push", (event) => {
  let payload = {
    title: "Phoenix job update",
    body: "",
    url: "/",
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title: typeof parsed.title === "string" ? parsed.title : payload.title,
          body: typeof parsed.body === "string" ? parsed.body : payload.body,
          url: typeof parsed.url === "string" ? parsed.url : payload.url,
        };
      }
    }
  } catch {
    // Keep default payload when push body is not JSON.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/phoenix-logo - favicon.png",
      badge: "/phoenix-logo - favicon.png",
      data: { url: payload.url },
      tag: payload.url,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/";

  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            return client.navigate(absoluteUrl);
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }

      return undefined;
    }),
  );
});

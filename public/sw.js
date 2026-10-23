// RetireWise service worker: push notifications only.
//
// It shows a notification when one arrives and opens the app at the page it
// names when it is tapped. It does not cache or intercept requests, so it
// cannot change how the app loads or serve a stale page.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "RetireWise", body: "", url: "/dashboard" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // A push with no readable payload still has to show something: WebKit
    // withdraws permission from a site whose pushes show nothing.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/apple-icon",
      badge: "/icon",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          return w.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : c));
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

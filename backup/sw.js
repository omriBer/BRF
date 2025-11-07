const CACHE_NAME = "brf-cache-v6";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./week.js",
  "./firebase.js",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./child.html",
  "./child.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  // שמירה על תאימות לישן + מעבר מהיר
  if (self.registration && self.registration.navigationPreload) {
    self.registration.navigationPreload.enable().catch(() => {});
  }
  clients.claim();
});

// שמירת ה-handler של notifications אם תבוא מה-FCM או מה-Notification API
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // פתח/פוקוס על הטאב הראשי
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clis) => {
      const url = new URL("/", location.origin).toString();
      for (const c of clis) {
        if ("focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// אסטרטגיה: Firebase -> network-first; שאר -> SWR; shell -> cache-first
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Firebase / gstatic: network-first
  if (
    url.origin.includes("firebase") ||
    url.hostname.endsWith("gstatic.com") ||
    url.hostname.endsWith("googleapis.com")
  ) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // קבצי ה-shell: cache-first
  if (APP_SHELL.some((p) => url.pathname.endsWith(p.replace("./", "")))) {
    event.respondWith(caches.match(req).then((res) => res || fetch(req)));
    return;
  }

  // שאר הבקשות: stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || network || Response.error();
    })()
  );
});

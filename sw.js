// Core PWA service worker. Firebase Cloud Messaging runs via firebase-messaging-sw.js.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("SW Ready");
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
});

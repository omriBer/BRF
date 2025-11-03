self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("SW Ready");
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
});

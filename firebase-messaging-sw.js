// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA0EL2Iu16peYKzMS8LlA1VeuxEqYjieCo",
  authDomain: "brf-task-notifier.firebaseapp.com",
  projectId: "brf-task-notifier",
  storageBucket: "brf-task-notifier.firebasestorage.app",
  messagingSenderId: "409928986401",
  appId: "1:409928986401:web:8ec465f8ff091098201860"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload?.notification || {};
  self.registration.showNotification(n.title || "הודעה", {
    body: n.body || "",
    icon: "icon-192.png",
    data: payload?.data || {}
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("./"));
});

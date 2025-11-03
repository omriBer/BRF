// firebase-messaging-sw.js
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDdEhEqRRQDKUmTJ73c3LLKxP8s4q5WIec",
  authDomain: "mazal-family.firebaseapp.com",
  projectId: "mazal-family",
  storageBucket: "mazal-family.firebasestorage.app",
  messagingSenderId: "495595541465",
  appId: "1:495595541465:web:5a89f8a094876543d13fc8"
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

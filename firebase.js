// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging.js";

// === Firebase config החדש (brf-task-notifier) ===
const firebaseConfig = {
  apiKey: "AIzaSyA0EL2Iu16peYKzMS8LlA1VeuxEqYjieCo",
  authDomain: "brf-task-notifier.firebaseapp.com",
  projectId: "brf-task-notifier",
  storageBucket: "brf-task-notifier.firebasestorage.app",
  messagingSenderId: "409928986401",
  appId: "1:409928986401:web:8ec465f8ff091098201860"
};

// === VAPID Public Key מה-Cloud Messaging של הפרויקט החדש ===
const VAPID_PUBLIC_KEY = "BMTDkK5kKg1YdMNjZ1GDZCBoBPXaGNsq4CPGK8HBX9nuSUXwxLBzME-9glBht2m4zVe8ca1QDDjBQSszAE1YE9M";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// רישום SW ייעודי ל-FCM
async function registerFcmSw() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[FCM] serviceWorker not supported");
    return null;
  }
  try {
    const existing = await navigator.serviceWorker.getRegistration("firebase-messaging-sw.js");
    if (existing) {
      console.log("[FCM] SW already registered:", existing.scope);
      return existing;
    }
    const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    console.log("[FCM] SW registered:", reg.scope);
    return reg;
  } catch (e) {
    console.error("[FCM] SW register failed:", e);
    return null;
  }
}

// פונקציה ליזום הרשאות, להוציא Token, ולשמור אופציונלית ל-Firestore
export async function initMessaging(personId = null) {
  try {
    console.log("[FCM] initMessaging start");
    if (!("Notification" in window)) {
      console.warn("[FCM] Notifications API not supported");
      return null;
    }
    const permission = await Notification.requestPermission();
    console.log("[FCM] permission:", permission);
    if (permission !== "granted") {
      alert("התראות לא אושרו");
      return null;
    }

    const reg = await registerFcmSw();
    if (!reg) {
      alert("רישום Service Worker נכשל");
      return null;
    }

    const token = await getToken(messaging, { vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
    console.log("🔑 FCM token:", token);
    if (!token) {
      alert("לא התקבל token");
      return null;
    }

    // שמירה אופציונלית ל-Firestore (עוזר לעקוב אחרי מכשירים)
    try {
      const deviceId = token.slice(0, 16);
      await setDoc(doc(db, "devices", deviceId), {
        personId,
        fcmToken: token,
        platform: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mobile-web" : "web",
        registeredAt: serverTimestamp()
      });
      if (personId) {
        await updateDoc(doc(db, "people", personId), {
          deviceTokens: arrayUnion(token),
          updatedAt: serverTimestamp()
        });
      }
      console.log("[FCM] device saved");
    } catch (e) {
      console.warn("[FCM] save device failed:", e);
    }

    // קבלת הודעות כשהדף פתוח
    onMessage(messaging, (payload) => {
      console.log("📩 onMessage:", payload);
      const n = payload?.notification || {};
      try {
        new Notification(n.title || "הודעה", { body: n.body || "", icon: "icon-192.png" });
      } catch {
        console.log("Foreground message:", payload);
      }
    });

    // לחשוף token לקריאה ידנית
    return token;
  } catch (err) {
    console.error("[FCM] initMessaging error:", err);
    return null;
  }
}

// לחשוף גלובלית כדי שאפשר יהיה להריץ מה-Console/כפתור
window.initMessaging = initMessaging;
console.log("[FCM] window.initMessaging attached:", typeof window.initMessaging);

export const PeopleAPI = {
  onSnapshot(callback) {
    return onSnapshot(collection(db, "people"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      callback(arr);
    });
  },
  async add(name) {
    const ref = await addDoc(collection(db, "people"), {
      name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  },
  async rename(id, name) {
    await updateDoc(doc(db, "people", id), { name, updatedAt: serverTimestamp() });
  },
  async remove(id) {
    await deleteDoc(doc(db, "people", id));
  }
};

export const TasksAPI = {
  onSnapshot(callback) {
    return onSnapshot(collection(db, "tasks"), (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      callback(arr);
    });
  },
  async add(task) {
    const payload = {
      title: task.title || "ללא כותרת",
      description: task.description || "",
      personId: task.personId || null,
      datetime: task.datetime ? new Date(task.datetime) : null,
      reminderBefore: Number(task.reminderBefore || 0),
      recurring: task.recurring || "none",
      category: (task.category || "").trim(),
      lastReminderSent: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "tasks"), payload);
    return ref.id;
  },
  async update(id, updates) {
    const payload = { ...updates };
    if (payload.datetime) {
      payload.datetime = new Date(payload.datetime);
    }
    if (payload.category != null) {
      payload.category = (payload.category || "").trim();
    }
    if (payload.lastReminderSent) {
      payload.lastReminderSent = new Date(payload.lastReminderSent);
    }
    await updateDoc(doc(db, "tasks", id), {
      ...payload,
      updatedAt: serverTimestamp()
    });
  },
  async remove(id) {
    await deleteDoc(doc(db, "tasks", id));
  }
};

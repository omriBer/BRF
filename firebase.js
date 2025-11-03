// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
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
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyDdEhEqRRQDKUmTJ73c3LLKxP8s4q5WIec",
  authDomain: "mazal-family.firebaseapp.com",
  projectId: "mazal-family",
  storageBucket: "mazal-family.firebasestorage.app",
  messagingSenderId: "495595541465",
  appId: "1:495595541465:web:5a89f8a094876543d13fc8"
};

// VAPID ציבורי שנוצר ב-FCM
const VAPID_PUBLIC_KEY = "BN6ULGQ_WF9mXHaS26D61Yz2xyKFdxGuaj99FA6Me795kqUBh4Gu_7dAB90FkcBUuk7LyKY_IZ3QP9AalCUpjSk";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// רישום Service Worker ייעודי ל-FCM
async function registerFcmSw() {
  if (!("serviceWorker" in navigator)) {
    console.warn("[FCM] serviceWorker not supported");
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");
    console.log("[FCM] SW registered:", reg.scope);
    return reg;
  } catch (e) {
    console.error("[FCM] SW register failed:", e);
    return null;
  }
}

// פונקציה ליזום הרשאות, לקבל token ולשמור (אופציונלי) ל-Firestore
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

    // שמירה אופציונלית ל-Firestore (לסיוע בדיבוג)
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

    // קבלת הודעות כאשר הלשונית פתוחה
    onMessage(messaging, (payload) => {
      console.log("📩 onMessage:", payload);
      const n = payload?.notification || {};
      try {
        new Notification(n.title || "הודעה", {
          body: n.body || "",
          icon: "icon-192.png"
        });
      } catch (e) {
        console.log("Foreground message:", payload);
      }
    });

    return token;
  } catch (err) {
    console.error("[FCM] initMessaging error:", err);
    return null;
  }
}

// ✅ לחשוף ל-window כדי שניתן יהיה להריץ מה-Console ומה-UI
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
      lastReminderSent: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    const ref = await addDoc(collection(db, "tasks"), payload);
    return ref.id;
  },
  async update(id, patch) {
    const fixed = { ...patch, updatedAt: serverTimestamp() };
    if (fixed.datetime) fixed.datetime = new Date(fixed.datetime);
    await updateDoc(doc(db, "tasks", id), fixed);
  },
  async remove(id) {
    await deleteDoc(doc(db, "tasks", id));
  }
};

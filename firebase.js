// firebase.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, doc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";

// ----- CONFIG (השאר ערכים כפי שהוגדרו בפרויקט שלך) -----
const firebaseConfig = {
  apiKey: "AIzaSyDdEhEqRRQDKUmTJ73c3LLKxP8s4q5WIec",
  authDomain: "mazal-family.firebaseapp.com",
  projectId: "mazal-family",
  storageBucket: "mazal-family.firebasestorage.app",
  messagingSenderId: "495595541465",
  appId: "1:495595541465:web:5a89f8a094876543d13fc8"
};
// Public VAPID from Cloud Messaging (Web Push certificates)
const VAPID_PUBLIC_KEY = "BN6ULGQ_WF9mXHaS26D61Yz2xyKFdxGuaj99FA6Me795kqUBh4Gu_7dAB90FkcBUuk7LyKY_IZ3QP9AalCUpjSk";

// ----- INIT -----
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// ----- Messaging init for Web Push -----
export async function initMessaging(personId) {
  if (!("Notification" in window)) {
    console.warn("Notifications not supported in this browser");
    return null;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.warn("User denied notifications");
    return null;
  }

  // חשוב: רישום SW ייעודי ל-FCM (ברקע)
  const reg = await navigator.serviceWorker.register("firebase-messaging-sw.js");

  const token = await getToken(messaging, {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: reg
  });
  if (!token) {
    console.warn("FCM token unavailable");
    return null;
  }

  console.log("🔑 FCM token:", token);

  // שמירת המכשיר ל-Firestore: devices + הוספה ל-people.deviceTokens
  try {
    const platform = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? "mobile-web" : "web";
    const deviceId = token.slice(0, 16); // ID קצר ממוזער
    await setDoc(doc(db, "devices", deviceId), {
      personId: personId || null,
      fcmToken: token,
      platform,
      registeredAt: serverTimestamp()
    });

    if (personId) {
      await updateDoc(doc(db, "people", personId), {
        deviceTokens: arrayUnion(token),
        updatedAt: serverTimestamp()
      });
    }
  } catch (e) {
    console.error("Failed saving device token", e);
  }

  // הודעות בעת שהאפליקציה פתוחה (Foreground)
  onMessage(messaging, (payload) => {
    const n = payload?.notification || {};
    try {
      new Notification(n.title || "הודעה", {
        body: n.body || "",
        icon: n.icon || "icons/icon-192.png"
      });
    } catch (_) {
      // אם חסום, לפחות לוג
      console.log("Message:", payload);
    }
  });

  return token;
}

// עזרי DB ל-CRUD (ייבוא מתוך app.js)
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
      name, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
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

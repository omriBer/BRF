<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
  import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js";

  // קונפיגורציה שלך (מהשורה שקיבלת בפיירבייס)
  const firebaseConfig = {
    apiKey: "AIzaSyDdEhEqRRQDKUmTJ73c3LLKxP8s4q5WIec",
    authDomain: "mazal-family.firebaseapp.com",
    projectId: "mazal-family",
    storageBucket: "mazal-family.firebasestorage.app",
    messagingSenderId: "495595541465",
    appId: "1:495595541465:web:5a89f8a094876543d13fc8"
  };

  // אתחול
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  // זהו ה־Public Key שיצרת ב־Cloud Messaging
  const vapidKey = "BN6ULGQ_WF9mXHaS26D61Yz2xyKFdxGuaj99FA6Me795kqUBh4Gu_7dAB90FkcBUuk7LyKY_IZ3QP9AalCUpjSk";

  // בקשת הרשאה והתראה
  async function initMessaging() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("המשתמש לא אישר התראות.");
        return;
      }

      const token = await getToken(messaging, { vapidKey });
      console.log("🔑 FCM token:", token);

      alert("המכשיר רשום לקבלת התראות ✅");
      // כאן בעתיד נוסיף שליחה של ה-token ל-Firestore בקולקציית devices
    } catch (err) {
      console.error("שגיאה בהרשמת FCM:", err);
    }
  }

  // נוכל לקרוא לפונקציה הזו מתוך app.js ברגע שהמשתמש מאשר התראות
  window.initMessaging = initMessaging;

  // מאזין להתראות שנקלטות כשהאפליקציה פתוחה
  onMessage(messaging, (payload) => {
    console.log("📩 הודעה התקבלה:", payload);
    new Notification(payload.notification.title, {
      body: payload.notification.body,
      icon: payload.notification.icon
    });
  });
</script>

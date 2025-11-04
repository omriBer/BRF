import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const qs = new URLSearchParams(location.search);
const personId = qs.get("user");

function parseISO(d) {
  if (!d) return null;
  const value = typeof d.toDate === "function" ? d.toDate() : d;
  const x = new Date(value);
  return Number.isFinite(x.getTime()) ? x : null;
}
function toHM(d) {
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function getDayStart(dt) {
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function weekdayToNextDate(weekday, base) {
  const d = new Date(base);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

async function loadData() {
  const people = {};
  (await getDocs(query(collection(db, "people")))).forEach((docSnap) => {
    const person = { id: docSnap.id, ...docSnap.data() };
    people[person.id] = person;
  });

  const tasks = [];
  (await getDocs(query(collection(db, "tasks")))).forEach((docSnap) => {
    const task = { id: docSnap.id, ...docSnap.data() };
    if (task.personId === personId) {
      tasks.push(task);
    }
  });
  return { people, tasks };
}

function expandToOccurrences(tasks, baseDate) {
  const results = [];
  const start = getDayStart(baseDate);
  const end = addDays(start, 7);

  tasks.forEach((task) => {
    if (task.type === "recurring" || task.recurring === "weekly") {
      let { weekday, time } = task;
      weekday = weekday != null ? Number(weekday) : weekday;
      if (weekday == null || !time) {
        const d = parseISO(task.datetime);
        if (!d) return;
        weekday = d.getDay();
        time = toHM(d);
      }
      if (!Number.isInteger(weekday)) return;
      const target = weekday != null ? weekdayToNextDate(weekday, start) : null;
      if (!target) return;
      const [hh, mm] = (time || "").split(":").map((n) => +n || 0);
      target.setHours(hh, mm || 0, 0, 0);
      if (target >= start && target < end) {
        results.push({
          title: task.title || "",
          datetime: new Date(target),
          category: task.category || "",
          recurring: true
        });
      }
    } else {
      const d = parseISO(task.datetime);
      if (!d) return;
      if (d >= start && d < end) {
        results.push({
          title: task.title || "",
          datetime: d,
          category: task.category || "",
          recurring: false
        });
      }
    }
  });
  return results.sort((a, b) => a.datetime - b.datetime);
}

function renderList(rootId, items, dayStart, dayEnd) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.innerHTML = "";
  const filtered = items.filter((item) => item.datetime >= dayStart && item.datetime < dayEnd);
  if (!filtered.length) {
    root.innerHTML = "<div class='item'><div class='meta'>אין משימות</div></div>";
    return;
  }
  filtered.forEach((item) => {
    const div = document.createElement("div");
    div.className = "item";
    const dot = document.createElement("span");
    dot.className = "dot";
    const inner = document.createElement("div");
    const line1 = document.createElement("div");
    line1.innerHTML = `<span class="time">${toHM(item.datetime)}</span> <span class="title">${item.title}</span> ${item.recurring ? '<span class="badge">שבועי</span>' : ""}`;
    const line2 = document.createElement("div");
    line2.className = "meta";
    line2.textContent = item.category || "";
    inner.append(line1, line2);
    div.append(dot, inner);
    root.append(div);
  });
}

(async function init() {
  if (!personId) {
    const title = document.getElementById("kidName");
    if (title) title.textContent = "לא נמצא מזהה משתמש";
    return;
  }
  const { people, tasks } = await loadData();
  const title = document.getElementById("kidName");
  if (title) {
    title.textContent = people[personId]?.name ? `המשימות של ${people[personId].name}` : "המשימות שלי";
  }

  const now = new Date();
  const startToday = getDayStart(now);
  const startTomorrow = addDays(startToday, 1);
  const startWeek = addDays(startToday, 2);
  const in7 = addDays(startToday, 7);

  const occurrences = expandToOccurrences(tasks, now);

  renderList("todayList", occurrences, startToday, startTomorrow);
  renderList("tomorrowList", occurrences, startTomorrow, startWeek);
  renderList("weekList", occurrences, startWeek, in7);
})();

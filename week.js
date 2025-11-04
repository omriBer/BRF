import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

const HOUR_SLOTS = [
  { key: "morning", label: "בוקר (06:00–11:59)", range: [6, 12] },
  { key: "noon", label: "צהריים (12:00–15:59)", range: [12, 16] },
  { key: "eveningA", label: "אחה״צ (16:00–18:59)", range: [16, 19] },
  { key: "night", label: "ערב (19:00–23:00)", range: [19, 24] }
];
const dayNames = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

function parseISO(d) {
  if (!d) return null;
  const value = typeof d.toDate === "function" ? d.toDate() : d;
  const x = new Date(value);
  return Number.isFinite(x.getTime()) ? x : null;
}
function toLocalHM(d) {
  return d.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function getWeekday(d) {
  return d.getDay();
}
function timeToHours(time) {
  const [hh, mm] = (time || "").split(":").map((n) => +n || 0);
  return hh + mm / 60;
}
function dateToHours(d) {
  return d.getHours() + d.getMinutes() / 60;
}
function bucketForHour(h) {
  const slot = HOUR_SLOTS.find((s) => h >= s.range[0] && h < s.range[1]);
  return slot?.key ?? null;
}
function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  const palette = ["#6c8bff", "#22b8a9", "#ff8a6c", "#b46cff", "#ffb347", "#33c3ff", "#8fc93a"];
  return palette[h % palette.length];
}

async function loadData() {
  const people = {};
  (await getDocs(query(collection(db, "people")))).forEach((docSnap) => {
    const person = { id: docSnap.id, ...docSnap.data() };
    people[person.id] = person;
  });
  const tasks = [];
  (await getDocs(query(collection(db, "tasks")))).forEach((docSnap) => {
    tasks.push({ id: docSnap.id, ...docSnap.data() });
  });
  return { people, tasks };
}

function buildWeek({ people, tasks }) {
  const week = Array.from({ length: 7 }, () => ({ morning: [], noon: [], eveningA: [], night: [] }));
  const now = new Date();

  tasks.forEach((task) => {
    const person = people[task.personId] || { name: "לא ידוע" };
    const color = person.color || hashColor(task.personId || "X");

    if (task.type === "recurring" || task.recurring === "weekly") {
      let { weekday, time } = task;
      weekday = weekday != null ? Number(weekday) : weekday;
      if (weekday == null || !time) {
        const d = parseISO(task.datetime);
        if (!d) return;
        weekday = getWeekday(d);
        time = toLocalHM(d);
      }
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return;
      const h = timeToHours(time);
      const bucket = bucketForHour(h);
      if (!bucket) return;
      week[weekday][bucket].push({
        time,
        title: task.title || "",
        kid: person.name || "",
        badge: task.category || "חוג שבועי",
        color
      });
    } else {
      const d = parseISO(task.datetime);
      if (!d) return;
      const h = dateToHours(d);
      const bucket = bucketForHour(h);
      if (!bucket) return;
      const diffMin = (d - now) / 60000;
      const soon = diffMin >= 0 && diffMin <= Math.max(Number(task.reminderBefore || 0), 60);
      const late = diffMin < -10;
      const weekday = getWeekday(d);
      if (weekday < 0 || weekday > 6) return;
      week[weekday][bucket].push({
        time: toLocalHM(d),
        title: task.title || "",
        kid: person.name || "",
        badge: task.category || "",
        color,
        soon,
        late
      });
    }
  });

  for (let day = 0; day < 7; day += 1) {
    Object.keys(week[day]).forEach((key) => {
      week[day][key].sort((a, b) => a.time.localeCompare(b.time, "he-IL", { numeric: true }));
    });
  }
  return week;
}

function renderWeek(week) {
  const days = document.querySelector("#week-screen .days");
  const rows = document.querySelector("#week-screen .rows");
  if (!days || !rows) return;

  days.innerHTML = `<div class="cell-day">חלון זמן</div>${dayNames.map((n) => `<div class="cell-day">${n}</div>`).join("")}`;
  rows.innerHTML = "";

  HOUR_SLOTS.forEach((slot) => {
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = slot.label;
    rows.append(label);

    for (let day = 0; day < 7; day += 1) {
      const cell = document.createElement("div");
      cell.className = "slot";
      week[day][slot.key].forEach((item) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.innerHTML = `
          <span class="time">${item.time}</span>
          <span class="pin" style="color:${item.color}"></span>
          <span class="kid">${item.kid}</span> – ${item.title}
          ${item.badge ? `<span class="badge">${item.badge}</span>` : ""}
          ${item.soon ? '<span class="badge badge-soon">עוד מעט</span>' : ""}
          ${item.late ? '<span class="badge badge-late">עבר הזמן</span>' : ""}
        `;
        cell.append(chip);
      });
      rows.append(cell);
    }
  });
}

async function initWeek() {
  const data = await loadData();
  const model = buildWeek(data);
  renderWeek(model);
  onSnapshot(query(collection(db, "tasks"), orderBy("datetime", "asc")), async () => {
    const fresh = await loadData();
    const next = buildWeek(fresh);
    renderWeek(next);
  });
}

export { initWeek };

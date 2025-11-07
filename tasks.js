import { PeopleAPI, TasksAPI } from "./firebase.js";

const state = {
  people: [],
  tasks: []
};

let selectedFilter = "all";
let selectedPersonId = null;

const personFilterEl = document.getElementById("person-filter");
const nextUpListEl = document.getElementById("nextup-list");
const nextUpCountEl = document.getElementById("nextup-count");
const taskListEl = document.getElementById("task-list");
const taskCountEl = document.getElementById("task-count");

init();

function init() {
  ensureSwRegistered();
  ensureNotificationPermission();
  bindFilter();
  setupRealtimeListeners();
  checkReminders();
  setInterval(checkReminders, 60_000);
}

function ensureSwRegistered() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      }
    });
  }
}

function ensureNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function bindFilter() {
  if (!personFilterEl) return;
  personFilterEl.addEventListener("change", (event) => {
    selectedFilter = event.target.value;
    if (selectedFilter !== "all") {
      selectedPersonId = selectedFilter;
    }
    renderTasks();
    renderNextUp();
  });
}

function setupRealtimeListeners() {
  PeopleAPI.onSnapshot((arr) => {
    state.people = arr;
    ensureSelectedDefaults();
    renderFilters();
    renderTasks();
    renderNextUp();
  });

  TasksAPI.onSnapshot((arr) => {
    state.tasks = arr.map(normalizeTask);
    renderTasks();
    renderNextUp();
  });
}

function ensureSelectedDefaults() {
  if (!state.people.length) {
    selectedFilter = "all";
    selectedPersonId = null;
    return;
  }
  if (!selectedPersonId || !state.people.some((p) => p.id === selectedPersonId)) {
    selectedPersonId = state.people[0].id;
  }
  if (selectedFilter !== "all" && !state.people.some((p) => p.id === selectedFilter)) {
    selectedFilter = selectedPersonId;
  }
}

function renderFilters() {
  if (!personFilterEl) return;
  personFilterEl.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "כל המשימות";
  personFilterEl.append(allOption);

  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    personFilterEl.append(option);
  });

  personFilterEl.value = selectedFilter;
}

function renderTasks() {
  if (!taskListEl || !taskCountEl) return;
  const tasks = getFilteredTasks();
  taskListEl.innerHTML = "";
  taskCountEl.textContent = tasks.length;

  if (!tasks.length) {
    const empty = document.createElement("li");
    empty.textContent = "אין משימות לתצוגה";
    empty.classList.add("empty");
    taskListEl.append(empty);
    return;
  }

  tasks
    .slice()
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    .forEach((task) => {
      const li = document.createElement("li");

      const header = document.createElement("div");
      header.className = "task-header";

      const title = document.createElement("strong");
      title.textContent = task.title;

      const actionWrap = document.createElement("div");
      actionWrap.className = "actions";

      const editBtn = document.createElement("button");
      editBtn.className = "ghost";
      editBtn.type = "button";
      editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => editTask(task.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ghost";
      deleteBtn.type = "button";
      deleteBtn.textContent = "🗑️";
      deleteBtn.addEventListener("click", () => deleteTask(task.id));

      actionWrap.append(editBtn, deleteBtn);
      header.append(title, actionWrap);

      const description = document.createElement("p");
      description.textContent = task.description || "ללא תיאור";

      const meta = document.createElement("div");
      meta.className = "task-meta";

      const person = findPerson(task.personId);
      const personLabel = document.createElement("span");
      personLabel.textContent = person ? `👤 ${person.name}` : "👤 ללא שיוך";

      const timeLabel = document.createElement("span");
      timeLabel.textContent = `🕒 ${formatDateTime(task.datetime)}`;

      const reminderLabel = document.createElement("span");
      reminderLabel.textContent = `⏰ ${task.reminderBefore || 0} דק' לפני`;

      meta.append(personLabel, timeLabel, reminderLabel);

      if (task.recurring && task.recurring !== "none") {
        const recurringLabel = document.createElement("span");
        recurringLabel.textContent = task.recurring === "daily" ? "🔁 יומי" : "🔁 שבועי";
        meta.append(recurringLabel);
      }

      if (task.category) {
        const catLabel = document.createElement("span");
        catLabel.className = "badge";
        catLabel.textContent = labelForCategory(task.category);
        meta.append(catLabel);
      }

      li.append(header, description, meta);
      taskListEl.append(li);
    });
}

function renderNextUp(limit = 5) {
  if (!nextUpListEl) return;
  const now = Date.now();
  const tasks = getFilteredTasks()
    .filter((task) => Number.isFinite(new Date(task.datetime).getTime()))
    .filter((task) => new Date(task.datetime).getTime() >= now)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime))
    .slice(0, limit);

  nextUpListEl.innerHTML = "";
  if (nextUpCountEl) nextUpCountEl.textContent = String(tasks.length);

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "nextup-item nextup-empty";
    empty.textContent = "אין אירועים קרובים";
    empty.setAttribute("role", "listitem");
    nextUpListEl.append(empty);
    return;
  }

  tasks.forEach((task) => {
    const kid = findPerson(task.personId);
    const item = document.createElement("div");
    item.className = "nextup-item";
    item.setAttribute("role", "listitem");
    if (kid) {
      item.dataset.person = kid.id;
    } else {
      delete item.dataset.person;
    }

    const accent = personAccent(kid?.id || "");
    item.style.setProperty("--nextup-bg", accent.bg);
    item.style.setProperty("--nextup-border", accent.border);
    item.style.setProperty("--nextup-text", accent.text);

    const timeText = toTime(task.datetime);
    const dayLetter = toHebrewDayLetter(task.datetime);
    const kidName = kid ? kid.name : "—";
    const title = task.title || "";

    item.textContent = `${kidName} || ${timeText} || (${dayLetter}) || ${title}`;
    nextUpListEl.append(item);
  });
}

function getFilteredTasks() {
  if (selectedFilter === "all") return state.tasks;
  return state.tasks.filter((task) => task.personId === selectedFilter);
}

function normalizeTask(task) {
  const normalized = { ...task };
  if (normalized.datetime?.toDate) normalized.datetime = normalized.datetime.toDate().toISOString();
  if (normalized.createdAt?.toDate) normalized.createdAt = normalized.createdAt.toDate().toISOString();
  if (normalized.updatedAt?.toDate) normalized.updatedAt = normalized.updatedAt.toDate().toISOString();
  if (normalized.lastReminderSent?.toDate) normalized.lastReminderSent = normalized.lastReminderSent.toDate().toISOString();
  normalized.category = (normalized.category || "").trim();
  return normalized;
}

function findPerson(id) {
  return state.people.find((p) => p.id === id) || null;
}

function toTime(dateString) {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function toHebrewDayLetter(dateString) {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return "";
  const letters = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  return letters[date.getDay()] || "";
}

function formatDateTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", hour12: false }).format(date);
}

function personAccent(key) {
  if (!key) {
    return {
      bg: "#f7f9fe",
      border: "#e6ecfb",
      text: "#1f2933"
    };
  }
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0xffffffff;
  }
  hash = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hash} 80% 95%)`,
    border: `hsl(${hash} 60% 82%)`,
    text: `hsl(${hash} 35% 32%)`
  };
}

function labelForCategory(cat) {
  switch ((cat || "").trim()) {
    case "weekly_club":
      return "חוג שבועי";
    case "birthday":
      return "יום הולדת";
    case "school":
      return "פעילות בית ספר";
    case "family":
      return "פעילות משפחה";
    case "important":
      return "אירוע חשוב";
    default:
      return cat || "";
  }
}

async function editTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const newTitle = prompt("עדכון כותרת", task.title);
  const newDescription = prompt("עדכון תיאור", task.description);
  const newReminder = prompt("תזכורת (בדקות לפני)", String(task.reminderBefore ?? 0));
  const newDateInput =
    prompt("עדכון תאריך ושעה (YYYY-MM-DDTHH:MM)", toInputValue(task.datetime)) ?? toInputValue(task.datetime);

  let chosenPersonId = task.personId;
  if (state.people.length) {
    const personMap = state.people.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
    const personChoice = prompt(`בחרו אדם למשימה:\n${personMap}`, String(state.people.findIndex((p) => p.id === task.personId) + 1));
    const personIndex = Number(personChoice) - 1;
    if (!Number.isNaN(personIndex) && state.people[personIndex]) {
      chosenPersonId = state.people[personIndex].id;
    }
  }

  const newRecurring = (prompt("חזרה (none/daily/weekly)", task.recurring || "none") ?? task.recurring) || "none";
  let newCategory =
    prompt(
      "סוג אירוע (weekly_club/birthday/school/family/important/ריק)",
      task.category || (task.recurring === "weekly" ? "weekly_club" : "")
    ) || task.category || "";

  if (!newCategory && newRecurring === "weekly") newCategory = "weekly_club";

  const patch = {};
  if (newTitle && newTitle.trim()) patch.title = newTitle.trim();
  if (newDescription !== null) patch.description = (newDescription || "").trim();
  const parsedReminder = Number(newReminder);
  if (!Number.isNaN(parsedReminder) && parsedReminder >= 0) patch.reminderBefore = parsedReminder;
  const parsedDate = new Date(newDateInput);
  if (Number.isFinite(parsedDate.getTime())) patch.datetime = parsedDate.toISOString();
  patch.personId = chosenPersonId;
  if (["none", "daily", "weekly"].includes(newRecurring)) patch.recurring = newRecurring;
  patch.category = (newCategory || "").trim();

  if (Object.keys(patch).length === 0) return;
  try {
    await TasksAPI.update(taskId, patch);
  } catch (error) {
    console.error("Failed to update task", error);
    alert("שגיאה בעדכון משימה");
  }
}

async function deleteTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const confirmed = confirm(`למחוק את המשימה "${task.title}"?`);
  if (!confirmed) return;
  try {
    await TasksAPI.remove(taskId);
  } catch (error) {
    console.error("Failed to delete task", error);
    alert("שגיאה במחיקת משימה");
  }
}

function toInputValue(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function checkReminders() {
  const now = Date.now();
  const patches = new Map();
  state.tasks.forEach((task) => {
    const reminderBeforeMs = Number(task.reminderBefore || 0) * 60_000;
    const taskTime = new Date(task.datetime).getTime();
    const reminderTime = taskTime - reminderBeforeMs;
    if (!Number.isFinite(taskTime) || !Number.isFinite(reminderTime)) return;

    if (shouldNotify(task, now, reminderTime)) {
      notifyTask(task);
      const patch = patches.get(task.id) ?? {};
      patch.lastReminderSent = new Date(now).toISOString();
      patches.set(task.id, patch);
    }

    if (task.recurring && task.recurring !== "none" && now >= taskTime) {
      const nextDate = computeNextOccurrence(new Date(task.datetime), task.recurring, now);
      if (nextDate) {
        const patch = patches.get(task.id) ?? {};
        patch.datetime = nextDate.toISOString();
        patch.lastReminderSent = null;
        patches.set(task.id, patch);
      }
    }
  });

  if (patches.size) {
    applyTaskPatches(patches).catch((error) => console.error("Reminder sync failed", error));
  }
}

function shouldNotify(task, now, reminderTime) {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  if (!Number.isFinite(reminderTime)) return false;
  const alreadySent = task.lastReminderSent ? new Date(task.lastReminderSent).getTime() : null;
  if (alreadySent && Math.abs(alreadySent - reminderTime) <= 60_000) return false;
  return Math.abs(now - reminderTime) <= 60_000;
}

function notifyTask(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const person = findPerson(task.personId);
  const bodyParts = [];
  if (person) bodyParts.push(`ל-${person.name}`);
  bodyParts.push(formatDateTime(task.datetime));
  const tag = task.category ? labelForCategory(task.category) : "";
  try {
    new Notification(`🔔 ${tag ? tag + " • " : ""}${task.title}`, {
      body: bodyParts.join(" | "),
      icon: "icon-192.png"
    });
  } catch (error) {
    console.error("Notification error", error);
  }
}

function computeNextOccurrence(date, recurring, now) {
  const result = new Date(date);
  const increment = recurring === "daily" ? 1 : 7;
  do {
    result.setDate(result.getDate() + increment);
  } while (result.getTime() <= now);
  return result;
}

async function applyTaskPatches(patches) {
  const entries = Array.from(patches.entries());
  await Promise.all(entries.map(([id, patch]) => TasksAPI.update(id, patch)));
}

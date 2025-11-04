import { PeopleAPI, TasksAPI } from "./firebase.js";

let data = { people: [], tasks: [] };
let selectedPersonId = null;
let selectedFilter = "all";

const routeUserId = new URLSearchParams(location.search).get("user");

const peopleListEl = document.getElementById("people-list");
const personFormEl = document.getElementById("person-form");
const personNameInput = document.getElementById("person-name");
const personFilterEl = document.getElementById("person-filter");
const taskFormEl = document.getElementById("task-form");
const taskFormPersonSelect = taskFormEl?.querySelector("select[name='personId']");
const taskListEl = document.getElementById("task-list");
const taskCountEl = document.getElementById("task-count");
const nextUpListEl = document.getElementById("nextup-list");

init();

document.getElementById("enable-push")?.addEventListener("click", async () => {
  if (typeof window.initMessaging === "function") {
    const urlParams = new URLSearchParams(location.search);
    const personId = urlParams.get("user") || null;
    const token = await window.initMessaging(personId);
    if (token) alert("נרשמת לקבלת התראות ")
(token בקונסול)");
  } else {
    alert("initMessaging לא נטענה — בדוק טעינת firebase.js");
  }
});

function init() {
  ensureSwRegistered();
  ensureNotificationPermission();
  setupRealtimeListeners();

  if (routeUserId) {
    setupUserMode(routeUserId);
  } else {
    bindEvents();
    checkReminders();
    setInterval(checkReminders, 60_000);
  }
}

function ensureSwRegistered(){
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((reg)=>{
      if(!reg){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
    });
  }
}

function setupRealtimeListeners() {
  PeopleAPI.onSnapshot((arr) => {
    data.people = arr;
    ensureSelectedDefaults();
    if (routeUserId) {
      renderUserView(routeUserId);
    } else {
      renderPeople();
      renderPersonFilters();
      renderTaskFormPeople();
      renderTasks();
      renderNextUp();
    }
  });

  TasksAPI.onSnapshot((arr) => {
    data.tasks = arr.map((t) => normalizeTask(t));
    if (routeUserId) {
      renderUserView(routeUserId);
    } else {
      renderTasks();
      renderNextUp();
      try {
        document.dispatchEvent(new CustomEvent("brf:data", { detail: { people: data.people, tasks: data.tasks } }));
      } catch {}
    }
  });
}

function normalizeTask(t){
  const o = { ...t };
  if (o.datetime?.toDate) o.datetime = o.datetime.toDate().toISOString();
  if (o.createdAt?.toDate) o.createdAt = o.createdAt.toDate().toISOString();
  if (o.updatedAt?.toDate) o.updatedAt = o.updatedAt.toDate().toISOString();
  if (o.lastReminderSent?.toDate) o.lastReminderSent = o.lastReminderSent.toDate().toISOString();
  // נרמל קטגוריה לטקסט המקוצר
  o.category = (o.category || "").trim();
  return o;
}

function setupUserMode(userId) {
  renderUserView(userId);
  checkRemindersForUser(userId);
  setInterval(() => checkRemindersForUser(userId), 60_000);
}

function bindEvents() {
  if (personFormEl) {
    personFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = personNameInput.value.trim();
      if (!name) return;
      try {
        const newPersonId = await PeopleAPI.add(name);
        selectedPersonId = newPersonId;
        selectedFilter = newPersonId;
        personFormEl.reset();
      } catch (error) {
        console.error("Failed to add person", error);
        alert("שגיאה בהוספת אדם");
      }
    });
  }

  if (personFilterEl) {
    personFilterEl.addEventListener("change", (event) => {
      selectedFilter = event.target.value;
      if (selectedFilter !== "all") selectedPersonId = selectedFilter;
      renderTasks();
      renderNextUp();
    });
  }

  if (taskFormEl) {
    taskFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!data.people.length) {
        alert("יש להוסיף אדם לפני שיוצרים משימה.");
        return;
      }
      const formData = new FormData(taskFormEl);
      const rawDate = formData.get("datetime");
      const parsedDate = new Date(rawDate);
      if (!rawDate || !Number.isFinite(parsedDate.getTime())) {
        alert("יש לבחור תאריך ושעה תקינים.");
        return;
      }
      // קטגוריה
      let category = (formData.get("category") || "").trim();
      const recurring = (formData.get("recurring") || "none").trim();

      if (!category && recurring === "weekly") {
        category = "weekly_club"; // ברירת מחדל לחוג שבועי
      }

      const task = {
        title: (formData.get("title") || "").trim(),
        description: (formData.get("description") || "").trim(),
        personId: formData.get("personId"),
        datetime: parsedDate.toISOString(),
        reminderBefore: Number(formData.get("reminderBefore") || 0),
        recurring,
        category, // << חדש
      };
      try {
        await TasksAPI.add(task);
        taskFormEl.reset();
        const defaultPerson = selectedPersonId ?? data.people[0]?.id;
        if (defaultPerson && taskFormPersonSelect) taskFormPersonSelect.value = defaultPerson;
      } catch (error) {
        console.error("Failed to add task", error);
        alert("שגיאה בהוספת משימה");
      }
    });
  }
}

function ensureSelectedDefaults() {
  if (!data.people.length) { selectedPersonId = null; selectedFilter = "all"; return; }
  if (!selectedPersonId || !data.people.some((p) => p.id === selectedPersonId)) {
    selectedPersonId = data.people[0].id;
  }
  if (selectedFilter !== "all" && !data.people.some((p) => p.id === selectedFilter)) {
    selectedFilter = selectedPersonId;
  }
}

function renderPeople() {
  if (!peopleListEl) return;
  peopleListEl.innerHTML = "";
  if (!data.people.length) {
    const empty = document.createElement("li");
    empty.textContent = "אין עדיין אנשים ברשימה";
    empty.classList.add("empty");
    peopleListEl.append(empty);
    return;
  }
  data.people.forEach((person) => {
    const li = document.createElement("li");
    if (person.id === selectedPersonId) li.classList.add("active");

    const nameSpan = document.createElement("span");
    nameSpan.textContent = person.name;
    nameSpan.className = "name";
    nameSpan.tabIndex = 0;
    nameSpan.addEventListener("click", () => selectPerson(person.id));
    nameSpan.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); selectPerson(person.id); }
    });

    const actions = document.createElement("div");
    actions.className = "actions";

    const childHref = `/child.html?user=${encodeURIComponent(person.id)}`;
    const childLink = document.createElement("a");
    childLink.className = "ghost ghost-link";
    childLink.href = childHref; childLink.target = "_blank"; childLink.rel = "noopener";
    childLink.textContent = "קישור ילד";

    const copyBtn = document.createElement("button");
    copyBtn.className = "ghost"; copyBtn.type = "button"; copyBtn.textContent = "📋";
    copyBtn.title = "העתק קישור ילד";
    copyBtn.addEventListener("click", () => copyChildLink(person.id));

    const editBtn = document.createElement("button");
    editBtn.className = "ghost"; editBtn.type = "button"; editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => editPerson(person.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost"; deleteBtn.type = "button"; deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => deletePerson(person.id));

    actions.append(childLink, copyBtn, editBtn, deleteBtn);
    li.append(nameSpan, actions);
    peopleListEl.append(li);
  });
}

function renderPersonFilters() {
  if (!personFilterEl) return;
  personFilterEl.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all"; allOption.textContent = "כל המשימות";
  personFilterEl.append(allOption);
  data.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id; option.textContent = person.name;
    personFilterEl.append(option);
  });
  personFilterEl.value = selectedFilter;
}

function renderTaskFormPeople() {
  if (!taskFormPersonSelect) return;
  taskFormPersonSelect.innerHTML = "";
  if (!data.people.length) {
    const option = document.createElement("option");
    option.value = ""; option.textContent = "יש להוסיף אדם";
    taskFormPersonSelect.append(option);
    taskFormPersonSelect.disabled = true;
    return;
  }
  taskFormPersonSelect.disabled = false;
  data.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id; option.textContent = person.name;
    taskFormPersonSelect.append(option);
  });
  const desired = selectedPersonId ?? data.people[0].id;
  taskFormPersonSelect.value = desired;
}

function renderTasks() {
  if (!taskListEl || !taskCountEl) return;
  taskListEl.innerHTML = "";
  const tasks = getFilteredTasks();
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
      editBtn.className = "ghost"; editBtn.type = "button"; editBtn.textContent = "✏️";
      editBtn.addEventListener("click", () => editTask(task.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "ghost"; deleteBtn.type = "button"; deleteBtn.textContent = "🗑️";
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

      // badge קטגוריה (אם קיים)
      const catLabel = document.createElement("span");
      if (task.category) {
        catLabel.className = "badge";
        catLabel.textContent = labelForCategory(task.category);
      }

      if (task.recurring && task.recurring !== "none") {
        const recurringLabel = document.createElement("span");
        recurringLabel.textContent = task.recurring === "daily" ? "🔁 יומי" : "🔁 שבועי";
        meta.append(personLabel, timeLabel, reminderLabel, recurringLabel, catLabel);
      } else {
        meta.append(personLabel, timeLabel, reminderLabel, catLabel);
      }

      li.append(header, description, meta);
      taskListEl.append(li);
    });
}

function renderUserView(userId) {
  const person = findPerson(userId);
  const title = person ? `📝 המשימות של ${person.name}` : "📝 המשימות שלי";
  const titleEl = document.getElementById("user-title");
  if (titleEl) titleEl.textContent = title;

  const tasks = (data.tasks || [])
    .filter((t) => t.personId === userId)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const list = document.getElementById("user-task-list");
  const count = document.getElementById("user-task-count");
  if (count) count.textContent = tasks.length;
  if (list) {
    list.innerHTML = "";
    if (!tasks.length) {
      const li = document.createElement("li");
      li.textContent = "אין משימות להצגה";
      li.className = "empty";
      list.append(li);
    } else {
      tasks.forEach((t) => {
        const li = document.createElement("li");
        const header = document.createElement("div");
        header.className = "task-header";
        const strong = document.createElement("strong");
        strong.textContent = t.title || "ללא כותרת";
        header.append(strong);

        const desc = document.createElement("p");
        desc.textContent = t.description || "—";

        const meta = document.createElement("div");
        meta.className = "task-meta";
        const time = document.createElement("span");
        time.textContent = `🕒 ${formatDateTime(t.datetime)}`;
        const reminder = document.createElement("span");
        reminder.textContent = `⏰ ${t.reminderBefore || 0} דק' לפני`;

        if (t.category) {
          const cat = document.createElement("span");
          cat.className = "badge";
          cat.textContent = labelForCategory(t.category);
          meta.append(time, reminder, cat);
        } else {
          meta.append(time, reminder);
        }
        if (t.recurring && t.recurring !== "none") {
          const rec = document.createElement("span");
          rec.textContent = t.recurring === "daily" ? "🔁 יומי" : "🔁 שבועי";
          meta.append(rec);
        }

        li.append(header, desc, meta);
        list.append(li);
      });
    }
  }
}

function renderNextUp(limit = 5){
  if(!nextUpListEl) return;
  const now = Date.now();
  const tasks = getFilteredTasks()
    .filter(t => Number.isFinite(new Date(t.datetime).getTime()))
    .filter(t => new Date(t.datetime).getTime() >= now - 15*60_000)
    .sort((a,b) => new Date(a.datetime) - new Date(b.datetime))
    .slice(0, limit);

  nextUpListEl.innerHTML = "";
  if(!tasks.length){
    const empty = document.createElement("div");
    empty.className = "nextup-item";
    empty.textContent = "אין אירועים קרובים";
    nextUpListEl.append(empty);
    return;
  }
  tasks.forEach(t=>{
    const kid = findPerson(t.personId);
    const chip = document.createElement("div");
    chip.className = "nextup-item";
    if (t.category) chip.dataset.cat = t.category; // צבע לפי קטגוריה

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = toTime(t.datetime);
    const kidEl = document.createElement("span");
    kidEl.className = "kid";
    kidEl.textContent = kid ? kid.name : "—";
    const title = document.createElement("span");
    title.className = "title";
    title.textContent = t.title || "";
    chip.append(time, document.createTextNode(" • "), kidEl, document.createTextNode(" — "), title);
    nextUpListEl.append(chip);
  });
}

function getFilteredTasks() {
  if (selectedFilter === "all") return data.tasks;
  return data.tasks.filter((task) => task.personId === selectedFilter);
}

function selectPerson(personId) {
  selectedPersonId = personId;
  selectedFilter = personId;
  renderPeople();
  renderPersonFilters();
  renderTaskFormPeople();
  renderTasks();
  renderNextUp();
}

async function editPerson(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const newName = prompt("עדכון שם", person.name);
  if (!newName || !newName.trim()) return;
  try { await PeopleAPI.rename(personId, newName.trim()); }
  catch (error) { console.error("Failed to rename person", error); alert("שגיאה בעדכון שם"); }
}

async function deletePerson(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const confirmed = confirm(`למחוק את ${person.name} וכל המשימות המשויכות?`);
  if (!confirmed) return;
  const relatedTasks = data.tasks.filter((task) => task.personId === personId);
  try {
    await Promise.all([ PeopleAPI.remove(personId), ...relatedTasks.map((task) => TasksAPI.remove(task.id)) ]);
    if (selectedPersonId === personId) selectedPersonId = null;
    if (selectedFilter === personId) selectedFilter = "all";
  } catch (error) {
    console.error("Failed to delete person", error);
    alert("שגיאה במחיקת אדם");
  }
}

async function editTask(taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return;

  const newTitle = prompt("עדכון כותרת", task.title);
  const newDescription = prompt("עדכון תיאור", task.description);
  const newReminder = prompt("תזכורת (בדקות לפני)", String(task.reminderBefore ?? 0));
  const newDateInput =
    prompt("עדכון תאריך ושעה (YYYY-MM-DDTHH:MM)", toInputValue(task.datetime)) ?? toInputValue(task.datetime);

  let chosenPersonId = task.personId;
  if (data.people.length) {
    const personMap = data.people.map((p, i) => `${i + 1}. ${p.name}`).join("
");
    const personChoice = prompt(`בחרו אדם למשימה:
${personMap}`, String(data.people.findIndex((p) => p.id === task.personId) + 1));
    const personIndex = Number(personChoice) - 1;
    if (!Number.isNaN(personIndex) && data.people[personIndex]) chosenPersonId = data.people[personIndex].id;
  }

  const newRecurring = (prompt("חזרה (none/daily/weekly)", task.recurring || "none") ?? task.recurring) || "none";
  let newCategory = prompt(
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
  if (["none","daily","weekly"].includes(newRecurring)) patch.recurring = newRecurring;
  patch.category = (newCategory || "").trim();

  if (Object.keys(patch).length === 0) return;
  try { await TasksAPI.update(taskId, patch); }
  catch (error) { console.error("Failed to update task", error); alert("שגיאה בעדכון משימה"); }
}

async function deleteTask(taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const confirmed = confirm(`למחוק את המשימה "${task.title}"?`);
  if (!confirmed) return;
  try { await TasksAPI.remove(taskId); }
  catch (error) { console.error("Failed to delete task", error); alert("שגיאה במחיקת משימה"); }
}

function checkReminders() {
  const now = Date.now();
  const patches = new Map();
  data.tasks.forEach((task) => {
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
  if (patches.size) applyTaskPatches(patches).catch((e)=>console.error("Reminder sync failed", e));
}

function checkRemindersForUser(userId) {
  const now = Date.now();
  const patches = new Map();
  (data.tasks || []).forEach((task) => {
    if (task.personId !== userId) return;
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
  if (patches.size) applyTaskPatches(patches).catch((e)=>console.error("Reminder sync failed", e));
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
      icon: "icons/icon-192.png",
    });
  } catch (error) { console.error("Notification error", error); }
}

function computeNextOccurrence(date, recurring, now) {
  const result = new Date(date);
  const increment = recurring === "daily" ? 1 : 7;
  do { result.setDate(result.getDate() + increment); }
  while (result.getTime() <= now);
  return result;
}

function copyChildLink(personId) {
  const url = `${location.origin}/child.html?user=${encodeURIComponent(personId)}`;
  const write = navigator.clipboard?.writeText;
  if (write) {
    write.call(navigator.clipboard, url).then(
      () => showToast("קישור ילד הועתק"),
      () => { prompt("העתק קישור ילד:", url); }
    );
  } else { prompt("העתק קישור ילד:", url); }
}

function ensureNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function findPerson(id) { return data.people.find((p) => p.id === id); }
function toInputValue(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}
function formatDateTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", hour12: false }).format(date);
}
function toTime(dateString){
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("he-IL", { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
}
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 300); }, 2200);
}
async function applyTaskPatches(patches) {
  const entries = Array.from(patches.entries());
  await Promise.all(entries.map(([id, patch]) => TasksAPI.update(id, patch)));
}

/* helpers */
function labelForCategory(cat){
  switch((cat || "").trim()){
    case "weekly_club": return "חוג שבועי";
    case "birthday":    return "יום הולדת";
    case "school":      return "פעילות בית ספר";
    case "family":      return "פעילות משפחה";
    case "important":   return "אירוע חשוב";
    default: return "";
  }
}

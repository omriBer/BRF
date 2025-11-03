const STORAGE_KEY = "brfData";
const DEFAULT_DATA = { people: [], tasks: [] };
const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
let data = loadData();
let selectedPersonId = data.people[0]?.id ?? null;
let selectedFilter = selectedPersonId ?? "all";

const qs = new URLSearchParams(location.search);
const routeUserId = qs.get("user"); // אם יש, מצב משתמש

const generateId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const peopleListEl = document.getElementById("people-list");
const personFormEl = document.getElementById("person-form");
const personNameInput = document.getElementById("person-name");
const addPersonBtn = document.getElementById("add-person-btn");
const personFilterEl = document.getElementById("person-filter");
const taskFormEl = document.getElementById("task-form");
const taskFormPersonSelect = taskFormEl.querySelector("select[name='personId']");
const taskListEl = document.getElementById("task-list");
const taskCountEl = document.getElementById("task-count");
const saveAllBtn = document.getElementById("save-all");
const checkNowBtn = document.getElementById("check-now");
const logoutBtn = document.getElementById("logout");

init();

function init() {
  if (routeUserId) {
    // מצב משתמש (קריאה בלבד)
    document.querySelector(".app-shell").hidden = true; // מסך ניהול מוסתר
    document.querySelector(".toolbar").hidden = true; // כלי ניהול מוסתרים
    document.getElementById("user-screen").hidden = false; // מסך משתמש מוצג
    renderUserView(routeUserId);
    // הרשאות התראות + טיימר מקומי
    ensureNotificationPermission();
    setInterval(() => renderUserView(routeUserId), 60_000);
    // רענון ידני
    document.getElementById("user-refresh").addEventListener("click", () => renderUserView(routeUserId, true));
    return; // אל תריץ bindEvents/renderAll למצב ניהול
  }

  ensureNotificationPermission();
  renderAll();
  bindEvents();
  checkReminders();
  setInterval(checkReminders, 60_000);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("SW registration failed", err));
  }
}

function bindEvents() {
  addPersonBtn.addEventListener("click", () => {
    personNameInput.focus();
  });

  personFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = personNameInput.value.trim();
    if (!name) return;
    const newPerson = { id: generateId(), name };
    data.people.push(newPerson);
    selectedPersonId = newPerson.id;
    selectedFilter = newPerson.id;
    personFormEl.reset();
    persistAndRender();
  });

  personFilterEl.addEventListener("change", (event) => {
    selectedFilter = event.target.value;
    if (selectedFilter !== "all") {
      selectedPersonId = selectedFilter;
    }
    renderTasks();
  });

  taskFormEl.addEventListener("submit", (event) => {
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
    const task = {
      id: generateId(),
      title: formData.get("title").trim(),
      description: (formData.get("description") || "").trim(),
      personId: formData.get("personId"),
      datetime: parsedDate.toISOString(),
      reminderBefore: Number(formData.get("reminderBefore") || 0),
      recurring: formData.get("recurring") || "none",
      lastReminderSent: null,
    };
    data.tasks.push(task);
    taskFormEl.reset();
    const defaultPerson = selectedPersonId ?? data.people[0]?.id;
    if (defaultPerson) {
      taskFormPersonSelect.value = defaultPerson;
    }
    persistAndRender();
  });

  saveAllBtn.addEventListener("click", () => {
    saveData();
    showToast("הנתונים נשמרו בהצלחה.");
  });

  checkNowBtn.addEventListener("click", () => {
    checkReminders();
    showToast("התזכורות נבדקו.");
  });

  logoutBtn.addEventListener("click", () => {
    const confirmReset = confirm("האם למחוק את כל הנתונים המקומיים ולבצע אתחול?");
    if (confirmReset) {
      localStorage.removeItem(STORAGE_KEY);
      data = clone(DEFAULT_DATA);
      selectedPersonId = null;
      selectedFilter = "all";
      renderAll();
    }
  });
}

function renderAll() {
  ensureSelectedDefaults();
  renderPeople();
  renderPersonFilters();
  renderTaskFormPeople();
  renderTasks();
}

function ensureSelectedDefaults() {
  if (!data.people.length) {
    selectedPersonId = null;
    selectedFilter = "all";
    return;
  }
  if (!selectedPersonId || !data.people.some((p) => p.id === selectedPersonId)) {
    selectedPersonId = data.people[0].id;
  }
  if (selectedFilter !== "all" && !data.people.some((p) => p.id === selectedFilter)) {
    selectedFilter = selectedPersonId;
  }
}

function renderPeople() {
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
    if (person.id === selectedPersonId) {
      li.classList.add("active");
    }
    const nameSpan = document.createElement("span");
    nameSpan.textContent = person.name;
    nameSpan.className = "name";
    nameSpan.tabIndex = 0;
    nameSpan.addEventListener("click", () => selectPerson(person.id));
    nameSpan.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectPerson(person.id);
      }
    });

    const actions = document.createElement("div");
    actions.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.className = "ghost";
    editBtn.type = "button";
    editBtn.textContent = "✏️";
    editBtn.addEventListener("click", () => editPerson(person.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost";
    deleteBtn.type = "button";
    deleteBtn.textContent = "🗑️";
    deleteBtn.addEventListener("click", () => deletePerson(person.id));

    const linkBtn = document.createElement("button");
    linkBtn.className = "ghost";
    linkBtn.type = "button";
    linkBtn.textContent = "🔗";
    linkBtn.title = "קישור למסך המשתמש";
    linkBtn.addEventListener("click", () => copyInstallLink(person.id));

    actions.append(editBtn, deleteBtn, linkBtn);
    li.append(nameSpan, actions);
    peopleListEl.append(li);
  });
}

function renderPersonFilters() {
  personFilterEl.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "כל המשימות";
  personFilterEl.append(allOption);
  data.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    personFilterEl.append(option);
  });
  personFilterEl.value = selectedFilter;
}

function renderTaskFormPeople() {
  taskFormPersonSelect.innerHTML = "";
  if (!data.people.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "יש להוסיף אדם";
    taskFormPersonSelect.append(option);
    taskFormPersonSelect.disabled = true;
    return;
  }
  taskFormPersonSelect.disabled = false;
  data.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    taskFormPersonSelect.append(option);
  });
  const desired = selectedPersonId ?? data.people[0].id;
  taskFormPersonSelect.value = desired;
}

function renderTasks() {
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
      reminderLabel.textContent = `⏰ תזכורת ${task.reminderBefore || 0} דק' לפני`;
      if (task.recurring && task.recurring !== "none") {
        const recurringLabel = document.createElement("span");
        recurringLabel.textContent = task.recurring === "daily" ? "🔁 יומי" : "🔁 שבועי";
        meta.append(personLabel, timeLabel, reminderLabel, recurringLabel);
      } else {
        meta.append(personLabel, timeLabel, reminderLabel);
      }

      li.append(header, description, meta);
      taskListEl.append(li);
    });
}

function renderUserView(userId, manual = false) {
  const person = findPerson(userId);
  const title = person ? `📝 המשימות של ${person.name}` : "📝 המשימות שלי";
  document.getElementById("user-title").textContent = title;

  // רק המשימות של המשתמש, מסודרות מהקרוב לרחוק
  const tasks = (data.tasks || [])
    .filter((t) => t.personId === userId)
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  const list = document.getElementById("user-task-list");
  list.innerHTML = "";
  document.getElementById("user-task-count").textContent = tasks.length;

  if (!tasks.length) {
    const li = document.createElement("li");
    li.textContent = "אין משימות להצגה";
    li.className = "empty";
    list.append(li);
    return;
  }

  tasks.forEach((t) => {
    const li = document.createElement("li");

    const header = document.createElement("div");
    header.className = "task-header";
    const titleEl = document.createElement("strong");
    titleEl.textContent = t.title || "ללא כותרת";
    header.append(titleEl);

    const desc = document.createElement("p");
    desc.textContent = t.description || "—";

    const meta = document.createElement("div");
    meta.className = "task-meta";
    const time = document.createElement("span");
    time.textContent = `🕒 ${formatDateTime(t.datetime)}`;
    const reminder = document.createElement("span");
    reminder.textContent = `⏰ ${t.reminderBefore || 0} דק' לפני`;
    if (t.recurring && t.recurring !== "none") {
      const rec = document.createElement("span");
      rec.textContent = t.recurring === "daily" ? "🔁 יומי" : "🔁 שבועי";
      meta.append(time, reminder, rec);
    } else {
      meta.append(time, reminder);
    }

    li.append(header, desc, meta);
    list.append(li);
  });

  if (manual) showToast("עודכן");
}

function getFilteredTasks() {
  if (selectedFilter === "all") {
    return data.tasks;
  }
  return data.tasks.filter((task) => task.personId === selectedFilter);
}

function selectPerson(personId) {
  selectedPersonId = personId;
  selectedFilter = personId;
  renderAll();
}

function editPerson(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const newName = prompt("עדכון שם", person.name);
  if (newName && newName.trim()) {
    person.name = newName.trim();
    persistAndRender();
  }
}

function deletePerson(personId) {
  const person = findPerson(personId);
  if (!person) return;
  const confirmed = confirm(`למחוק את ${person.name} וכל המשימות המשויכות?`);
  if (!confirmed) return;
  data.people = data.people.filter((p) => p.id !== personId);
  data.tasks = data.tasks.filter((task) => task.personId !== personId);
  if (selectedPersonId === personId) {
    selectedPersonId = data.people[0]?.id ?? null;
  }
  if (selectedFilter === personId) {
    selectedFilter = selectedPersonId ?? "all";
  }
  persistAndRender();
}

function editTask(taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const newTitle = prompt("עדכון כותרת", task.title) ?? task.title;
  const newDescription = prompt("עדכון תיאור", task.description) ?? task.description;
  const newReminder = prompt("תזכורת (בדקות לפני)", String(task.reminderBefore ?? 0));
  const newDateInput = prompt("עדכון תאריך ושעה (YYYY-MM-DDTHH:MM)", toInputValue(task.datetime)) ?? toInputValue(task.datetime);
  let chosenPersonId = task.personId;
  if (data.people.length) {
    const personMap = data.people.map((person, index) => `${index + 1}. ${person.name}`).join('\n');
    const personChoice = prompt(`בחרו אדם למשימה:\n${personMap}`, String(data.people.findIndex((p) => p.id === task.personId) + 1));
    const personIndex = Number(personChoice) - 1;
    if (!Number.isNaN(personIndex) && data.people[personIndex]) {
      chosenPersonId = data.people[personIndex].id;
    }
  }
  
const newRecurring =  (prompt("חזרה (none/daily/weekly)", task.recurring || "none") ?? task.recurring) || "none";





  
  if (newTitle.trim()) task.title = newTitle.trim();
  task.description = newDescription.trim();
  const parsedReminder = Number(newReminder);
  if (!Number.isNaN(parsedReminder) && parsedReminder >= 0) {
    task.reminderBefore = parsedReminder;
  }
  const parsedDate = new Date(newDateInput);
  if (Number.isFinite(parsedDate.getTime())) {
    task.datetime = parsedDate.toISOString();
  }
  task.personId = chosenPersonId;
  if (["none", "daily", "weekly"].includes(newRecurring)) {
    task.recurring = newRecurring;
  }
  persistAndRender();
}

function deleteTask(taskId) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const confirmed = confirm(`למחוק את המשימה "${task.title}"?`);
  if (!confirmed) return;
  data.tasks = data.tasks.filter((t) => t.id !== taskId);
  persistAndRender();
}

function checkReminders() {
  const now = Date.now();
  let dirty = false;
  data.tasks.forEach((task) => {
    const reminderBeforeMs = Number(task.reminderBefore || 0) * 60_000;
    const taskTime = new Date(task.datetime).getTime();
    const reminderTime = taskTime - reminderBeforeMs;
    if (!Number.isFinite(taskTime) || !Number.isFinite(reminderTime)) {
      return;
    }
    if (shouldNotify(task, now, reminderTime)) {
      notifyTask(task);
      task.lastReminderSent = new Date(now).toISOString();
      dirty = true;
    }

    if (task.recurring && task.recurring !== "none" && now >= taskTime) {
      const nextDate = computeNextOccurrence(new Date(task.datetime), task.recurring, now);
      if (nextDate) {
        task.datetime = nextDate.toISOString();
        task.lastReminderSent = null;
        dirty = true;
      }
    }
  });
  if (dirty) {
    saveData();
    renderTasks();
  }
}

function shouldNotify(task, now, reminderTime) {
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  if (!Number.isFinite(reminderTime)) return false;
  const alreadySent = task.lastReminderSent ? new Date(task.lastReminderSent).getTime() : null;
  if (alreadySent && Math.abs(alreadySent - reminderTime) <= 60_000) {
    return false;
  }
  return Math.abs(now - reminderTime) <= 60_000;
}

function notifyTask(task) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const person = findPerson(task.personId);
  const bodyParts = [];
  if (person) {
    bodyParts.push(`ל-${person.name}`);
  }
  bodyParts.push(formatDateTime(task.datetime));
  try {
    new Notification(`🔔 תזכורת: ${task.title}`, {
      body: bodyParts.join(" | "),
      icon: "icons/icon-192.png",
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

function copyInstallLink(personId) {
  // קישור קבוע: אותו index, עם פרמטר ?user=<id>
  const url = `${location.origin}${location.pathname}?user=${encodeURIComponent(personId)}`;
  navigator.clipboard?.writeText(url).then(
    () => showToast("קישור הועתק"),
    () => {
      prompt("העתק קישור התקנה:", url);
    }
  );
}

function ensureNotificationPermission() {
  if ("Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
}

function findPerson(id) {
  return data.people.find((p) => p.id === id);
}

function toInputValue(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) return '';
  const iso = date.toISOString();
  return iso.slice(0, 16);
}

function formatDateTime(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  }).format(date);
}

function persistAndRender() {
  saveData();
  renderAll();
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return clone(DEFAULT_DATA);
  try {
    const parsed = JSON.parse(raw);
    return {
      people: Array.isArray(parsed.people) ? parsed.people : [],
      tasks: Array.isArray(parsed.tasks)
        ? parsed.tasks.map((task) => ({ ...task, lastReminderSent: task.lastReminderSent ?? null }))
        : [],
    };
  } catch (error) {
    console.warn("שמירת נתונים פגומה, מאתחל נתונים", error);
    return clone(DEFAULT_DATA);
  }
}

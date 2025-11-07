import { PeopleAPI, TasksAPI } from "./firebase.js";

const state = {
  people: [],
  tasks: []
};

let selectedPersonId = null;

const peopleListEl = document.getElementById("people-list");
const personFormEl = document.getElementById("person-form");
const personNameInput = document.getElementById("person-name");
const taskFormEl = document.getElementById("task-form");
const taskFormPersonSelect = taskFormEl?.querySelector("select[name='personId']");

init();

function init() {
  ensureSwRegistered();
  bindEvents();
  setupRealtimeListeners();
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

function bindEvents() {
  if (personFormEl) {
    personFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = personNameInput.value.trim();
      if (!name) return;
      try {
        const newPersonId = await PeopleAPI.add(name);
        selectedPersonId = newPersonId;
        personFormEl.reset();
      } catch (error) {
        console.error("Failed to add person", error);
        alert("שגיאה בהוספת אדם");
      }
    });
  }

  if (taskFormEl) {
    taskFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.people.length) {
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

      let category = (formData.get("category") || "").trim();
      const recurring = (formData.get("recurring") || "none").trim();
      if (!category && recurring === "weekly") {
        category = "weekly_club";
      }

      const task = {
        title: (formData.get("title") || "").trim(),
        description: (formData.get("description") || "").trim(),
        personId: formData.get("personId"),
        datetime: parsedDate.toISOString(),
        reminderBefore: Number(formData.get("reminderBefore") || 0),
        recurring,
        category
      };

      try {
        await TasksAPI.add(task);
        taskFormEl.reset();
        const defaultPerson = selectedPersonId ?? state.people[0]?.id;
        if (defaultPerson && taskFormPersonSelect) taskFormPersonSelect.value = defaultPerson;
      } catch (error) {
        console.error("Failed to add task", error);
        alert("שגיאה בהוספת משימה");
      }
    });
  }
}

function setupRealtimeListeners() {
  PeopleAPI.onSnapshot((arr) => {
    state.people = arr;
    ensureSelectedPerson();
    renderPeople();
    renderTaskFormPeople();
  });

  TasksAPI.onSnapshot((arr) => {
    state.tasks = arr.map(normalizeTask);
  });
}

function ensureSelectedPerson() {
  if (!state.people.length) {
    selectedPersonId = null;
    return;
  }
  if (!selectedPersonId || !state.people.some((p) => p.id === selectedPersonId)) {
    selectedPersonId = state.people[0].id;
  }
}

function renderPeople() {
  if (!peopleListEl) return;
  peopleListEl.innerHTML = "";

  if (!state.people.length) {
    const empty = document.createElement("li");
    empty.textContent = "אין עדיין אנשים ברשימה";
    empty.classList.add("empty");
    peopleListEl.append(empty);
    return;
  }

  state.people.forEach((person) => {
    const li = document.createElement("li");
    li.classList.add("person-card");
    if (person.id === selectedPersonId) li.classList.add("active");

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

    const childLink = document.createElement("a");
    childLink.className = "ghost ghost-link";
    childLink.href = `./child.html?user=${encodeURIComponent(person.id)}`;
    childLink.target = "_blank";
    childLink.rel = "noopener";
    childLink.textContent = "קישור ילד";

    const editBtn = document.createElement("button");
    editBtn.className = "ghost";
    editBtn.type = "button";
    editBtn.textContent = "ערוך";
    editBtn.addEventListener("click", () => editPerson(person.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost danger-outline";
    deleteBtn.type = "button";
    deleteBtn.textContent = "הסר";
    deleteBtn.addEventListener("click", () => deletePerson(person.id));

    actions.append(childLink, editBtn, deleteBtn);
    li.append(nameSpan, actions);
    peopleListEl.append(li);
  });
}

function renderTaskFormPeople() {
  if (!taskFormPersonSelect) return;
  taskFormPersonSelect.innerHTML = "";

  if (!state.people.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "יש להוסיף אדם";
    taskFormPersonSelect.append(option);
    taskFormPersonSelect.disabled = true;
    return;
  }

  taskFormPersonSelect.disabled = false;
  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.name;
    taskFormPersonSelect.append(option);
  });

  const desired = selectedPersonId ?? state.people[0].id;
  taskFormPersonSelect.value = desired;
}

function selectPerson(personId) {
  selectedPersonId = personId;
  renderPeople();
  renderTaskFormPeople();
}

async function editPerson(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;
  const newName = prompt("עדכון שם", person.name);
  if (!newName || !newName.trim()) return;
  try {
    await PeopleAPI.rename(personId, newName.trim());
  } catch (error) {
    console.error("Failed to rename person", error);
    alert("שגיאה בעדכון שם");
  }
}

async function deletePerson(personId) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return;
  const confirmed = confirm(`למחוק את ${person.name} וכל המשימות המשויכות?`);
  if (!confirmed) return;
  const relatedTasks = state.tasks.filter((task) => task.personId === personId);
  try {
    await Promise.all([
      PeopleAPI.remove(personId),
      ...relatedTasks.map((task) => TasksAPI.remove(task.id))
    ]);
    if (selectedPersonId === personId) {
      selectedPersonId = state.people.find((p) => p.id !== personId)?.id || null;
    }
  } catch (error) {
    console.error("Failed to delete person", error);
    alert("שגיאה במחיקת אדם");
  }
}

function normalizeTask(task) {
  const normalized = { ...task };
  if (normalized.datetime?.toDate) normalized.datetime = normalized.datetime.toDate().toISOString();
  return normalized;
}

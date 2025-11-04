import { PeopleAPI, TasksAPI } from "./firebase.js";

let people = [];
let tasks = [];

const windows = [
  { key: "morning",  label: "בוקר (06:00–12:00)",   start: 6,  end: 12 },
  { key: "noon",     label: "צהריים (12:00–16:00)", start: 12, end: 16 },
  { key: "afternoon",label: "אחהצ (16:00–19:00)",  start: 16, end: 19 },
  { key: "evening",  label: "ערב (19:00–23:00)",    start: 19, end: 23 },
];

export function initWeek(){
  PeopleAPI.onSnapshot((arr)=>{ people = arr; draw(); });
  TasksAPI.onSnapshot((arr)=>{
    tasks = arr.map((t)=>{
      const o = { ...t };
      if (o.datetime?.toDate) o.datetime = o.datetime.toDate().toISOString();
      o.category = (o.category || "").trim();
      return o;
    });
    draw();
  });
  document.addEventListener("brf:data", (ev)=>{
    if (ev?.detail) {
      people = ev.detail.people || people;
      tasks  = (ev.detail.tasks || []).map(t => ({...t, category: (t.category||"").trim()}));
      draw();
    }
  }, { passive: true });
  draw();
}

function startOfWeek(d){
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day; // Sunday as start
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() - diff);
  return dt;
}
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function inWindow(date, w){ const h = date.getHours() + date.getMinutes()/60; return h >= w.start && h < w.end; }
function toHM(d){ return new Intl.DateTimeFormat("he-IL",{hour:'2-digit',minute:'2-digit',hour12:false}).format(d); }

function draw(){
  const daysEl = document.querySelector("#week-screen .days");
  const rowsEl = document.querySelector("#week-screen .rows");
  if(!daysEl || !rowsEl) return;

  daysEl.innerHTML = "";
  const headLabel = document.createElement("div");
  headLabel.className = "cell-day";
  headLabel.textContent = "חלונות זמן";
  daysEl.append(headLabel);

  const today = new Date();
  const weekStart = startOfWeek(today);
  const days = Array.from({length:7}, (_,i)=> addDays(weekStart, i));

  const weekdayFmt = new Intl.DateTimeFormat("he-IL", { weekday: 'short', day: '2-digit', month: '2-digit' });
  days.forEach((d)=>{
    const c = document.createElement("div");
    c.className = "cell-day";
    c.textContent = weekdayFmt.format(d);
    daysEl.append(c);
  });

  rowsEl.innerHTML = "";
  windows.forEach((w)=>{
    const label = document.createElement("div");
    label.className = "row-label";
    label.textContent = w.label;
    rowsEl.append(label);

    days.forEach((d)=>{
      const slot = document.createElement("div");
      slot.className = "slot";
      rowsEl.append(slot);

      const items = tasks
        .filter(t => t?.datetime)
        .map(t => ({...t, dateObj: new Date(t.datetime)}))
        .filter(t => sameDay(t.dateObj, d) && inWindow(t.dateObj, w))
        .sort((a,b)=> a.dateObj - b.dateObj);

      items.forEach((t)=>{
        const kid = people.find(p => p.id === t.personId);
        const chip = document.createElement("div");
        chip.className = "chip pin";

        // קבע קטגוריה (weekly_club אוטומטי אם recurring=weekly ואין category)
        const cat = (t.category || (t.recurring === "weekly" ? "weekly_club" : "")).trim();
        if (cat) chip.dataset.cat = cat; // מאפשר צביעה דרך CSS

        // קו צבעוני לפי ילד (כמו קודם) – נשמר כ-decoration משני
        chip.style.color = personColor(kid?.id || "");

        const time = document.createElement("span");
        time.className = "time";
        time.textContent = toHM(t.dateObj);

        const kidEl = document.createElement("span");
        kidEl.className = "kid";
        kidEl.textContent = kid ? kid.name : "—";

        const title = document.createElement("span");
        title.className = "title";
        title.textContent = t.title || "";

        chip.append(time, kidEl, title);

        // badge קטגוריה לטקסט
        if (cat) {
          const b = document.createElement("span");
          b.className = "badge";
          b.textContent = labelForCategory(cat);
          chip.append(b);
        }

        // “קרוב/עבר” (אופציונלי)
        const now = Date.now();
        const delta = t.dateObj.getTime() - now;
        if (Math.abs(delta) < 60*60*1000) {
          const b2 = document.createElement("span");
          b2.className = delta >= 0 ? "badge badge-soon" : "badge badge-late";
          b2.textContent = delta >= 0 ? "קרוב" : "עבר לפני רגע";
          chip.append(b2);
        }
        slot.append(chip);
      });
    });
  });
}

function labelForCategory(cat){
  switch((cat||"").trim()){
    case "weekly_club": return "חוג שבועי";
    case "birthday":    return "יום הולדת";
    case "school":      return "פעילות בית ספר";
    case "family":      return "פעילות משפחה";
    case "important":   return "אירוע חשוב";
    default: return "";
  }
}

// Deterministic color per person id (secondary accent)
function personColor(key){
  let h = 0;
  for (let i=0;i<key.length;i++){ h = (h*31 + key.charCodeAt(i)) & 0xffffffff; }
  h = Math.abs(h) % 360;
  return `hsl(${h} 60% 35%)`;
}

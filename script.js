// Fitness Tracker Pro — script.js
// Data model: activityData keyed by yyyy-mm-dd:
// { "2025-10-26": { entries: [ {id, activity, steps, duration, distance_km, calories, heartRate, notes} ], aggregates: {...} }, ...}

const STORAGE_KEY = "ftpro_activityData_v1";
const PROFILE_KEY = "ftpro_profile_v1";
const GOAL_KEY = "ftpro_goals_v1";

let activityData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
let profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
let goals = JSON.parse(localStorage.getItem(GOAL_KEY) || "{\"steps\":10000,\"calories\":500,\"duration\":30}");
let stackedChart, trendChart;
let currentCalendarDate = new Date();

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initForm();
  initOverview();
  renderCalendar();
  bindSettings();
  refreshAll();
});

// ---------- Navigation ----------
function initNav(){
  document.querySelectorAll(".nav-btn").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      const sec = btn.getAttribute("data-section");
      document.querySelectorAll(".section").forEach(s=>s.classList.remove("active"));
      document.getElementById(sec).classList.add("active");
      if(sec==="overview") drawCharts();
      if(sec==="calendar") renderCalendar();
      if(sec==="history") renderLog();
    });
  });
}

// ---------- Form handling ----------
function initForm(){
  const activityType = document.getElementById("activityType");
  activityType.addEventListener("change", updateDynamicInputs);
  document.getElementById("btnAdd").addEventListener("click", addActivityManual);
  document.getElementById("btnAddAuto").addEventListener("click", addActivityAuto);

  document.getElementById("btnSample").addEventListener("click", generateSampleData);
  document.getElementById("btnExportJSON").addEventListener("click", exportJSON);
  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
  document.getElementById("btnImport").addEventListener("click", ()=>document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", importJSONFile);
}

function updateDynamicInputs(){
  const val = document.getElementById("activityType").value;
  const container = document.getElementById("dynamicInputs");
  container.innerHTML = "";
  if(val === "walking" || val === "jogging"){
    container.innerHTML = `<label>Steps (optional)</label><input id="inpSteps" type="number" placeholder="e.g., 4000">
                           <label>Duration (min)</label><input id="inpDuration" type="number" placeholder="e.g., 30">`;
  } else if(val === "cycling"){
    container.innerHTML = `<label>Distance (km) (optional)</label><input id="inpDistance" type="number" step="0.1" placeholder="e.g., 12.5">
                           <label>Duration (min)</label><input id="inpDuration" type="number" placeholder="e.g., 40">`;
  } else if(val === "swimming"){
    container.innerHTML = `<label>Duration (min)</label><input id="inpDuration" type="number" placeholder="e.g., 30">`;
  }
}

// ---------- Add activity ----------
function addActivityManual(){
  const date = document.getElementById("activityDate").value;
  if(!date) return alert("Select date");
  const activity = document.getElementById("activityType").value;
  if(!activity) return alert("Select activity");

  const notes = document.getElementById("notes").value || "";
  const steps = Number(document.getElementById("inpSteps")?.value || 0);
  const duration = Number(document.getElementById("inpDuration")?.value || 0);
  const distance = Number(document.getElementById("inpDistance")?.value || 0);

  const computed = computeFor(activity, {steps, duration, distance});
  const entry = {
    id: genId(), activity, steps: computed.steps, duration: computed.duration,
    distance_km: computed.distance, calories: computed.calories, heartRate: computed.heartRate, notes
  };
  pushEntry(date, entry);
  saveAndRefresh();
  alert("Activity added");
  clearAddForm();
}

function addActivityAuto(){
  const date = document.getElementById("activityDate").value;
  if(!date) return alert("Select date");
  const activity = document.getElementById("activityType").value;
  if(!activity) return alert("Select activity");
  const notes = document.getElementById("notes").value || "";
  const duration = Number(document.getElementById("inpDuration")?.value || 30); // fallback 30
  const computed = computeFor(activity, {steps:0, duration, distance:0});
  const entry = {
    id: genId(), activity, steps: computed.steps, duration: computed.duration,
    distance_km: computed.distance, calories: computed.calories, heartRate: computed.heartRate, notes
  };
  pushEntry(date, entry);
  saveAndRefresh();
  alert("Auto-estimated activity added");
  clearAddForm();
}

function clearAddForm(){
  document.getElementById("activityDate").value = "";
  document.getElementById("activityType").value = "";
  document.getElementById("dynamicInputs").innerHTML = "";
  document.getElementById("notes").value = "";
}

// ---------- Compute logic ----------
function computeFor(activity, {steps=0,duration=0,distance=0}){
  // Ensure profile defaults
  const age = profile.age || 30;
  const weight = profile.weight || 70;
  const restHR = profile.restingHR || 60;
  let calcSteps = steps || 0, calcDistance = distance || 0, calcDuration = duration || 0;
  let calories = 0, heartRate = restHR;

  if(activity === "walking"){
    if(!calcSteps && calcDuration) calcSteps = Math.round(calcDuration * 100);
    if(!calcDistance && calcSteps) calcDistance = +(calcSteps * 0.0008).toFixed(2);
    // MET ~ 3.5
    calories = Math.round(3.5 * weight * (calcDuration/60));
    heartRate = estimateHR(age, restHR, 0.35);
  } else if(activity === "jogging"){
    if(!calcSteps && calcDuration) calcSteps = Math.round(calcDuration * 150);
    if(!calcDistance && calcSteps) calcDistance = +(calcSteps * 0.001).toFixed(2);
    calories = Math.round(7.0 * weight * (calcDuration/60));
    heartRate = estimateHR(age, restHR, 0.6);
  } else if(activity === "cycling"){
    if(!calcDistance && calcDuration) calcDistance = +(calcDuration * 0.3).toFixed(2);
    calories = Math.round(6.8 * weight * (calcDuration/60));
    heartRate = estimateHR(age, restHR, 0.5);
  } else if(activity === "swimming"){
    calories = Math.round(9.8 * weight * (calcDuration/60));
    heartRate = estimateHR(age, restHR, 0.65);
  }

  // fallback duration if somehow zero
  if(!calcDuration) calcDuration = duration || 0;

  return { steps: calcSteps, duration: calcDuration, distance: calcDistance, calories, heartRate };
}

function estimateHR(age, restHR, intensityFactor){
  const maxHR = 220 - age;
  const hr = Math.round(restHR + intensityFactor * (maxHR - restHR));
  // Add small random noise
  return Math.max(restHR, Math.min(190, hr + Math.round((Math.random()-0.5)*8)));
}

// ---------- Data helpers ----------
function pushEntry(date, entry){
  if(!activityData[date]) activityData[date] = { entries: [] };
  activityData[date].entries.push(entry);
  // update aggregates on demand
}

function aggregateDate(date){
  const day = activityData[date];
  if(!day || !day.entries || day.entries.length===0) return { steps:0,duration:0,calories:0,distance:0,avgHR:0 };
  const agg = { steps:0,duration:0,calories:0,distance:0, hrSum:0, hrWeight:0 };
  day.entries.forEach(e=>{
    agg.steps += e.steps || 0;
    agg.duration += e.duration || 0;
    agg.calories += e.calories || 0;
    agg.distance += e.distance_km || 0;
    if(e.heartRate && e.duration){
      agg.hrSum += e.heartRate * e.duration;
      agg.hrWeight += e.duration;
    }
  });
  return {
    steps: agg.steps,
    duration: agg.duration,
    calories: agg.calories,
    distance: +agg.distance.toFixed(2),
    avgHR: agg.hrWeight ? Math.round(agg.hrSum / agg.hrWeight) : 0
  };
}

function saveAndRefresh(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activityData));
  refreshAll();
}

// ---------- Overview & Charts ----------
function initOverview(){
  const ctxStack = document.getElementById("stackedChart").getContext('2d');
  const ctxTrend = document.getElementById("trendChart").getContext('2d');
  stackedChart = new Chart(ctxStack, { type:'bar', data:{labels:[],datasets:[]}, options:{responsive:true, plugins:{legend:{position:'bottom'}}, scales:{x:{stacked:true}, y:{stacked:true, beginAtZero:true}}}});
  trendChart = new Chart(ctxTrend, { type:'line', data:{labels:[],datasets:[]}, options:{responsive:true, plugins:{legend:{position:'bottom'}}}});
  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
}

function drawCharts(){
  // prepare last N days (default 14)
  const labels = Object.keys(activityData).sort();
  if(labels.length===0){
    stackedChart.data.labels = [];
    stackedChart.data.datasets = [];
    stackedChart.update();
    trendChart.data.labels = [];
    trendChart.data.datasets = [];
    trendChart.update();
    return;
  }
  // For stacked durations per activity
  const dateLabels = labels;
  const activities = ["walking","jogging","cycling","swimming"];
  const colorMap = { walking:'#63b3ed', jogging:'#fb7185', cycling:'#86efac', swimming:'#fbbf24' };
  const datasets = activities.map(act=>{
    return {
      label: act.charAt(0).toUpperCase() + act.slice(1),
      data: dateLabels.map(d=> sumDurationFor(d,act)),
      backgroundColor: colorMap[act],
      stack: 'Stack 0'
    };
  });
  stackedChart.data.labels = dateLabels;
  stackedChart.data.datasets = datasets;
  stackedChart.update();

  // Trend: steps (bar) and calories (line)
  const stepsData = dateLabels.map(d=> aggregateDate(d).steps);
  const calData = dateLabels.map(d=> aggregateDate(d).calories);
  trendChart.data.labels = dateLabels;
  trendChart.data.datasets = [
    { type:'bar',label:'Steps', data: stepsData, backgroundColor:'#60a5fa' },
    { type:'line',label:'Calories', data: calData, borderColor:'#f59e0b', fill:false, tension:0.3 }
  ];
  trendChart.update();

  // Update summary cards
  const totals = dateLabels.reduce((s,d)=>{
    const a=aggregateDate(d);
    s.steps+=a.steps; s.calories+=a.calories; s.duration+=a.duration; s.hrSum+=(a.avgHR || 0);
    return s;
  },{steps:0,calories:0,duration:0,hrSum:0});
  const avgHR = Math.round(totals.hrSum / (dateLabels.length || 1)) || "--";
  document.getElementById("totalSteps").innerText = totals.steps;
  document.getElementById("totalCalories").innerText = totals.calories;
  document.getElementById("totalDuration").innerText = totals.duration;
  document.getElementById("avgHR").innerText = avgHR;
  renderBadges();
}

// helper: sum durations of an activity on a date
function sumDurationFor(date, activity){
  const day = activityData[date];
  if(!day) return 0;
  return day.entries.reduce((s,e)=> s + ((e.activity===activity) ? (e.duration||0) : 0), 0);
}

// ---------- Calendar ----------
function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  const dt = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
  title.innerText = dt.toLocaleString(undefined,{month:'long', year:'numeric'});
  grid.innerHTML = "";

  // day headers
  const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  days.forEach(d=> {
    const el = document.createElement("div");
    el.className = "calendar-cell";
    el.style.fontWeight = "700";
    el.style.background="transparent";
    el.style.border="none";
    el.innerText = d;
    grid.appendChild(el);
  });

  // blanks
  const startDay = dt.getDay();
  for(let i=0;i<startDay;i++){
    const blank = document.createElement("div");
    blank.className = "calendar-cell";
    blank.style.opacity = "0.3";
    grid.appendChild(blank);
  }

  // days
  const month = dt.getMonth();
  while(dt.getMonth()===month){
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-cell";
    const dateStr = dt.toISOString().slice(0,10);
    const header = document.createElement("div");
    header.className = "date";
    header.innerText = dt.getDate();
    dayCell.appendChild(header);

    // show small summary
    if(activityData[dateStr]){
      const agg = aggregateDate(dateStr);
      const info = document.createElement("div");
      info.style.marginTop='6px';
      info.innerHTML = `<small>${agg.steps} steps • ${agg.calories} kcal</small>`;
      dayCell.appendChild(info);
      dayCell.style.cursor="pointer";
      dayCell.addEventListener("click", ()=> showDayDetails(dateStr));
    } else {
      // allow click to add
      dayCell.addEventListener("click", ()=> { document.getElementById("activityDate").value = dateStr; 
                                             document.querySelector('[data-section="add"]').click();
                                           });
    }

    grid.appendChild(dayCell);
    dt.setDate(dt.getDate()+1);
  }

  // prev/next bind
  document.getElementById("prevMonth").onclick = ()=>{ currentCalendarDate.setMonth(currentCalendarDate.getMonth()-1); renderCalendar();}
  document.getElementById("nextMonth").onclick = ()=>{ currentCalendarDate.setMonth(currentCalendarDate.getMonth()+1); renderCalendar();}
}

function showDayDetails(dateStr){
  const details = document.getElementById("dayDetails");
  details.innerHTML = `<h4>${dateStr}</h4>`;
  const day = activityData[dateStr];
  if(!day || !day.entries.length) { details.innerHTML += "<p>No activities</p>"; return; }
  day.entries.forEach(e=>{
    const div = document.createElement("div");
    div.className = "log-entry";
    div.innerHTML = `<strong>${e.activity}</strong> — ${e.duration} min • ${e.steps} steps • ${e.distance_km || 0} km • ${e.calories} kcal • HR ${e.heartRate} <br><small>${e.notes || ""}</small>
      <div style="margin-top:6px"><button onclick='editEntry("${dateStr}","${e.id}")'>Edit</button> <button onclick='deleteEntry("${dateStr}","${e.id}")'>Delete</button></div>`;
    details.appendChild(div);
  });
}

// ---------- Log / History ----------
function renderLog(){
  const container = document.getElementById("logContainer");
  container.innerHTML = "";
  const dates = Object.keys(activityData).sort((a,b)=>b.localeCompare(a));
  if(dates.length===0){ container.innerHTML="<p>No data</p>"; return; }
  dates.forEach(date=>{
    const day = activityData[date];
    day.entries.forEach(e=>{
      const div = document.createElement("div");
      div.className = "log-entry";
      div.innerHTML = `<strong>${date}</strong> | ${e.activity} — ${e.duration} min — ${e.steps} steps — ${e.calories} kcal — HR ${e.heartRate} <br><small>${e.notes||""}</small>
        <div style="margin-top:6px"><button onclick='editEntry("${date}","${e.id}")'>Edit</button> <button onclick='deleteEntry("${date}","${e.id}")'>Delete</button></div>`;
      container.appendChild(div);
    });
  });
}

// ---------- Edit / Delete ----------
window.editEntry = function(date,id){
  // simple prompt-based edit for demo
  const day = activityData[date];
  if(!day) return;
  const entry = day.entries.find(e=>e.id===id);
  if(!entry) return;
  const newNotes = prompt("Notes:", entry.notes || "");
  if(newNotes !== null) entry.notes = newNotes;
  saveAndRefresh();
};

window.deleteEntry = function(date,id){
  if(!confirm("Delete this entry?")) return;
  const day = activityData[date];
  day.entries = day.entries.filter(e=>e.id!==id);
  if(day.entries.length===0) delete activityData[date];
  saveAndRefresh();
};

// ---------- Settings & Profile ----------
function bindSettings(){
  // load profile
  const prof = profile || {};
  document.getElementById("profileName").value = prof.name || "";
  document.getElementById("profileAge").value = prof.age || "";
  document.getElementById("profileWeight").value = prof.weight || "";
  document.getElementById("profileRestHR").value = prof.restingHR || "";

  const g = goals || {};
  document.getElementById("goalSteps").value = g.steps || 10000;
  document.getElementById("goalCalories").value = g.calories || 500;
  document.getElementById("goalDuration").value = g.duration || 30;

  document.getElementById("saveProfile").addEventListener("click", ()=>{
    profile = {
      name: document.getElementById("profileName").value || "User",
      age: Number(document.getElementById("profileAge").value) || 30,
      weight: Number(document.getElementById("profileWeight").value) || 70,
      restingHR: Number(document.getElementById("profileRestHR").value) || 60
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    alert("Profile saved");
  });

  document.getElementById("saveGoals").addEventListener("click", ()=>{
    goals = {
      steps: Number(document.getElementById("goalSteps").value) || 10000,
      calories: Number(document.getElementById("goalCalories").value) || 500,
      duration: Number(document.getElementById("goalDuration").value) || 30
    };
    localStorage.setItem(GOAL_KEY, JSON.stringify(goals));
    alert("Goals saved");
  });

  document.getElementById("clearAll").addEventListener("click", ()=>{
    if(confirm("Clear all stored data? This cannot be undone.")){
      activityData = {};
      localStorage.removeItem(STORAGE_KEY);
      refreshAll();
    }
  });

  document.getElementById("testNotif").addEventListener("click", requestNotificationPermission);
}

// ---------- Export / Import ----------
function exportJSON(){
  const blob = new Blob([JSON.stringify({profile,goals,activityData},null,2)], {type:'application/json'});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ftpro_export_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
}

function importJSONFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const obj = JSON.parse(ev.target.result);
      if(obj.activityData) activityData = obj.activityData;
      if(obj.profile) profile = obj.profile;
      if(obj.goals) goals = obj.goals;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activityData));
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      localStorage.setItem(GOAL_KEY, JSON.stringify(goals));
      bindSettings();
      refreshAll();
      alert("Imported successfully");
    }catch(err){ alert("Invalid JSON file"); }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function exportCSV(){
  // raw rows
  const rows = [['date','activity','steps','duration_min','distance_km','calories','heartRate','notes']];
  Object.keys(activityData).forEach(date=>{
    activityData[date].entries.forEach(e=>{
      rows.push([date,e.activity,e.steps||0,e.duration||0,e.distance_km||0,e.calories||0,e.heartRate||"",e.notes||""]);
    });
  });
  const csv = rows.map(r=> r.map(c=> `"${String(c).replace(/"/g,'""')}"`).join(',') ).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ftpro_raw_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ---------- Utilities ----------
function genId(){ return 'id'+Math.random().toString(36).slice(2,9); }

function sumObject(arr, key){ return arr.reduce((s,o)=>s + (o[key]||0), 0); }

function refreshAll(){
  drawCharts();
  renderCalendar();
  renderLog();
  updateBadgesUI();
}

// ---------- Sample Data ----------
function generateSampleData(){
  // create last 10 days random activities
  const acts = ["walking","jogging","cycling","swimming"];
  for(let i=0;i<10;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    const n = Math.floor(Math.random()*3)+1;
    for(let j=0;j<n;j++){
      const act = acts[Math.floor(Math.random()*acts.length)];
      const dur = Math.floor(Math.random()*50)+15;
      const comp = computeFor(act,{steps:0,duration:dur,distance:0});
      const entry = { id: genId(), activity: act, steps: comp.steps, duration: comp.duration, distance_km: comp.distance, calories: comp.calories, heartRate: comp.heartRate, notes: "sample" };
      pushEntry(key, entry);
    }
  }
  saveAndRefresh();
  alert("Sample data generated");
}

// ---------- Achievements / Badges ----------
function renderBadges(){
  const container = document.getElementById("badgesContainer");
  container.innerHTML = "";
  const badges = computeBadges();
  badges.forEach(b=>{
    const el = document.createElement("div");
    el.className = "badge";
    el.innerHTML = `<strong>${b.title}</strong><div style="margin-top:6px">${b.desc}</div>`;
    container.appendChild(el);
  });
}

function computeBadges(){
  const badges = [];
  // 10k day
  const tenK = Object.keys(activityData).some(d => aggregateDate(d).steps >= 10000);
  if(tenK) badges.push({ title:"🥇 10k Steps Day", desc:"You hit 10,000+ steps in a day" });
  // 7-day streak
  if(checkStreak(7)) badges.push({ title:"🔥 7-Day Streak", desc:"Active 7 consecutive days" });
  // 100 km total distance
  const totalDistance = Object.keys(activityData).reduce((s,d)=> s + (aggregateDate(d).distance||0),0);
  if(totalDistance >= 100) badges.push({ title:"🏃 100 km Total", desc:`You traveled ${Math.round(totalDistance)} km total`});
  // First entry
  if(Object.keys(activityData).length > 0) badges.push({ title:"✅ Getting Started", desc:"You created your first activity" });
  return badges;
}

function checkStreak(n){
  // check if last n days each have activity
  for(let i=0;i<n;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    const key = d.toISOString().slice(0,10);
    if(!activityData[key]) return false;
  }
  return true;
}

function updateBadgesUI(){
  // currently same as renderBadges; kept for compatibility
}

// ---------- Notifications ----------
function requestNotificationPermission(){
  if(!("Notification" in window)){
    alert("This browser does not support notifications.");
    return;
  }
  Notification.requestPermission().then(permission=>{
    if(permission==="granted"){
      new Notification("Fitness Tracker", { body:"Notifications enabled. We'll remind you to move!" });
    } else {
      alert("Notifications blocked or dismissed");
    }
  });
}

// ---------- Misc helpers ----------
function sumDuration(date){ return activityData[date] ? sumObject(activityData[date].entries,'duration') : 0; }

// ---------- Initial render calls ----------
function refreshUI(){
  refreshAll();
}
refreshUI();

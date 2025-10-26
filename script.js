const STORAGE_KEY = "ftpro_activityData_v2";
const PROFILE_KEY = "ftpro_profile_v2";
const GOAL_KEY = "ftpro_goals_v2";

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
    btn.addEventListener("click", ()=>{
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

  document.getElementById("btnExportCSV").addEventListener("click", exportCSV);
  document.getElementById("btnImportCSV").addEventListener("click", ()=>document.getElementById("fileInput").click());
  document.getElementById("fileInput").addEventListener("change", importCSVFile);
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
  const computed = computeFor(activity, {steps,duration,distance});
  const entry = {
    id: genId(), activity, steps: computed.steps, duration: computed.duration,
    distance_km: computed.distance, calories: computed.calories, heartRate: computed.heartRate, notes
  };
  pushEntry(date, entry);
  saveAndRefresh();
  alert("Activity added");
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
  const age = profile.age || 30;
  const weight = profile.weight || 70;
  const restHR = profile.restingHR || 60;
  let calcSteps = steps || 0, calcDistance = distance || 0, calcDuration = duration || 0;
  let calories = 0, heartRate = restHR;

  if(activity === "walking"){
    if(!calcSteps && calcDuration) calcSteps = Math.round(calcDuration * 100);
    if(!calcDistance && calcSteps) calcDistance = +(calcSteps * 0.0008).toFixed(2);
    calories = Math.round(3.5 * weight * (calcDuration/60));
    heartRate = Math.round(restHR + 0.5*(220-age-restHR));
  } else if(activity === "jogging"){
    if(!calcSteps && calcDuration) calcSteps = Math.round(calcDuration * 150);
    if(!calcDistance && calcSteps) calcDistance = +(calcSteps * 0.001).toFixed(2);
    calories = Math.round(7 * weight * (calcDuration/60));
    heartRate = Math.round(restHR + 0.7*(220-age-restHR));
  } else if(activity === "cycling"){
    if(!calcDistance && calcDuration) calcDistance = +(calcDuration * 0.3).toFixed(2);
    calories = Math.round(6 * weight * (calcDuration/60));
    heartRate = Math.round(restHR + 0.6*(220-age-restHR));
  } else if(activity === "swimming"){
    calories = Math.round(8 * weight * (calcDuration/60));
    heartRate = Math.round(restHR + 0.7*(220-age-restHR));
  }
  return {steps: calcSteps, duration: calcDuration, distance: calcDistance, calories, heartRate};
}

// ---------- Storage ----------
function pushEntry(date, entry){
  if(!activityData[date]) activityData[date] = [];
  activityData[date].push(entry);
}

function saveAndRefresh(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activityData));
  refreshAll();
}

// ---------- Refresh overview ----------
function refreshAll(){
  updateOverview();
  drawCharts();
  renderLog();
}

function updateOverview(){
  let totalSteps = 0, totalCalories = 0, totalDuration = 0, totalHR = 0, count = 0;
  Object.values(activityData).forEach(arr=>{
    arr.forEach(a=>{
      totalSteps+=a.steps; totalCalories+=a.calories; totalDuration+=a.duration; totalHR+=a.heartRate; count++;
    });
  });
  document.getElementById("totalSteps").innerText = totalSteps;
  document.getElementById("totalCalories").innerText = totalCalories;
  document.getElementById("totalDuration").innerText = totalDuration;
  document.getElementById("avgHR").innerText = count ? Math.round(totalHR/count) : "--";
  updateBadges();
}

// ---------- Emoji Badges ----------
function updateBadges(){
  const c = document.getElementById("badgesContainer");
  c.innerHTML="";
  const totalDays = Object.keys(activityData).length;
  const totalSteps = Number(document.getElementById("totalSteps").innerText);
  const totalCalories = Number(document.getElementById("totalCalories").innerText);

  if(totalDays>=5) c.innerHTML+=`<div class="badge">🏃 5+ Active Days</div>`;
  if(totalDays>=10) c.innerHTML+=`<div class="badge">🔥 10+ Active Days</div>`;
  if(totalDays>=30) c.innerHTML+=`<div class="badge">💪 30+ Active Days</div>`;
  if(totalSteps>=50000) c.innerHTML+=`<div class="badge">👟 50k Steps</div>`;
  if(totalSteps>=100000) c.innerHTML+=`<div class="badge">🥇 100k Steps</div>`;
  if(totalCalories>=5000) c.innerHTML+=`<div class="badge">🍎 5k Calories Burned</div>`;
  if(totalCalories>=10000) c.innerHTML+=`<div class="badge">🏆 10k Calories Burned</div>`;
}

// ---------- Charts ----------
function initOverviewChart(){
  if(!stackedChart){
    const ctx = document.getElementById("stackedChart").getContext("2d");
    stackedChart = new Chart(ctx,{
      type:"bar",
      data:{labels:[],datasets:[
        {label:"Walking", data:[], backgroundColor:"green"},
        {label:"Jogging", data:[], backgroundColor:"orange"},
        {label:"Cycling", data:[], backgroundColor:"blue"},
        {label:"Swimming", data:[], backgroundColor:"cyan"}
      ]},
      options:{plugins:{title:{display:true,text:"Activity Duration per Day"}}, responsive:true, scales:{x:{stacked:true}, y:{stacked:true}}}
    });
  }
  if(!trendChart){
    const ctx = document.getElementById("trendChart").getContext("2d");
    trendChart = new Chart(ctx,{
      type:"line",
      data:{labels:[], datasets:[
        {label:"Steps", data:[], borderColor:"green", fill:false},
        {label:"Calories", data:[], borderColor:"red", fill:false}
      ]},
      options:{responsive:true}
    });
  }
}

function drawCharts(){
  initOverviewChart();
  const dates = Object.keys(activityData).sort();
  const walking=[], jogging=[], cycling=[], swimming=[], steps=[], calories=[];
  dates.forEach(d=>{
    const arr = activityData[d];
    walking.push(sumField(arr,"walking","duration"));
    jogging.push(sumField(arr,"jogging","duration"));
    cycling.push(sumField(arr,"cycling","duration"));
    swimming.push(sumField(arr,"swimming","duration"));
    steps.push(sumField(arr,null,"steps"));
    calories.push(sumField(arr,null,"calories"));
  });
  stackedChart.data.labels = dates;
  stackedChart.data.datasets[0].data = walking;
  stackedChart.data.datasets[1].data = jogging;
  stackedChart.data.datasets[2].data = cycling;
  stackedChart.data.datasets[3].data = swimming;
  stackedChart.update();

  trendChart.data.labels = dates;
  trendChart.data.datasets[0].data = steps;
  trendChart.data.datasets[1].data = calories;
  trendChart.update();
}

function sumField(arr, activity=null, field){
  return arr.filter(a=>!activity || a.activity===activity).reduce((s,a)=>s+a[field],0);
}

// ---------- Log ----------
function renderLog(){
  const c = document.getElementById("logContainer");
  c.innerHTML="";
  Object.keys(activityData).sort().forEach(d=>{
    const arr = activityData[d];
    arr.forEach(a=>{
      const div = document.createElement("div");
      div.className="log-item";
      div.innerHTML=`<b>${d}:</b> ${a.activity}, ${a.steps} steps, ${a.duration} min, ${a.distance_km} km, ${a.calories} cal`;
      c.appendChild(div);
    });
  });
}

// ---------- Calendar ----------
function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const title = document.getElementById("calendarTitle");
  const y = currentCalendarDate.getFullYear();
  const m = currentCalendarDate.getMonth();
  title.innerText = currentCalendarDate.toLocaleString('default',{month:'long'}) + " "+y;
  const firstDay = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  grid.innerHTML="";
  for(let i=0;i<firstDay;i++) grid.innerHTML+="<div></div>";
  for(let d=1;d<=daysInMonth;d++){
    const cell = document.createElement("div");
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    cell.className="calendar-cell";
    cell.innerHTML=`<span>${d}</span>`;
    
    if(activityData[dateStr]) cell.classList.add("has-data");
    cell.addEventListener("click", ()=>showDayDetails(dateStr));
    grid.appendChild(cell);
  }
  document.getElementById("prevMonth").onclick = ()=>{currentCalendarDate.setMonth(currentCalendarDate.getMonth()-1); renderCalendar();};
  document.getElementById("nextMonth").onclick = ()=>{currentCalendarDate.setMonth(currentCalendarDate.getMonth()+1); renderCalendar();};
}

function showDayDetails(date){
  const container = document.getElementById("dayDetails");
  const arr = activityData[date] || [];
  if(!arr.length) { container.innerHTML="No activity"; return; }
  container.innerHTML = `<h4>${date} Activity Details</h4>`;
  arr.forEach(a=>{
    container.innerHTML+=`<div>${a.activity}, ${a.steps} steps, ${a.duration} min, ${a.distance_km} km, ${a.calories} cal</div>`;
  });
}

// ---------- Settings ----------
function bindSettings(){
  document.getElementById("saveProfile").addEventListener("click", ()=>{
    profile = {
      name: document.getElementById("profileName").value || "User",
      age: Number(document.getElementById("profileAge").value)||30,
      weight: Number(document.getElementById("profileWeight").value)||70,
      restingHR: Number(document.getElementById("profileRestHR").value)||60
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    alert("Profile saved");
  });
  document.getElementById("saveGoals").addEventListener("click", ()=>{
    goals = {
      steps: Number(document.getElementById("goalSteps").value)||10000,
      calories: Number(document.getElementById("goalCalories").value)||500,
      duration: Number(document.getElementById("goalDuration").value)||30
    };
    localStorage.setItem(GOAL_KEY, JSON.stringify(goals));
    alert("Goals saved");
  });
  document.getElementById("clearAll").addEventListener("click", ()=>{
    if(confirm("Clear all data?")){
      activityData={};
      saveAndRefresh();
    }
  });
}

// ---------- CSV export/import ----------
function exportCSV(){
  let csv="date,activity,steps,duration,distance_km,calories,heartRate,notes\n";
  Object.keys(activityData).sort().forEach(d=>{
    activityData[d].forEach(a=>{
      csv+=`${d},${a.activity},${a.steps},${a.duration},${a.distance_km},${a.calories},${a.heartRate},"${a.notes || ""}"\n`;
    });
  });
  const blob = new Blob([csv], {type:"text/csv"});
  const a = document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="fitness_data.csv";
  a.click();
}

function importCSVFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev=>{
    const text = ev.target.result;
    const lines = text.split(/\r?\n/);
    lines.slice(1).forEach(line=>{
      if(!line.trim()) return;
      const [date,activity,steps,duration,distance_km,calories,heartRate,notes] = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v=>v.replace(/^"|"$/g,'').replace(/""/g,'"'));
      if(!date || !activity) return;
      if(!activityData[date]) activityData[date]=[];
      activityData[date].push({id:genId(), activity, steps:Number(steps), duration:Number(duration), distance_km:Number(distance_km), calories:Number(calories), heartRate:Number(heartRate), notes});
    });
    saveAndRefresh();
    alert("CSV imported successfully");
  };
  reader.readAsText(file);
}

// ---------- Helpers ----------
function genId(){ return Math.random().toString(36).substr(2,9); }

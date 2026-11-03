/* SunWise Gulf — local-first prototype. No secret keys or backend required. */
'use strict';

const COUNTRIES = {
  UAE: { name: '🇦🇪 UAE', cities: [
    { id:'dubai',name:'Dubai',lat:25.2048,lon:55.2708,tz:'Asia/Dubai' },
    { id:'abudhabi',name:'Abu Dhabi',lat:24.4539,lon:54.3773,tz:'Asia/Dubai' },
    { id:'sharjah',name:'Sharjah',lat:25.3463,lon:55.4209,tz:'Asia/Dubai' },
    { id:'alain',name:'Al Ain',lat:24.2075,lon:55.7447,tz:'Asia/Dubai' }
  ]},
  SA: { name:'🇸🇦 Saudi Arabia', cities: [
    {id:'riyadh',name:'Riyadh',lat:24.7136,lon:46.6753,tz:'Asia/Riyadh'},
    {id:'jeddah',name:'Jeddah',lat:21.4858,lon:39.1925,tz:'Asia/Riyadh'},
    {id:'dammam',name:'Dammam',lat:26.4207,lon:50.0888,tz:'Asia/Riyadh'},
    {id:'mecca',name:'Makkah',lat:21.3891,lon:39.8579,tz:'Asia/Riyadh'}
  ]},
  QA: {name:'🇶🇦 Qatar',cities:[{id:'doha',name:'Doha',lat:25.2854,lon:51.5310,tz:'Asia/Qatar'}]},
  KW: {name:'🇰🇼 Kuwait',cities:[{id:'kuwait',name:'Kuwait City',lat:29.3759,lon:47.9774,tz:'Asia/Kuwait'}]},
  BH: {name:'🇧🇭 Bahrain',cities:[{id:'manama',name:'Manama',lat:26.2285,lon:50.5860,tz:'Asia/Bahrain'}]},
  OM: {name:'🇴🇲 Oman',cities:[
    {id:'muscat',name:'Muscat',lat:23.5880,lon:58.3829,tz:'Asia/Muscat'},
    {id:'salalah',name:'Salalah',lat:17.0194,lon:54.0897,tz:'Asia/Muscat'},
    {id:'sohar',name:'Sohar',lat:24.3643,lon:56.7468,tz:'Asia/Muscat'}
  ]}
};

// Reference serving values sourced from NIH ODS Vitamin D Fact Sheet, Table 3.
// These are estimates, not a product-specific or diagnosis-grade nutrient database.
const FOODS = [
  {id:'salmon',name:'Cooked sockeye salmon',serving:'3 oz / 85 g',iu:570,grams:85,oz:3,emoji:'🐟',synonyms:['sockeye salmon','cooked salmon','salmon']},
  {id:'trout',name:'Cooked rainbow trout',serving:'3 oz / 85 g',iu:645,grams:85,oz:3,emoji:'🐟',synonyms:['rainbow trout','trout']},
  {id:'uvmushroom',name:'UV-exposed mushrooms',serving:'½ cup',iu:366,cups:.5,emoji:'🍄',synonyms:['uv-exposed mushrooms','uv exposed mushrooms','uv mushrooms','vitamin d mushrooms','uv-exposed mushroom']},
  {id:'plantmilk',name:'Fortified plant milk',serving:'1 cup (brand-dependent)',iu:120,cups:1,emoji:'🥛',synonyms:['fortified oat milk','fortified almond milk','fortified soy milk','fortified plant milk','vitamin d oat milk','vitamin d soy milk']},
  {id:'milk',name:'Vitamin D-fortified dairy milk',serving:'1 cup (US reference)',iu:120,cups:1,emoji:'🥛',synonyms:['fortified cow milk','fortified dairy milk','fortified milk','vitamin d milk']},
  {id:'cereal',name:'Vitamin D-fortified cereal',serving:'1 serving (10% DV)',iu:80,emoji:'🥣',synonyms:['fortified breakfast cereal','fortified cereal','vitamin d cereal']},
  {id:'sardines',name:'Canned sardines',serving:'2 sardines',iu:46,items:2,emoji:'🐟',synonyms:['canned sardines','sardines','sardine']},
  {id:'egg',name:'Scrambled egg',serving:'1 large',iu:44,items:1,emoji:'🥚',synonyms:['scrambled eggs','scrambled egg','eggs','egg']},
  {id:'tuna',name:'Canned light tuna',serving:'3 oz / 85 g',iu:40,grams:85,oz:3,emoji:'🐟',synonyms:['canned light tuna','canned tuna','tuna']},
  {id:'cheddar',name:'Cheddar cheese',serving:'1.5 oz / 43 g',iu:17,grams:43,oz:1.5,emoji:'🧀',synonyms:['cheddar cheese','cheddar']},
  {id:'mushroom',name:'Regular portabella mushrooms',serving:'½ cup',iu:4,cups:.5,emoji:'🍄',synonyms:['portabella mushrooms','regular mushrooms','portabella mushroom','mushrooms','mushroom']}
];
const FOOD_TERMS = FOODS.flatMap(food=>food.synonyms.map(term=>({food,term}))).sort((a,b)=>b.term.length-a.term.length);
const STORAGE_KEY='sunwise-gulf-v1';
const DEFAULTS={country:'UAE',city:'dubai',maxHumidity:65,maxFeels:35,afterWake:true,day:0,dailyTarget:600,sleepGoal:8,plannedWake:'07:00',ageGroup:'adult',outdoorMinutes:15,weeklyGoal:3,outdoorDays:[],foods:[],sleeps:[]};
let state=loadState();
let forecast=null, loadedFor=null, fetchedAt=0, dataFresh=false, city=null;
let activeController=null;
let photoAiAvailable=false;
let photoObjectURL=null;
const el=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const round=(n,d=0)=>Number.isFinite(n)?Number(n.toFixed(d)):null;
const escapeHTML=(s)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtNum=(n)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(n);

function loadState(){
  try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return {...DEFAULTS,...parsed,foods:Array.isArray(parsed.foods)?parsed.foods:[],sleeps:Array.isArray(parsed.sleeps)?parsed.sleeps:[],outdoorDays:Array.isArray(parsed.outdoorDays)?parsed.outdoorDays:[]};
  }catch{return {...DEFAULTS,foods:[],sleeps:[],outdoorDays:[]};}
}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{}}
function cityOf(country,id){return (COUNTRIES[country]?.cities||[]).find(c=>c.id===id)||COUNTRIES[country]?.cities[0]||COUNTRIES.UAE.cities[0];}
function isoDateAt(tz,date=new Date()){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const d=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${d.year}-${d.month}-${d.day}`;
}
function localHour(tz,date=new Date()){
  return Number(new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',hourCycle:'h23'}).format(date));
}
function clockAt(tz){return new Intl.DateTimeFormat('en-GB',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date());}
function friendlyDate(tz){return new Intl.DateTimeFormat('en-GB',{timeZone:tz,weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date());}
function formatHour(iso){const h=Number(iso.slice(11,13));return `${h%12||12}${h>=12?' PM':' AM'}`;}
function hourRange(hour){const a=Number(hour.slice(11,13));const f=h=>`${h%12||12}${h>=12?'pm':'am'}`;return `${f(a)} – ${f((a+1)%24)}`;}
function formatTimeISO(iso){if(!iso)return '—';const [h,m]=iso.slice(11,16).split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;}
function durationText(minutes){const hrs=Math.floor(minutes/60),mins=minutes%60;return mins?`${hrs}h ${mins}m`:`${hrs}h`;} 
function timeToMinutes(s){const [h,m]=s.split(':').map(Number);return h*60+m;}

function init(){
  for(const [key,data] of Object.entries(COUNTRIES))el('countrySelect').add(new Option(data.name,key));
  if(!COUNTRIES[state.country])state.country='UAE';
  el('countrySelect').value=state.country;fillCities();city=cityOf(state.country,state.city);
  el('humidityRange').value=state.maxHumidity;el('heatRange').value=state.maxFeels;
  el('afterWake').checked=state.afterWake;el('dailyTarget').value=String(state.dailyTarget);el('sleepGoal').value=String(state.sleepGoal);
  el('humidityValue').textContent=state.maxHumidity+'%';el('heatValue').textContent=state.maxFeels+'°C';
  el('plannedWake').value=/^([01]\d|2[0-3]):[0-5]\d$/.test(state.plannedWake)?state.plannedWake:'07:00';
  el('ageGroup').value=state.ageGroup==='teen'?'teen':'adult';
  el('outdoorMinutes').value=[10,15,20,30].includes(Number(state.outdoorMinutes))?String(state.outdoorMinutes):'15';
  el('weeklyGoal').value=[2,3,4,5,6,7].includes(Number(state.weeklyGoal))?String(state.weeklyGoal):'3';
  el('sleepDate').value=isoDateAt(city.tz);el('todayLabel').textContent=friendlyDate(city.tz);
  document.querySelectorAll('.day-button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.day)===state.day));
  bindEvents();renderFood();renderSleep();renderQuickFoods();renderRoutine();updateCityClock();fetchForecast();checkPhotoAI();
  setInterval(()=>{updateCityClock();if(Date.now()-fetchedAt>=15*60*1000)fetchForecast();else renderRoutine();},60*1000);
}
function fillCities(){
  const menu=el('citySelect');menu.innerHTML='';
  for(const c of COUNTRIES[state.country].cities)menu.add(new Option(c.name,c.id));
  if(!COUNTRIES[state.country].cities.some(c=>c.id===state.city))state.city=COUNTRIES[state.country].cities[0].id;
  menu.value=state.city;
}
function bindEvents(){
  el('countrySelect').addEventListener('change',e=>{state.country=e.target.value;state.city=COUNTRIES[state.country].cities[0].id;fillCities();changeCity();});
  el('citySelect').addEventListener('change',e=>{state.city=e.target.value;changeCity();});
  el('refreshBtn').addEventListener('click',()=>fetchForecast());
  for(const b of document.querySelectorAll('.day-button'))b.addEventListener('click',()=>{state.day=Number(b.dataset.day);save();setDayBtns();renderPlanner();});
  el('humidityRange').addEventListener('input',e=>{state.maxHumidity=Number(e.target.value);el('humidityValue').textContent=state.maxHumidity+'%';save();renderPlanner();});
  el('heatRange').addEventListener('input',e=>{state.maxFeels=Number(e.target.value);el('heatValue').textContent=state.maxFeels+'°C';save();renderPlanner();});
  el('afterWake').addEventListener('change',e=>{state.afterWake=e.target.checked;save();renderPlanner();});
  el('foodForm').addEventListener('submit',addTextFood);
  el('dailyTarget').addEventListener('change',e=>{state.dailyTarget=Number(e.target.value);save();renderFood();});
  el('barcodeForm').addEventListener('submit',lookupBarcode);
  el('photoInput').addEventListener('change',onPhotoSelected);
  el('photoAnalyseBtn').addEventListener('click',analysePhoto);
  el('sleepForm').addEventListener('submit',logSleep);
  el('plannedWake').addEventListener('change',e=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.target.value))return;state.plannedWake=e.target.value;save();renderPlanner();renderRoutine();});
  el('ageGroup').addEventListener('change',e=>{state.ageGroup=e.target.value;save();renderRoutine();});
  el('outdoorMinutes').addEventListener('change',e=>{state.outdoorMinutes=Number(e.target.value);save();renderRoutine();});
  el('weeklyGoal').addEventListener('change',e=>{state.weeklyGoal=Number(e.target.value);save();renderRoutine();});
  el('markOutdoorBtn').addEventListener('click',markOutdoorDay);
  el('calendarBtn').addEventListener('click',downloadCalendarEvent);
  el('photoConsent').addEventListener('change',()=>{el('photoAnalyseBtn').disabled=!photoAiAvailable||!el('photoConsent').checked;});
  el('sleepGoal').addEventListener('change',e=>{state.sleepGoal=Number(e.target.value);save();renderSleep();renderRoutine();});
  el('exportBtn').addEventListener('click',exportDiary);
  document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
}
function changeCity(){
  city=cityOf(state.country,state.city);save();
  el('todayLabel').textContent=friendlyDate(city.tz);el('sleepDate').value=isoDateAt(city.tz);
  forecast=null;loadedFor=null;dataFresh=false;resetWeather();renderFood();renderSleep();updateCityClock();fetchForecast();
}
function setStatus(text,status='waiting',extra=''){
  el('dataStatus').textContent=text;el('dataStatusDot').className='status-dot'+(status==='live'?' live':status==='error'?' error':'');
  el('syncTime').textContent=extra||'Not synced';
}
function resetWeather(){
  for(const id of ['uvMetric','humidityMetric','heatMetric','daylightMetric','peakHumidity','peakUvTime'])el(id).textContent='—';
  for(const id of ['uvDetail','humidityDetail','heatDetail','daylightDetail'])el(id).textContent='Waiting for forecast';
  el('insightTitle').textContent='Your daylight, decoded.';
  el('insightText').textContent='We are connecting to the forecast for this city.';
  el('windowList').innerHTML='<div class="skeleton-block">Connecting to forecast…</div>';
  el('forecastChart').innerHTML='<div class="empty-forecast">Updating hourly UV…</div>';
  el('forecastRows').innerHTML='';
}
function weatherURL(c){
  const p=new URLSearchParams({latitude:c.lat,longitude:c.lon,timezone:c.tz,forecast_days:'3',
    current:'temperature_2m,relative_humidity_2m,apparent_temperature,cloud_cover,is_day',
    hourly:'temperature_2m,relative_humidity_2m,apparent_temperature,cloud_cover,shortwave_radiation,precipitation_probability',
    daily:'sunrise,sunset,uv_index_max'});
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}
function airURL(c){
  const p=new URLSearchParams({latitude:c.lat,longitude:c.lon,timezone:c.tz,forecast_days:'3',hourly:'uv_index,us_aqi,pm2_5'});
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
}
async function getJSON(url,signal){
  const response=await fetch(url,{signal,cache:'no-store'});
  if(!response.ok)throw new Error(`Forecast service returned ${response.status}`);
  const payload=await response.json();if(payload.error)throw new Error(payload.reason||'Weather API error');return payload;
}
function joinWeather(weather,air){
  const hourly=weather.hourly||{},ah=air?.hourly||{},lookup=new Map((ah.time||[]).map((t,i)=>[t,i]));
  const hours=(hourly.time||[]).map((time,i)=>{
    const a=lookup.get(time);
    return {time,temp:hourly.temperature_2m?.[i]??null,humidity:hourly.relative_humidity_2m?.[i]??null,
      feels:hourly.apparent_temperature?.[i]??null,cloud:hourly.cloud_cover?.[i]??null,
      solar:hourly.shortwave_radiation?.[i]??null,rain:hourly.precipitation_probability?.[i]??null,
      uv:a===undefined?null:ah.uv_index?.[a]??null,aqi:a===undefined?null:ah.us_aqi?.[a]??null};
  });
  return {current:weather.current||{},daily:weather.daily||{},hours,uvAvailable:hours.some(h=>Number.isFinite(h.uv)),airAvailable:!!air};
}
async function fetchForecast(){
  if(activeController)activeController.abort();activeController=new AbortController();const signal=activeController.signal;
  const selection=city.id;el('refreshBtn').disabled=true;setStatus('Updating forecast…');
  const results=await Promise.allSettled([getJSON(weatherURL(city),signal),getJSON(airURL(city),signal)]);
  if(signal.aborted)return;
  el('refreshBtn').disabled=false;
  const [w,a]=results;
  if(w.status==='fulfilled'){
    forecast=joinWeather(w.value,a.status==='fulfilled'?a.value:null);loadedFor=selection;
    fetchedAt=Date.now();dataFresh=true;
    setStatus(a.status==='fulfilled'?'Forecast updated':'Partial data · UV unavailable',a.status==='fulfilled'?'live':'error',`Synced ${clockAt(city.tz)}`);
    try{localStorage.setItem('sunwise-last-weather-'+selection,JSON.stringify({forecast,fetchedAt}));}catch{}
    renderWeather();renderPlanner();renderRoutine();
  }else{
    let cached=null;
    try{cached=JSON.parse(localStorage.getItem('sunwise-last-weather-'+selection)||'null');}catch{}
    if(cached?.forecast && Date.now()-cached.fetchedAt<48*60*60*1000){
      forecast=cached.forecast;fetchedAt=cached.fetchedAt;loadedFor=selection;dataFresh=false; // Cached weather is displayed only, never used for current outdoor recommendations.
      setStatus('Offline · cached forecast','error',`Saved ${new Date(fetchedAt).toLocaleString()}`);
      renderWeather();renderPlanner();renderRoutine();
    }else{
      forecast=null;dataFresh=false;setStatus('Live forecast unavailable','error','Check internet and retry');
      el('windowList').innerHTML='<div class="no-window"><strong>Could not load the weather.</strong><p>Please check your internet connection and select Refresh. No forecast values have been invented.</p></div>';
      el('insightTitle').textContent='Forecast unavailable';el('insightText').textContent='The live service could not be reached; your saved food and sleep diary still works.';renderRoutine();
    }
  }
}
function dayData(dayIndex){if(!forecast)return null;const date=forecast.daily.time?.[dayIndex];
  if(!date)return null;return {date,sunrise:forecast.daily.sunrise?.[dayIndex],sunset:forecast.daily.sunset?.[dayIndex],uvMax:forecast.daily.uv_index_max?.[dayIndex],hours:forecast.hours.filter(h=>h.time.startsWith(date))};
}
function dayLight(hour,day){
  if(!day.sunrise||!day.sunset)return hour>=7&&hour<=17;
  const hm=timeToMinutes(day.sunrise.slice(11,16)),hs=timeToMinutes(day.sunset.slice(11,16));
  return hour*60>=hm&&hour*60<hs;
}
function daytimeHours(day){return day.hours.filter(h=>dayLight(Number(h.time.slice(11,13)),day));}
function uvLabel(value){if(!Number.isFinite(value))return 'UV unavailable';if(value<3)return 'Low UV';if(value<6)return 'Moderate UV';if(value<8)return 'High UV';if(value<11)return 'Very high UV';return 'Extreme UV';}
function renderWeather(){
  const today=dayData(0);if(!today)return;const c=forecast.current;
  const dayUVs=today.hours.map(h=>h.uv).filter(Number.isFinite);
  const uvMax=dayUVs.length?Math.max(...dayUVs):today.uvMax;
  el('uvMetric').textContent=Number.isFinite(uvMax)?round(uvMax,1):'—';
  el('uvDetail').textContent=Number.isFinite(uvMax)?uvLabel(uvMax)+' expected today':'UV data unavailable';
  el('humidityMetric').textContent=Number.isFinite(c.relative_humidity_2m)?round(c.relative_humidity_2m):'—';
  el('humidityDetail').textContent=Number.isFinite(c.relative_humidity_2m)?(c.relative_humidity_2m>=70?'Feels muggy outside':c.relative_humidity_2m>=45?'Check heat as well':'Relatively dry air'):'Humidity unavailable';
  el('heatMetric').textContent=Number.isFinite(c.apparent_temperature)?round(c.apparent_temperature):'—';
  el('heatDetail').textContent=Number.isFinite(c.apparent_temperature)?(c.apparent_temperature>=40?'High heat stress possible':'Apparent temperature'):'Temperature unavailable';
  if(today.sunrise&&today.sunset){const mins=timeToMinutes(today.sunset.slice(11,16))-timeToMinutes(today.sunrise.slice(11,16));
    el('daylightMetric').textContent=round(mins/60,1);el('daylightDetail').textContent=`${formatTimeISO(today.sunrise)} – ${formatTimeISO(today.sunset)}`;
  }
}
function getWakeForDay(date){return state.sleeps.find(s=>s.date===date)?.wake||null;}
function getSlots(day){
  const nowDate=isoDateAt(city.tz);const nowHour=localHour(city.tz);
  return daytimeHours(day).filter(h=>{
    const hr=Number(h.time.slice(11,13));
    if(day.date===nowDate && hr<=nowHour)return false;
    if(state.afterWake){const wake=getWakeForDay(day.date)||state.plannedWake;if(wake&&hr*60<timeToMinutes(wake))return false;}
    if(!Number.isFinite(h.uv)||!Number.isFinite(h.feels)||!Number.isFinite(h.humidity))return false;
    if(h.uv>=6||h.feels>state.maxFeels||h.humidity>state.maxHumidity)return false;
    if(Number.isFinite(h.aqi)&&h.aqi>100)return false;
    if(Number.isFinite(h.rain)&&h.rain>=60)return false;
    return true;
  }).map(h=>{
    // Favour brightness (solar radiation), lower humidity, lower feels-like and lower UV.
    const bright=Number.isFinite(h.solar)?Math.min(h.solar/650,1):clamp(1-(h.cloud??60)/100,0,1);
    const score=bright*26 + (1-h.humidity/100)*29 + clamp((43-h.feels)/23,0,1)*33 + clamp((6-h.uv)/6,0,1)*12;
    return {...h,score};
  }).sort((a,b)=>b.score-a.score);
}
function renderPlanner(){
  const day=dayData(state.day);if(!day)return;
  const light=daytimeHours(day);
  const daylightHumid=light.filter(h=>Number.isFinite(h.humidity)).sort((a,b)=>b.humidity-a.humidity)[0];
  const peakUV=light.filter(h=>Number.isFinite(h.uv)).sort((a,b)=>b.uv-a.uv)[0];
  el('peakHumidity').textContent=daylightHumid?`${round(daylightHumid.humidity)}% at ${formatHour(daylightHumid.time)}`:'—';
  el('peakUvTime').textContent=peakUV?`${round(peakUV.uv,1)} at ${formatHour(peakUV.time)}`:'Unavailable';
  el('insightTitle').textContent=state.day===0?`${city.name}, let's plan today.`:`Looking ahead in ${city.name}.`;
  const liveNote=!dataFresh?'These values are cached, so do not use them to make outdoor decisions. ':'';
  if(peakUV?.uv>=6)el('insightText').textContent=liveNote+`Strong UV is expected around ${formatHour(peakUV.time)}. Prefer shade and sun protection. The planner intentionally excludes UV 6+ hours.`;
  else el('insightText').textContent=liveNote+`Today's UV appears lower, but sun protection is still needed at UV 3+. The best slot balances cloud-filtered brightness, heat and humidity.`;
  let slots=[];
  if(dataFresh&&forecast.uvAvailable)slots=getSlots(day);
  const win=el('windowList');
  if(!dataFresh){win.innerHTML='<div class="no-window"><strong>Forecast is stale.</strong><p>Refresh live conditions before relying on a suggested outdoor time.</p></div>';}
  else if(!forecast.uvAvailable){win.innerHTML='<div class="no-window"><strong>UV forecast could not be loaded.</strong><p>We cannot rank sun-aware windows without UV data. Use Refresh to try again.</p></div>';}
  else if(!slots.length){
    const past=state.day===0 && localHour(city.tz)>=19;
    win.innerHTML=`<div class="no-window"><strong>${past?'Daylight has ended for today.':'No suitable hour meets your limits.'}</strong><p>${past?'Switch to Tomorrow to preview daylight opportunities.':'Try another day or adjust your comfort filters. Do not relax UV protection solely to seek vitamin D.'}</p></div>`;
  }else{
    win.innerHTML=slots.slice(0,2).map((h,i)=>{
      const desc=h.uv>=3?'UV ≥3: use sunscreen, shade and coverage':'Lower UV; vitamin D production may be limited';
      return `<article class="window-card"><div class="window-tag">${i?'ALTERNATIVE OPTION':'TOP OUTDOOR OPTION'}</div><div class="window-time">${escapeHTML(hourRange(h.time))}</div><div class="window-features"><span>☼ UV ${round(h.uv,1)}</span><span>◉ ${round(h.humidity)}% humidity</span><span>♨ ${round(h.feels)}°C feels like</span></div><p class="window-explainer">${escapeHTML(desc)}</p></article>`;
    }).join('');
  }
  renderChart(day);renderRows(day);renderRoutine();
}
function renderChart(day){
  const hours=day.hours.filter(h=>{const hr=Number(h.time.slice(11,13));return hr>=7&&hr<=18;});
  if(!hours.length){el('forecastChart').innerHTML='<div class="empty-forecast">No forecast data for this day.</div>';return;}
  const max=Math.max(8,...hours.map(h=>Number.isFinite(h.uv)?h.uv:0));
  el('forecastChart').innerHTML=hours.map(h=>{
    const valid=Number.isFinite(h.uv),height=valid?clamp(h.uv/max*100,4,100):4,klass=!valid?'no-data':h.uv>=6?'high':h.uv>=3?'mid':'';
    return `<div class="hour-item" title="${escapeHTML(formatHour(h.time))}: UV ${valid?round(h.uv,1):'unavailable'}, humidity ${h.humidity??'—'}%, feels-like ${h.feels??'—'}°C"><div class="hour-bar-wrap"><div class="hour-bar ${klass}" style="height:${height}%">${valid?`<span class="hour-uv">${round(h.uv,1)}</span>`:''}</div></div><span class="hour-label">${escapeHTML(formatHour(h.time))}</span></div>`;
  }).join('');
}
function renderRows(day){
  const light=day.hours.filter(h=>{const hour=Number(h.time.slice(11,13));return hour>=7&&hour<=18;});
  el('forecastRows').innerHTML=light.map(h=>`<div class="forecast-chip"><strong>${formatHour(h.time)}</strong><small>UV ${Number.isFinite(h.uv)?round(h.uv,1):'—'} · ${Number.isFinite(h.feels)?round(h.feels)+'°C':'—'}</small><small>${Number.isFinite(h.humidity)?round(h.humidity)+'% RH':'RH —'}</small></div>`).join('');
}
function updateCityClock(){if(!city)return;el('cityClock').textContent=clockAt(city.tz);el('todayLabel').textContent=friendlyDate(city.tz);}
function setDayBtns(){document.querySelectorAll('.day-button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.day)===state.day));}

function todayFoodDate(){return isoDateAt(city.tz);}
function foodsToday(){return state.foods.filter(f=>f.date===todayFoodDate());}
function addFood(food,amount=1,method='NIH reference estimate'){
  if(!Number.isFinite(amount)||amount<=0||amount>100)return false;
  const iu=round(food.iu*amount,1);
  state.foods.unshift({id:`f_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date:todayFoodDate(),name:food.name,serving:food.serving,amount,iu,emoji:food.emoji,source:method});
  save();renderFood();return true;
}
function renderQuickFoods(){
  const common=['egg','milk','plantmilk','uvmushroom','salmon'];
  el('quickFoods').innerHTML=common.map(id=>{const f=FOODS.find(x=>x.id===id);return `<button type="button" class="quick-food" data-food="${id}">${f.emoji} ${escapeHTML(f.name.replace('Vitamin D-fortified dairy milk','Fortified milk'))} +</button>`;}).join('');
  el('quickFoods').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{const food=FOODS.find(f=>f.id===b.dataset.food);addFood(food);feedback('foodFeedback',`${food.name} added (${food.iu} IU reference estimate).`); }));
}
function parseQuantity(text,food){
  const m=text.match(/(?:^|\s)(\d+\s*\/\s*\d+|\d+(?:\.\d+)?|half|one|two|three|four)\s*(kg|grams?|g\b|cups?|ounces?|oz\b|servings?|pieces?|eggs?|sardines?)?/i);
  if(!m)return 1;let val;
  if(m[1].includes('/')){const [a,b]=m[1].split('/').map(Number);val=b?a/b:1;}
  else val=({'half':.5,'one':1,'two':2,'three':3,'four':4})[m[1].toLowerCase()]??Number(m[1]);
  const u=(m[2]||'').toLowerCase();
  if(!Number.isFinite(val)||val<=0)return NaN;
  if((u==='g'||u.startsWith('gram')||u==='kg')&&food.grams)return (u==='kg'?val*1000:val)/food.grams;
  if((u==='oz'||u.startsWith('ounce'))&&food.oz)return val/food.oz;
  if(u.startsWith('cup')&&food.cups)return val/food.cups;
  if((u.startsWith('sardine')||u.startsWith('piece'))&&food.items)return val/food.items;
  return val;
}
function feedback(id,text,isError=false){el(id).textContent=text;el(id).classList.toggle('error',isError);}
function addTextFood(e){
  e.preventDefault();const text=el('foodText').value.trim();if(!text){feedback('foodFeedback','Enter a food or use a quick-add button.',true);return;}
  const chunks=text.split(/\s*(?:,|\+|\band\b|\&)\s*/i).filter(Boolean);const matches=[],unknown=[];
  for(const chunk of chunks){const hit=FOOD_TERMS.find(({term})=>chunk.toLowerCase().includes(term));
    if(!hit){unknown.push(chunk);continue;}const qty=parseQuantity(chunk,hit.food);
    if(!Number.isFinite(qty)||qty<=0||qty>30){unknown.push(chunk+' (quantity unclear)');continue;}
    matches.push({food:hit.food,qty});
  }
  if(!matches.length){feedback('foodFeedback','No reliable food match. Try “2 eggs”, “1 cup fortified milk”, “85g salmon”, or a quick-add item.',true);return;}
  for(const {food,qty} of matches)addFood(food,qty);
  el('foodText').value='';feedback('foodFeedback',`${matches.length} food${matches.length!==1?'s':''} added as reference estimates.${unknown.length?' Could not identify: '+unknown.join(', ')+'.':''}`,!!unknown.length);
}
function renderFood(){
  const meals=foodsToday(),total=meals.reduce((sum,m)=>sum+Number(m.iu||0),0),pct=round(total/state.dailyTarget*100);
  el('foodTotal').textContent=fmtNum(round(total));el('foodPercent').textContent=pct+'%';el('foodCount').textContent=`${meals.length} entr${meals.length===1?'y':'ies'}`;
  el('foodDonut').style.background=`conic-gradient(#75a98b ${clamp(pct,0,100)*3.6}deg, #e4ede6 0deg)`;
  el('foodList').innerHTML=meals.length?meals.map(f=>`<div class="food-log-row"><div class="food-log-icon">${escapeHTML(f.emoji||'🍽')}</div><div class="food-log-title"><strong>${escapeHTML(f.name)}</strong><small>${round(f.amount,2)} × ${escapeHTML(f.serving)} · ${escapeHTML(f.source||'Estimate')}</small></div><div class="food-iu">${fmtNum(f.iu)} IU</div><button class="delete-food" data-delete="${escapeHTML(f.id)}" title="Remove item" aria-label="Remove ${escapeHTML(f.name)}">×</button></div>`).join(''):'<p class="empty-list">No meals logged today. Try adding an egg or fortified milk.</p>';
  el('foodList').querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{state.foods=state.foods.filter(f=>f.id!==b.dataset.delete);save();renderFood();}));
}
async function lookupBarcode(e){
  e.preventDefault();const barcode=el('barcodeInput').value.trim();const result=el('barcodeResult');
  if(!/^\d{8,14}$/.test(barcode)){result.textContent='Please enter a valid 8–14 digit barcode.';return;}
  result.textContent='Looking up product…';
  try{
    const p=await getJSON(`https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=code,product_name,nutriments,quantity`,undefined);
    if(p.status!==1||!p.product){result.textContent='Product not found. You can still log a known food manually.';return;}
    const product=p.product,name=product.product_name||`Product ${barcode}`;
    const n=product.nutriments||{},raw=n['vitamin-d_100g'];
    // Open Food Facts normalises vitamin quantities to grams per 100 g.
    const estimate=Number.isFinite(raw)&&raw>=0?round(raw*1e6,3):null;
    const plausible=estimate!==null&&estimate>=0&&estimate<=1000;
    result.innerHTML=`<div class="barcode-result-card"><strong>${escapeHTML(name)}</strong><p>${plausible?'Community database suggests '+escapeHTML(String(estimate))+' µg per 100g.':'Vitamin D not reported reliably for this product.'} Community values are hints only. Type the figure you see on the actual package label before adding.</p><label>Vitamin D on label (µg per 100 g) <input type="number" id="barcodeD" min="0" max="1000" step="0.01" value="" placeholder="Check label" /></label><label>Portion eaten (g) <input type="number" id="barcodeGrams" min="1" max="2000" step="1" value="100" /></label><br/><button type="button" class="secondary-button" id="addBarcode">Add verified amount</button><p>1 µg = 40 IU. Enter zero only if the label confirms it. This is not AI recognition.</p></div>`;
    el('addBarcode').addEventListener('click',()=>{
      const mcg=Number(el('barcodeD').value),g=Number(el('barcodeGrams').value);
      if(el('barcodeD').value===''||!Number.isFinite(mcg)||mcg<0||mcg>1000||!Number.isFinite(g)||g<1||g>2000){result.insertAdjacentHTML('beforeend','<p style="color:#b66d50">Check both quantities first.</p>');return;}
      const iu=round(mcg*40*g/100,1);
      state.foods.unshift({id:`f_${Date.now()}`,date:todayFoodDate(),name,serving:g+' g',amount:1,iu,emoji:'🧾',source:'User-entered product label estimate'});
      save();renderFood();result.textContent=`Added ${name}: ${iu} IU for ${g} g. Your food diary is updated.`;
    });
  }catch{result.textContent='Barcode lookup unavailable right now. Please check internet access or try later.';}
}


// Optional AI photo recognition. The API key is stored on a local server, never in browser JS.
async function checkPhotoAI(){
  try{
    // Static deployments still work for all other functionality.
    if(location.protocol==='file:'||location.protocol==='about:')throw new Error('static');
    const response=await fetch('/api/ai-status',{cache:'no-store'});
    if(!response.ok)throw new Error('backend');
    const data=await response.json();
    photoAiAvailable=!!data.enabled;
    el('photoAnalyseBtn').disabled=!photoAiAvailable||!el('photoConsent').checked;
    el('photoAIStatus').textContent=photoAiAvailable?'Photo AI connected. Tick the consent box, then select a photo to analyse.':'Photo AI is not configured on this website. The publisher must add GEMINI_API_KEY to the secure backend.';
  }catch{photoAiAvailable=false;el('photoAnalyseBtn').disabled=true;el('photoAIStatus').textContent='Photo AI requires a published secure backend and GEMINI_API_KEY. Text logging works now.';}
}
function onPhotoSelected(){
  const f=el('photoInput').files?.[0];
  el('photoResults').innerHTML='';
  if(photoObjectURL){URL.revokeObjectURL(photoObjectURL);photoObjectURL=null;}
  if(!f){el('photoPreview').innerHTML='';return;}
  if(f.size>6*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)){
    el('photoPreview').innerHTML='';el('photoAIStatus').textContent='Please choose a JPEG, PNG or WEBP smaller than 6 MB.';return;
  }
  photoObjectURL=URL.createObjectURL(f);
  const img=document.createElement('img');img.src=photoObjectURL;img.alt='Meal photo preview';el('photoPreview').replaceChildren(img);
  if(photoAiAvailable)el('photoAIStatus').textContent=el('photoConsent').checked?'Photo selected. Select Recognise foods to ask AI for suggestions.':'Photo selected. Tick the consent checkbox before sending.';
}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(new Error('Could not read photo'));r.onload=()=>resolve(String(r.result));r.readAsDataURL(file);});}
async function analysePhoto(){
  const file=el('photoInput').files?.[0];
  if(!photoAiAvailable){el('photoAIStatus').textContent='The photo AI backend is not configured.';return;}
  if(!el('photoConsent').checked){el('photoAIStatus').textContent='Please tick photo-sharing consent first.';return;}
  if(!file){el('photoAIStatus').textContent='Choose a food photo first.';return;}
  if(file.size>6*1024*1024){el('photoAIStatus').textContent='Choose a photo under 6 MB.';return;}
  el('photoAnalyseBtn').disabled=true;el('photoAIStatus').textContent='Asking the AI model to identify possible foods…';el('photoResults').innerHTML='';
  try{
    const dataURL=await resizedPhotoDataURL(file),base64=dataURL.split(',')[1];
    const response=await fetch('/api/analyse-food-photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mimeType:'image/jpeg',imageBase64:base64})});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Photo analysis failed');
    const findings=Array.isArray(payload.foods)?payload.foods.slice(0,8):[];
    if(!findings.length){el('photoAIStatus').textContent='AI could not identify supported foods. Please log your food manually.';return;}
    el('photoAIStatus').textContent='AI guesses are NOT preselected. Verify the food type and enter actual serving amounts before logging.';
    el('photoResults').innerHTML=findings.map((item,i)=>{
      const options=['<option value="unknown" selected>Choose verified food / skip</option>',...FOODS.map(f=>`<option value="${f.id}">${escapeHTML(f.name)} (${f.iu} IU / serving)</option>`)].join('');
      return `<div class="photo-result" data-ai-row="${i}"><span class="photo-result-label">AI suggestion: ${escapeHTML(item.label||'Uncertain food')} · ${escapeHTML(item.confidence||'uncertain')} confidence</span><select aria-label="Confirm food ${i+1}">${options}</select><input aria-label="Servings of food ${i+1}" type="number" min="0.1" max="30" step="0.1" placeholder="e.g. 1" title="Enter verified number of NIH reference servings" /><small>servings</small></div>`;
    }).join('')+'<button id="confirmPhotoFoods" type="button" class="primary-button photo-confirm">Add confirmed foods ↗</button>';
    el('confirmPhotoFoods').addEventListener('click',()=>{
      let count=0;
      for(const row of el('photoResults').querySelectorAll('[data-ai-row]')){
        const food=FOODS.find(f=>f.id===row.querySelector('select').value),servings=Number(row.querySelector('input').value);
        if(food&&Number.isFinite(servings)&&servings>0&&servings<=30){if(addFood(food,servings,'Photo suggestion · user-confirmed NIH reference estimate'))count++;}
      }
      el('photoResults').innerHTML='';el('photoAIStatus').textContent=count?`${count} confirmed food(s) added as approximate vitamin D values.`:'Nothing added. Select a matching food and a realistic serving amount.';
    });
  }catch(e){el('photoAIStatus').textContent=`Photo analysis unavailable: ${String(e.message).slice(0,130)}. Use the text logger instead.`;}
  finally{el('photoAnalyseBtn').disabled=!photoAiAvailable||!el('photoConsent').checked;}
}

function logSleep(e){
  e.preventDefault();const date=el('sleepDate').value,bed=el('bedtime').value,wake=el('wakeTime').value;
  if(!date||!bed||!wake){feedback('sleepFeedback','Please enter a date and both times.',true);return;}
  // For a given wake date, bedtime is presumed to be on the preceding evening.
  let mins=timeToMinutes(wake)-timeToMinutes(bed);if(mins<=0)mins+=24*60;
  if(mins<60||mins>16*60){feedback('sleepFeedback','Enter a realistic sleep period (1 to 16 hours).',true);return;}
  const existing=state.sleeps.findIndex(s=>s.date===date);
  const entry={date,bed,wake,minutes:mins};if(existing>=0)state.sleeps.splice(existing,1);
  state.sleeps.unshift(entry);state.sleeps.sort((a,b)=>b.date.localeCompare(a.date));state.sleeps=state.sleeps.slice(0,100);
  save();renderSleep();renderRoutine();renderPlanner();feedback('sleepFeedback',`Saved ${durationText(mins)} of sleep, waking at ${wake}.`);
}
function renderSleep(){
  const entries=state.sleeps;
  if(entries.length){const last=entries[0];el('lastSleep').textContent=durationText(last.minutes);el('lastSleepDetail').textContent=`Woke ${last.date} at ${last.wake}`;}
  else{el('lastSleep').textContent='—';el('lastSleepDetail').textContent='No sleep logged yet';}
  const recent=entries.slice(0,7).sort((a,b)=>a.date.localeCompare(b.date)),avg=recent.length?recent.reduce((a,b)=>a+b.minutes,0)/recent.length:0;
  el('sleepAverage').textContent=recent.length?`Average: ${durationText(Math.round(avg))}`:'Average: —';
  if(!recent.length){el('sleepChart').innerHTML='<div class="empty-forecast" style="margin:auto;font-size:11px">Your sleep trend will appear after your first entry.</div>';return;}
  el('sleepChart').innerHTML=recent.map(s=>{
    const height=clamp(s.minutes/(11*60)*83,5,83),goal=s.minutes>=state.sleepGoal*60;
    const day=new Date(s.date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});
    return `<div class="sleep-chart-col" title="${escapeHTML(s.date)}: ${durationText(s.minutes)}"><strong>${durationText(s.minutes)}</strong><div class="sleep-bar ${goal?'goal':''}" style="height:${height}px"></div><strong>${day}</strong></div>`;
  }).join('');
}

function startOfWeekISO(dateStr){
  const d=new Date(dateStr+'T12:00:00Z');
  const shift=(d.getUTCDay()+6)%7;
  d.setUTCDate(d.getUTCDate()-shift);
  return d.toISOString().slice(0,10);
}
function weekCount(){
  const today=isoDateAt(city.tz),week=startOfWeekISO(today);
  return new Set((state.outdoorDays||[]).filter(d=>typeof d==='string'&&d>=week&&d<=today)).size;
}
function markOutdoorDay(){
  const today=isoDateAt(city.tz);
  state.outdoorDays=Array.isArray(state.outdoorDays)?state.outdoorDays:[];
  if(state.outdoorDays.includes(today)){
    state.outdoorDays=state.outdoorDays.filter(x=>x!==today);
    el('outdoorFeedback').textContent='Today was unmarked. Only completed outdoor breaks count.';
  }else{
    state.outdoorDays.push(today);
    el('outdoorFeedback').textContent='Great — your protected outdoor break has been marked as completed.';
  }
  state.outdoorDays=state.outdoorDays.slice(-370);save();renderRoutine();
}
function to12(total){const n=(total+1440)%1440;const h=Math.floor(n/60),m=n%60;return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;}
function renderRoutine(){
  if(!city)return;
  const wake=/^([01]\d|2[0-3]):[0-5]\d$/.test(state.plannedWake)?state.plannedWake:'07:00';
  const bedtime=timeToMinutes(wake)-Number(state.sleepGoal)*60;
  const teen=state.ageGroup==='teen',goal=Number(state.sleepGoal),range=teen?'8–10 hours':'7–9 hours';
  el('bedtimeAdvice').textContent=`To wake at ${to12(timeToMinutes(wake))} after ${goal} hours in bed, plan bedtime near ${to12(bedtime)}. ${range} of sleep is generally recommended for ${teen?'teens':'adults'}.${teen&&goal<8?' Increase your goal to at least 8 hours.':''} Actual sleep can differ from time in bed.`;
  const count=weekCount(),target=Number(state.weeklyGoal)||3;
  el('weeklyProgress').textContent=`${count} of ${target} planned days this week`;
  el('weeklyMeterFill').style.width=clamp(count/target*100,0,100)+'%';
  const completed=(state.outdoorDays||[]).includes(isoDateAt(city.tz));
  el('markOutdoorBtn').textContent=completed?'✓ Break logged today · Undo':'Mark today’s completed break ✓';
  const steps=[];
  const today=dayData(0),tomorrow=dayData(1);
  if(!forecast||!dataFresh||!forecast.uvAvailable){
    steps.push(['Check the live forecast','An updated UV, heat and humidity reading is needed before we can recommend any outdoor time.']);
    steps.push(['Keep your sleep schedule',`If waking around ${to12(timeToMinutes(wake))}, aim to be in bed around ${to12(bedtime)} for your ${goal}-hour sleep goal.`]);
    steps.push(['Have a backup','If outdoor conditions are unsafe, choose a comfortable indoor activity, then try another forecast day.']);
  }else{
    const todaySlots=today?getSlots(today):[];
    const tomorrowSlots=tomorrow?getSlots(tomorrow):[];
    if(todaySlots.length){
      const best=todaySlots[0];
      steps.push(['A realistic window today',`${hourRange(best.time)} is the highest-ranked available forecast hour. Try a ${state.outdoorMinutes}-minute break within it if conditions remain suitable; use shade and sun protection at UV 3+. `]);
    }else if(tomorrowSlots.length){
      steps.push(['Prepare for tomorrow',`${hourRange(tomorrowSlots[0].time)} is a possible tomorrow window after your planned wake-up. Check the refreshed forecast before heading out.`]);
    }else{
      steps.push(['Conditions first','No forecast hour matches your current UV, heat and humidity limits. Do not chase peak UV; try an indoor activity and check tomorrow.']);
    }
    if(tomorrowSlots.length){
      const h=tomorrowSlots[0];
      steps.push(['Plan around sleep',`Tomorrow’s possible ${hourRange(h.time)} slot is after your usual ${to12(timeToMinutes(wake))} wake-up. Aim for bedtime around ${to12(bedtime)} rather than losing sleep for an early slot.`]);
    }else{
      steps.push(['Sleep remains the priority',`Aim for ${goal} hours in bed before your planned ${to12(timeToMinutes(wake))} wake-up. No need to wake up earlier to meet an outdoor goal.`]);
    }
    steps.push([completed?'Keep a balanced week':'Make a small commitment',completed?`Today is logged. You've completed ${count} of ${target} days this week.`:`Choose a protected ${state.outdoorMinutes}-minute outdoor break when conditions are suitable. Check it off only after you've completed it.`]);
  }
  const actionable=(dataFresh&&forecast?.uvAvailable)?[...(today?getSlots(today):[]),...(tomorrow?getSlots(tomorrow):[])]:[];
  const calendarButton=el('calendarBtn');calendarButton.disabled=!actionable.length;
  calendarButton.dataset.slot=actionable.length?actionable[0].time:'';
  el('proactiveSteps').innerHTML=steps.map((s,i)=>`<div class="proactive-step"><span>${i+1}</span><div><strong>${escapeHTML(s[0])}</strong><p>${escapeHTML(s[1])}</p></div></div>`).join('');
}

function downloadCalendarEvent(){
  const iso=el('calendarBtn').dataset.slot;
  if(!dataFresh||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso))return;
  const [datePart,timePart]=iso.split('T');
  const [year,month,day]=datePart.split('-').map(Number);
  const [hour,min]=timePart.split(':').map(Number);
  // All cities in this app observe year-round UTC+3 or UTC+4 (no DST).
  const offset=(city.tz==='Asia/Dubai'||city.tz==='Asia/Muscat')?4:3;
  const start=new Date(Date.UTC(year,month-1,day,hour-offset,min));
  const end=new Date(start.getTime()+(Number(state.outdoorMinutes)||15)*60000);
  const asICS=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const description='Check the refreshed forecast just before leaving. Use shade, sunscreen and protective clothing when UV is 3 or more. This is a protected outdoor activity break, not a vitamin D treatment.';
  const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SunWise Gulf//Outdoor Routine//EN','BEGIN:VEVENT',
    'UID:'+Date.now()+'@sunwise-gulf.local','DTSTAMP:'+asICS(new Date()),
    'DTSTART:'+asICS(start),'DTEND:'+asICS(end),
    'SUMMARY:SunWise protected outdoor break',
    'DESCRIPTION:'+description,'LOCATION:'+city.name+', Gulf','END:VEVENT','END:VCALENDAR'].join('\r\n');
  const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`sunwise-break-${datePart}.ics`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function resizedPhotoDataURL(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(),url=URL.createObjectURL(file);
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read the selected photo'));};
    img.onload=()=>{
      try{
        const scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const data=canvas.toDataURL('image/jpeg',0.76);
        URL.revokeObjectURL(url);
        if(data.length>3.6*1024*1024)reject(new Error('Photo is too large after resizing'));else resolve(data);
      }catch(e){URL.revokeObjectURL(url);reject(e);}
    };
    img.src=url;
  });
}

function exportDiary(){
  const data={app:'SunWise Gulf',exportedAt:new Date().toISOString(),country:state.country,city:state.city,sleepGoalHours:state.sleepGoal,plannedWake:state.plannedWake,weeklyGoalDays:state.weeklyGoal,outdoorMinutes:state.outdoorMinutes,outdoorDays:state.outdoorDays,dailyVitaminDReferenceIU:state.dailyTarget,foods:state.foods,sleeps:state.sleeps};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=`sunwise-diary-${isoDateAt(city.tz)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}

init();

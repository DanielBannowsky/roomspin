"use strict";
/* ============================ logic ============================ */

const roomById = id => store.rooms.find(r=>r.id===id) || null;

/* Edit stamps for the shared-house merge. Every mutation records *when*, so two devices can
   later be reconciled field by field instead of one clobbering the other wholesale. Cheap
   enough to do unconditionally, and it keeps the merge honest even for edits made offline or
   before sync was ever switched on. */
/* Hybrid logical clock rather than a bare Date.now(). Two phones never agree on the time —
   a few minutes of skew is normal — and with raw wall-clock stamps the phone whose clock runs
   fast wins every conflict until the other catches up, silently reverting genuinely later
   edits. Here each stamp is forced to exceed every stamp this device has *seen*, including
   ones that arrived from the other device, so "happened after I saw your change" always beats
   "my clock says earlier". Falls back to wall-clock time whenever that is already ahead, so
   stamps stay human-readable and roughly correct. */
function stamp(){
  const t=Math.max(Date.now(), (store.clock||0)+1);
  store.clock=t;
  return t;
}
function touchRoom(r){ if(r) r.updatedAt=stamp(); }
function touchWeek(){ store.weekUpdatedAt=stamp(); }
function touchSettings(){ store.settingsUpdatedAt=stamp(); }
function buryRoom(id){ store.graveyard.rooms[id]=stamp(); }
function buryTask(id){ store.graveyard.tasks[id]=stamp(); }
const activeRooms = () => store.rooms.filter(r=>!r.snoozed);

/* ---- weighting ----
   weight = (11 - rating) ** bias. The 11 (rather than 10) matters: it keeps a perfect 10/10
   room at weight 1 instead of 0, so a finished room still comes up occasionally rather than
   dropping out of the house entirely — a 10 today drifts back to a 9 in a year, and the spin
   should be able to catch that. Rooms explicitly snoozed are the way to remove something from
   the pool; a high rating is not. */
function roomWeight(room){
  const bias=store.settings.bias ?? 2;
  // Fractional ratings feed straight in — a 6.5 sits properly between a 6 and a 7 on the
  // wheel rather than being rounded to one of them.
  return Math.pow(11 - clamp(room.rating,0,10), bias);
}
/* Odds for every room in the pool, biggest share first. `pool` defaults to whatever the next
   spin would actually draw from (so it reflects the avoid-repeat exclusion), which is what
   makes the odds table on the Spin tab honest rather than theoretical. */
function spinOdds(pool){
  const rooms = pool || spinPool();
  const weights = rooms.map(roomWeight);
  const total = weights.reduce((a,b)=>a+b,0);
  return rooms.map((r,i)=>({room:r, weight:weights[i], p: total>0 ? weights[i]/total : 0}))
              .sort((a,b)=> b.p-a.p || a.room.name.localeCompare(b.room.name));
}
/* The set a spin draws from: active rooms, minus last week's room when avoidRepeat is on —
   but only if excluding it would still leave something to spin. With two rooms in the house
   (or one), skipping the repeat would leave an empty pool, so the guard falls back to the
   full active list rather than failing. */
function spinPool(){
  const act=activeRooms();
  if(!store.settings.avoidRepeat) return act;
  const last=store.history[0]?.roomId ?? store.week?.roomId;
  if(!last) return act;
  const filtered=act.filter(r=>r.id!==last);
  return filtered.length ? filtered : act;
}
/* Weighted pick over spinPool(). Straight cumulative-weight walk on Math.random(); the
   floating-point tail (random() landing past the last cumulative bucket by an epsilon) is
   covered by returning the final room rather than undefined. */
function pickWeighted(){
  const pool=spinPool();
  if(!pool.length) return null;
  const weights=pool.map(roomWeight);
  const total=weights.reduce((a,b)=>a+b,0);
  if(total<=0) return pool[Math.floor(Math.random()*pool.length)];
  let t=Math.random()*total;
  for(let i=0;i<pool.length;i++){ t-=weights[i]; if(t<=0) return pool[i]; }
  return pool[pool.length-1];
}

/* ---- week lifecycle ---- */
function startWeek(room){
  const start=todayStr();
  store.week={
    id:uid(), roomId:room.id, startDate:start,
    endDate:addDays(start,(store.settings.weekLength||7)),
    startRating:room.rating, spunAt:new Date().toISOString(),
  };
  touchWeek();
  save();
}
/* Closes out the active week into history and records the new rating on the room. Task state
   is deliberately left alone: a checklist item finished this week stays checked so the room's
   list keeps reading as a record of what's actually done, and the week's history row snapshots
   the counts at close so later edits to the list can't rewrite the past. */
function endWeek(newRating){
  const w=store.week; if(!w) return;
  const room=roomById(w.roomId);
  const tasks=room?.tasks||[];
  const doneThisWeek=tasks.filter(t=>t.done && t.doneAt && t.doneAt>=w.startDate).length;
  store.history.unshift({
    id:w.id, roomId:w.roomId, roomName:room?room.name:"(deleted room)",
    startDate:w.startDate, endDate:todayStr(),
    startRating:w.startRating, endRating:newRating,
    tasksDone:doneThisWeek, tasksTotal:tasks.length,
  });
  if(room) setRating(room, newRating);
  store.week=null;
  touchWeek();
  save();
}
const weekDaysLeft = () => store.week ? dayDiff(store.week.endDate, todayStr()) : 0;
const weekIsOver = () => store.week ? weekDaysLeft() <= 0 : false;

/* ---- rooms ---- */
function addRoom(name){
  const n=name.trim(); if(!n) return null;
  const room={id:uid(), name:n, rating:5, tasks:[], notes:"",
    snoozed:false, createdAt:todayStr(), ratingLog:[{date:todayStr(), rating:5}], updatedAt:stamp()};
  store.rooms.push(room); save(); return room;
}
function deleteRoom(id){
  store.rooms=store.rooms.filter(r=>r.id!==id);
  buryRoom(id);
  if(store.week?.roomId===id){ store.week=null; touchWeek(); }   // don't strand the week
  save();
}
/* Records a rating change on the room's own log as well as the room, but only one entry per
   calendar date — re-tapping the stepper five times in a row should leave one point on the
   trend line for today, not five. */
function setRating(room,val){
  const r=snapRating(val);
  room.rating=r;
  room.ratingLog=room.ratingLog||[];
  const today=todayStr();
  const last=room.ratingLog[room.ratingLog.length-1];
  if(last && last.date===today) last.rating=r;
  else room.ratingLog.push({date:today, rating:r});
  touchRoom(room);
  save();
}
function addTask(room,text){
  const t=text.trim(); if(!t) return;
  room.tasks=room.tasks||[];
  room.tasks.push({id:uid(), text:t, done:false, doneAt:null, createdAt:todayStr(), updatedAt:stamp()});
  save();
}
function toggleTask(room,taskId){
  const t=(room.tasks||[]).find(x=>x.id===taskId); if(!t) return;
  t.done=!t.done;
  t.doneAt=t.done?todayStr():null;
  t.updatedAt=stamp();
  save();
}
function deleteTask(room,taskId){
  room.tasks=(room.tasks||[]).filter(t=>t.id!==taskId);
  buryTask(taskId);
  save();
}
const openTasks = room => (room.tasks||[]).filter(t=>!t.done).length;
const doneTasks = room => (room.tasks||[]).filter(t=>t.done).length;

/* ---- house-level stats ---- */
function houseScore(){
  const rooms=store.rooms;
  if(!rooms.length) return null;
  const sum=rooms.reduce((a,r)=>a+r.rating,0);
  return sum/rooms.length;
}
/* House average as of a past date, computed by replaying each room's ratingLog — a room that
   didn't exist yet on that date is left out of the average entirely rather than counted as a
   0, so adding a room later doesn't retroactively crater the history. */
function houseScoreOn(date){
  const vals=[];
  store.rooms.forEach(r=>{
    const log=r.ratingLog||[];
    let v=null;
    for(const e of log){ if(e.date<=date) v=e.rating; else break; }
    if(v!=null) vals.push(v);
  });
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
/* Distinct dates on which any room's rating moved, oldest first — the x-axis for the house
   trend chart. Capped to the most recent 40 so a long-running house doesn't render a chart
   with 300 unreadable points. */
function houseTrendDates(){
  const set=new Set();
  store.rooms.forEach(r=>(r.ratingLog||[]).forEach(e=>set.add(e.date)));
  return [...set].sort().slice(-40);
}
const totalOpenTasks = () => store.rooms.reduce((a,r)=>a+openTasks(r),0);

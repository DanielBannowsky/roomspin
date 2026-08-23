"use strict";
/* ============================ state ============================ */
let store, saveError=false, loadError=false;

/* Everything transient lives here rather than in `store`, so nothing view-only (an open room,
   a half-typed task, a spin animation frame) is ever written to localStorage. */
const ui = {
  tab:"rooms",
  openRoomId:null,        // Rooms tab drills into a single room when set
  taskDraft:{},           // roomId -> in-progress "add task" text, kept across re-renders
  newRoomText:"",
  confirmDelRoom:null,
  confirmDelTask:null,
  spin:null,              // {phase:"idle"|"spinning"|"landed", cursor, resultId}
  oddsOpen:false,
  endWeekOpen:false,
  endWeekRating:null,
  copied:false, backed:false,
  pendingImport:null, importError:null,
  resetConfirm:false,
  syncDraft:null,
  flash:null,
};

/* DEFAULTS is a module-level literal, so anything that hands out a piece of it by reference
   hands out shared mutable state: store.rooms would *be* DEFAULTS.rooms, and seeding or
   closing out a week would quietly rewrite the defaults for the rest of the session. (That is
   exactly what made "Reset all data" hand back 30 rooms instead of 15 — reset cloned a
   DEFAULTS that the first seed had already pushed 15 rooms into.) Every entry point that
   starts from DEFAULTS goes through here. */
function freshDefaults(){ return JSON.parse(JSON.stringify(DEFAULTS)); }

function deepMerge(base,override){
  const out={...base};
  for(const k in override){
    const bv=base[k], ov=override[k];
    if(ov && typeof ov==="object" && !Array.isArray(ov) && bv && typeof bv==="object" && !Array.isArray(bv)) out[k]=deepMerge(bv,ov);
    else out[k]=ov;
  }
  return out;
}
function load(){
  const raw=localStorage.getItem(KEY);
  try{
    store=deepMerge(freshDefaults(), raw?JSON.parse(raw):{});
  }catch{
    // Preserve the unreadable data under a separate key instead of silently discarding it —
    // a corrupt blob can still be hand-recovered, a deleted one can't.
    try{ if(raw) localStorage.setItem(KEY+"-corrupt-backup", raw); }catch{}
    store=freshDefaults();
    loadError=true;
  }
  normalizeStore();
  if(!store.seeded && !store.rooms.length) seedRooms();
}
/* Coerces whatever came out of storage (or off the sync backend, or a hand-edited backup)
   into the shape the rest of the app assumes. Shared by load() and by the sync merge, so a
   malformed remote file can't put the app into a state local loading would have rejected. */
function normalizeStore(){
  if(!Array.isArray(store.rooms)) store.rooms=[];
  if(!Array.isArray(store.history)) store.history=[];
  if(!store.graveyard || typeof store.graveyard!=="object") store.graveyard={rooms:{},tasks:{}};
  if(!store.graveyard.rooms) store.graveyard.rooms={};
  if(!store.graveyard.tasks) store.graveyard.tasks={};
  store.rooms.forEach(r=>{
    if(!Array.isArray(r.tasks)) r.tasks=[];
    if(!Array.isArray(r.ratingLog)) r.ratingLog=[{date:r.createdAt||todayStr(), rating:r.rating??5}];
    r.rating=snapRating(r.rating);
    // Rooms and tasks written before sync existed have no stamp; treat them as oldest-known
    // rather than newest, so a genuine edit on the other device always wins over dormant data.
    if(typeof r.updatedAt!=="number") r.updatedAt=0;
    r.tasks.forEach(t=>{ if(typeof t.updatedAt!=="number") t.updatedAt=0; });
  });
  if(store.week && !roomById(store.week.roomId)) store.week=null;   // room deleted out from under it
  // The clock must never sit below a stamp we already hold, or the next edit would be issued
  // "before" data we are already showing.
  let hi=Number(store.clock)||0;
  store.rooms.forEach(r=>{
    hi=Math.max(hi, r.updatedAt||0);
    (r.tasks||[]).forEach(t=>{ hi=Math.max(hi, t.updatedAt||0); });
  });
  store.clock=Math.max(hi, store.settingsUpdatedAt||0, store.weekUpdatedAt||0);
}

/* First-run seed. Marked with a `seeded` flag rather than keyed off an empty room list, so a
   user who deliberately deletes every room doesn't get the starter set pushed back at them. */
function seedRooms(){
  STARTER_ROOMS.forEach(n=>{
    store.rooms.push({id:uid(), name:n, rating:5, tasks:[], notes:"",
      snoozed:false, createdAt:todayStr(), ratingLog:[{date:todayStr(), rating:5}], updatedAt:0});
  });
  store.seeded=true;
  save();
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(store)); saveError=false; }
  catch{ saveError=true; }
  // Single hook for the shared house: every mutation in the app already ends in save(), so
  // nothing has to remember to trigger a push. No-ops entirely when sync is switched off.
  if(typeof scheduleSync==="function") scheduleSync();
}
/* Short-lived confirmation banner ("Saved", "Copied") — one at a time, cleared on a timer. */
let flashHandle=null;
function flash(msg){
  ui.flash=msg;
  clearTimeout(flashHandle);
  flashHandle=setTimeout(()=>{ ui.flash=null; render(); },1800);
}

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
  // Arrays don't survive deepMerge from a partial object cleanly if the stored value is the
  // wrong type (hand-edited JSON, a truncated import), so normalise the collections here.
  if(!Array.isArray(store.rooms)) store.rooms=[];
  if(!Array.isArray(store.history)) store.history=[];
  store.rooms.forEach(r=>{
    if(!Array.isArray(r.tasks)) r.tasks=[];
    if(!Array.isArray(r.ratingLog)) r.ratingLog=[{date:r.createdAt||todayStr(), rating:r.rating??5}];
    r.rating=snapRating(r.rating);
  });
  if(store.week && !roomById(store.week.roomId)) store.week=null;   // room deleted out from under it
  if(!store.seeded && !store.rooms.length) seedRooms();
}
/* First-run seed. Marked with a `seeded` flag rather than keyed off an empty room list, so a
   user who deliberately deletes every room doesn't get the starter set pushed back at them. */
function seedRooms(){
  STARTER_ROOMS.forEach(n=>{
    store.rooms.push({id:uid(), name:n, rating:5, tasks:[], notes:"",
      snoozed:false, createdAt:todayStr(), ratingLog:[{date:todayStr(), rating:5}]});
  });
  store.seeded=true;
  save();
}
function save(){
  try{ localStorage.setItem(KEY, JSON.stringify(store)); saveError=false; }
  catch{ saveError=true; }
}
/* Short-lived confirmation banner ("Saved", "Copied") — one at a time, cleared on a timer. */
let flashHandle=null;
function flash(msg){
  ui.flash=msg;
  clearTimeout(flashHandle);
  flashHandle=setTimeout(()=>{ ui.flash=null; render(); },1800);
}

"use strict";
/* ============================ sync ============================
   Shared house, stored as one JSON file in a PRIVATE GitHub repo and reached through the
   contents API. Chosen over a hosted database because it adds no new service, no server, and
   no third-party JavaScript: every write is an ordinary commit, so the shared house also gets
   a free, complete version history you can browse and revert on github.com.

   The token never leaves the device. It lives under its own localStorage key, deliberately
   NOT inside `store` — `store` is what the Data tab serialises into a downloadable backup,
   and a token has no business travelling in a file you might text to someone.

   Merging is per-field rather than last-writer-takes-the-document: two people editing the
   same house on the same evening is the normal case here, not the exception, and losing a
   ticked checkbox because the other person re-rated a room would make the sync worse than
   no sync at all. Every room and every task carries its own `updatedAt`, deletions leave
   tombstones, and the merge is a pure function so the test harness can drive it directly. */

const SYNC_KEY = KEY + "-sync";
const SYNC_DEBOUNCE = 1600;      // ms of quiet after an edit before a push is attempted
const GRAVE_TTL = 120*24*3600*1000;   // tombstones expire after 120 days

/* Transient sync status, mirrored into the header. Not persisted: a failure should not
   survive a reload, since the next boot re-attempts the pull anyway. */
const sync = { status:"idle", detail:"", busy:false, applyingRemote:false, timer:null };

/* ---- config ---- */
function syncConfig(){
  try{ return JSON.parse(localStorage.getItem(SYNC_KEY)) || null; }catch{ return null; }
}
function saveSyncConfig(c){
  try{ localStorage.setItem(SYNC_KEY, JSON.stringify(c)); }catch{}
}
function clearSyncConfig(){
  try{ localStorage.removeItem(SYNC_KEY); }catch{}
}
const isSynced = () => { const c=syncConfig(); return !!(c && c.token && c.owner && c.repo); };

/* ---- base64 that survives non-ASCII ----
   Room names and notes are free text, so btoa() on a raw string throws the moment someone
   types an emoji or an accented character. Round-tripping through UTF-8 bytes avoids that.
   GitHub also returns base64 wrapped across lines, hence the whitespace strip. */
function b64encode(str){
  const bytes=new TextEncoder().encode(str);
  let bin=""; bytes.forEach(b=>{ bin+=String.fromCharCode(b); });
  return btoa(bin);
}
function b64decode(b64){
  const bin=atob(String(b64).replace(/\s+/g,""));
  return new TextDecoder().decode(Uint8Array.from(bin, c=>c.charCodeAt(0)));
}

/* ---- GitHub contents API ---- */
function ghUrl(c){
  return `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split("/").map(encodeURIComponent).join("/")}`;
}
function ghHeaders(c){
  return { "Authorization":`Bearer ${c.token}`, "Accept":"application/vnd.github+json",
           "X-GitHub-Api-Version":"2022-11-28" };
}
/* Reads the shared file. A 404 is not an error here — it just means this is the first sync
   and the file has yet to be created, so it resolves to an empty slot with no sha. */
async function ghRead(c){
  const res=await fetch(`${ghUrl(c)}?ref=${encodeURIComponent(c.branch||"main")}&t=${Date.now()}`,
    { headers:ghHeaders(c), cache:"no-store" });
  if(res.status===404) return { data:null, sha:null };
  if(!res.ok) throw new Error(await ghError(res));
  const json=await res.json();
  let data=null;
  try{ data=JSON.parse(b64decode(json.content)); }
  catch{ throw new Error("The shared file exists but isn't readable JSON."); }
  return { data, sha:json.sha };
}
async function ghWrite(c, data, sha){
  const res=await fetch(ghUrl(c), {
    method:"PUT", headers:{...ghHeaders(c), "Content-Type":"application/json"},
    body:JSON.stringify({
      message:`Roomspin: ${todayStr()} update`,
      content:b64encode(JSON.stringify(data,null,2)),
      branch:c.branch||"main",
      ...(sha?{sha}:{}),
    }),
  });
  if(res.status===409 || res.status===422) return { conflict:true };
  if(!res.ok) throw new Error(await ghError(res));
  const json=await res.json();
  return { sha:json.content && json.content.sha };
}
/* Turn GitHub's error shapes into something a person can act on, since the usual causes
   (expired token, wrong repo name, token not granted to this repo) all look identical
   otherwise. */
async function ghError(res){
  let msg="";
  try{ msg=(await res.json()).message||""; }catch{}
  if(res.status===401) return "That token was rejected — it may have expired or been revoked.";
  if(res.status===403) return "GitHub refused the request. Check the token has Contents: Read and write on this repo.";
  if(res.status===404) return "Repo or path not found. Check owner/repo, and that the token grants access to that repo.";
  return `GitHub error ${res.status}${msg?": "+msg:""}`;
}

/* ---- merge ----
   Pure: no globals, no I/O. Given two versions of the house it returns the union, resolving
   each field independently by whichever side touched it last. */
function mergeStores(local, remote){
  if(!remote) return local;
  if(!local) return remote;
  const now=Date.now();
  const grave=mergeGraveyard(local.graveyard, remote.graveyard, now);

  const settingsNewer = (local.settingsUpdatedAt||0) >= (remote.settingsUpdatedAt||0);
  const weekNewer     = (local.weekUpdatedAt||0)     >= (remote.weekUpdatedAt||0);

  const out={
    version:1,
    seeded: !!(local.seeded || remote.seeded),
    settings: {...DEFAULTS.settings, ...(settingsNewer?local.settings:remote.settings)},
    settingsUpdatedAt: Math.max(local.settingsUpdatedAt||0, remote.settingsUpdatedAt||0),
    week: weekNewer ? local.week : remote.week,
    weekUpdatedAt: Math.max(local.weekUpdatedAt||0, remote.weekUpdatedAt||0),
    graveyard: grave,
    rooms: mergeRooms(local.rooms, remote.rooms, grave),
    // History rows are immutable once written, so a union by id is the whole story.
    history: mergeById(local.history, remote.history)
               .sort((a,b)=> (a.endDate<b.endDate?1:a.endDate>b.endDate?-1:0)),
  };
  // A week pointing at a room that the other device deleted would strand the Job tab.
  if(out.week && !out.rooms.some(r=>r.id===out.week.roomId)) out.week=null;
  // Advance the logical clock past everything either side has seen, so the next edit made on
  // this device outranks anything that arrived in this merge regardless of clock skew.
  let hi=Math.max(local.clock||0, remote.clock||0, out.settingsUpdatedAt||0, out.weekUpdatedAt||0);
  out.rooms.forEach(r=>{
    hi=Math.max(hi, r.updatedAt||0);
    (r.tasks||[]).forEach(t=>{ hi=Math.max(hi, t.updatedAt||0); });
  });
  Object.values(out.graveyard.rooms).forEach(t=>{ hi=Math.max(hi,t); });
  Object.values(out.graveyard.tasks).forEach(t=>{ hi=Math.max(hi,t); });
  out.clock=hi;
  return out;
}
function mergeGraveyard(a,b,now){
  const out={rooms:{}, tasks:{}};
  ["rooms","tasks"].forEach(k=>{
    const src={...((a&&a[k])||{}), ...((b&&b[k])||{})};
    Object.keys(src).forEach(id=>{
      const ts=Math.max(((a&&a[k])||{})[id]||0, ((b&&b[k])||{})[id]||0);
      // Prune ancient tombstones so the file doesn't grow without bound. Anything older than
      // the TTL has long since propagated to both devices.
      if(now-ts < GRAVE_TTL) out[k][id]=ts;
    });
  });
  return out;
}
const indexById = arr => { const m={}; (arr||[]).forEach(x=>{ if(x&&x.id) m[x.id]=x; }); return m; };
function mergeById(a,b){
  const m={...indexById(b), ...indexById(a)};
  return Object.values(m);
}
function mergeRooms(a,b,grave){
  const L=indexById(a), R=indexById(b);
  const ids=new Set([...Object.keys(L),...Object.keys(R)]);
  const out=[];
  ids.forEach(id=>{
    const l=L[id], r=R[id], dead=grave.rooms[id]||0;
    if(l&&r){ const m=mergeRoom(l,r,grave); if(!(dead > (m.updatedAt||0))) out.push(m); return; }
    const only=l||r;
    // Present on one side only: either the other device hasn't seen it yet, or it deleted it.
    // The tombstone wins only if the deletion happened after the surviving copy's last edit —
    // otherwise someone edited it back into existence and that edit is the later intent.
    if(dead > (only.updatedAt||0)) return;
    out.push(cleanRoom(only, grave));
  });
  return out;
}
function mergeRoom(l,r,grave){
  const base = (l.updatedAt||0) >= (r.updatedAt||0) ? l : r;
  return {
    ...base,
    updatedAt: Math.max(l.updatedAt||0, r.updatedAt||0),
    tasks: mergeTasks(l.tasks, r.tasks, grave),
    ratingLog: mergeRatingLog(l, r),
  };
}
function cleanRoom(room,grave){
  return {...room, tasks:(room.tasks||[]).filter(t=>!(grave.tasks[t.id] > (t.updatedAt||0)))};
}
function mergeTasks(a,b,grave){
  const L=indexById(a), R=indexById(b);
  const ids=new Set([...Object.keys(L),...Object.keys(R)]);
  const out=[];
  ids.forEach(id=>{
    const l=L[id], r=R[id];
    const t = (l&&r) ? (((l.updatedAt||0) >= (r.updatedAt||0)) ? l : r) : (l||r);
    if((grave.tasks[id]||0) > (t.updatedAt||0)) return;
    out.push(t);
  });
  // Stable order: creation date, then id, so the list doesn't reshuffle after every sync.
  return out.sort((x,y)=> (x.createdAt||"")<(y.createdAt||"")?-1:(x.createdAt||"")>(y.createdAt||"")?1:(x.id<y.id?-1:1));
}
/* One rating per calendar date. When both devices logged the same date, the room with the
   later updatedAt is the one that spoke last. */
function mergeRatingLog(l,r){
  const first = (l.updatedAt||0) >= (r.updatedAt||0) ? r : l;   // older applied first
  const last  = first===l ? r : l;
  const m={};
  (first.ratingLog||[]).forEach(e=>{ if(e&&e.date) m[e.date]=e; });
  (last.ratingLog||[]).forEach(e=>{ if(e&&e.date) m[e.date]=e; });
  return Object.values(m).sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
}

/* ---- the sync cycle ----
   One operation does both directions: read the shared file, merge it with what's on this
   device, write the result back. That keeps pull and push from ever disagreeing about what
   "current" means, and makes an offline edit followed by a reconnect behave correctly. */
async function syncNow(opts){
  const c=syncConfig();
  if(!c || sync.busy) return;
  if(!navigator.onLine){ setSyncStatus("offline","Offline — will sync when you're back."); return; }
  sync.busy=true;
  setSyncStatus("syncing","Syncing…");
  try{
    let attempt=0, done=false;
    while(attempt<2 && !done){
      attempt++;
      const {data:remote, sha}=await ghRead(c);
      const merged=mergeStores(stripRuntime(store), remote);
      const res=await ghWrite(c, merged, sha);
      if(res.conflict) continue;          // someone else wrote between our read and write
      done=true;
      applyMerged(merged);
      c.lastSync=Date.now(); c.lastError=null; saveSyncConfig(c);
      setSyncStatus("ok", `Synced ${new Date(c.lastSync).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`);
    }
    if(!done) throw new Error("Kept colliding with another edit. Try again in a moment.");
  }catch(err){
    const c2=syncConfig();
    if(c2){ c2.lastError=String(err.message||err); saveSyncConfig(c2); }
    setSyncStatus("error", String(err.message||err));
  }finally{
    sync.busy=false;
    if(!opts || !opts.quiet) render();
  }
}
/* Writes the merged result back into the live store without re-entering the sync scheduler —
   otherwise every pull would schedule a push and the two would chase each other forever. */
function applyMerged(merged){
  sync.applyingRemote=true;
  store=deepMerge(freshDefaults(), merged);
  normalizeStore();
  save();
  sync.applyingRemote=false;
}
/* The shared file holds data only. Nothing device-local (and certainly not the token, which
   isn't in `store` at all) should end up in a shared commit. */
function stripRuntime(s){ return JSON.parse(JSON.stringify(s)); }

function setSyncStatus(status,detail){ sync.status=status; sync.detail=detail; }

/* Debounced trigger, called from save() on every mutation. Coalesces a burst of edits —
   dragging the rating slider, ticking four boxes — into one commit. */
function scheduleSync(){
  if(!isSynced() || sync.applyingRemote) return;
  clearTimeout(sync.timer);
  setSyncStatus("pending","Changes to sync…");
  sync.timer=setTimeout(()=>syncNow({quiet:false}), SYNC_DEBOUNCE);
}

/* ---- connecting ----
   Validates by actually reading the file, so a wrong repo name or an under-scoped token
   fails here rather than silently on the first real edit. */
async function connectSync(cfg){
  const c={owner:cfg.owner.trim(), repo:cfg.repo.trim(), path:(cfg.path||"roomspin.json").trim(),
           branch:(cfg.branch||"main").trim(), token:cfg.token.trim(), lastSync:null, lastError:null};
  if(!c.owner||!c.repo||!c.token) throw new Error("Owner, repo and token are all required.");
  const {data:remote, sha}=await ghRead(c);
  const merged=mergeStores(stripRuntime(store), remote);
  const res=await ghWrite(c, merged, sha);
  if(res.conflict) throw new Error("The file changed mid-connect. Try again.");
  c.lastSync=Date.now();
  saveSyncConfig(c);
  applyMerged(merged);
  setSyncStatus("ok","Connected — this device now opens the shared house.");
}
function disconnectSync(){
  clearTimeout(sync.timer);
  clearSyncConfig();
  setSyncStatus("idle","");
}
/* Retry as soon as connectivity returns, so an edit made on the drive home lands without
   anyone having to remember to reopen the app. */
window.addEventListener("online", ()=>{ if(isSynced()){ syncNow({quiet:true}).then(()=>render()); } });

/* Refresh when the app comes back to the foreground. This is the trigger that actually matters
   on a phone: resuming an installed PWA from the app switcher does NOT reload the page, so the
   boot sync never runs again for the entire life of the app. Without this, one person could
   leave Roomspin open for days and never see the other's changes.
   The cooldown keeps app-switching from turning into a burst of API calls. */
const FOREGROUND_COOLDOWN = 20000;
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState!=="visible" || !isSynced() || sync.busy) return;
  const c=syncConfig();
  if(c && c.lastSync && Date.now()-c.lastSync < FOREGROUND_COOLDOWN) return;
  syncNow({quiet:true}).then(()=>render());
});

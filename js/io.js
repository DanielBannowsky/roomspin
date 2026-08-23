"use strict";
/* ============================ export / backup / restore ============================ */
function doBackup(){
  const blob=new Blob([JSON.stringify(store,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`roomspin-backup-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  flash("Backup downloaded"); render();
}
/* Plain-text summary for pasting into a note or a message — deliberately not CSV, since the
   useful thing to share is "here's where the house stands", not a spreadsheet. */
function doCopy(){
  const hs=houseScore();
  const lines=[`Roomspin — ${todayStr()} — house ${hs==null?"—":hs.toFixed(1)}/10`];
  if(store.week){
    const r=roomById(store.week.roomId);
    lines.push(`This week: ${r?r.name:"—"} (${weekDaysLeft()} days left)`);
  }
  lines.push("");
  [...store.rooms].sort((a,b)=>a.rating-b.rating||a.name.localeCompare(b.name)).forEach(r=>{
    lines.push(`${String(r.rating).padStart(2)}/10  ${r.name}${r.snoozed?" (snoozed)":""}`);
    (r.tasks||[]).filter(t=>!t.done).forEach(t=>lines.push(`        [ ] ${t.text}`));
  });
  const text=lines.join("\n");
  const done=()=>{ flash("Copied to clipboard"); render(); };
  if(navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text,done));
  else fallbackCopy(text,done);
}
function fallbackCopy(text,done){
  const ta=document.createElement("textarea");
  ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand("copy"); }catch{}
  document.body.removeChild(ta); done();
}
/* Structural validation only — enough to be sure a file is a Roomspin backup and not some
   other JSON, without rejecting a backup written by a future version that added fields. */
function validBackup(d){
  return !!d && typeof d==="object" && Array.isArray(d.rooms) &&
    d.rooms.every(r=>r && typeof r==="object" && typeof r.name==="string");
}
document.getElementById("importer").onchange=e=>{
  const file=e.target.files[0];
  if(!file) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const data=JSON.parse(r.result);
      if(!validBackup(data)) throw 0;
      ui.pendingImport={rooms:data.rooms.length, weeks:(data.history||[]).length, data};
      ui.importError=null;
    }catch{
      ui.pendingImport=null;
      ui.importError="That doesn't look like a Roomspin backup file.";
      setTimeout(()=>{ ui.importError=null; render(); },3500);
    }
    render();
  };
  r.readAsText(file);
  e.target.value="";   // so re-picking the same file fires change again
};
function applyImport(){
  const d=ui.pendingImport?.data; if(!d) return;
  store=deepMerge(freshDefaults(),d);
  store.rooms=(store.rooms||[]).map(r=>({...r, id:r.id||uid()}));
  normalizeStore();
  // A restored backup is a deliberate wholesale replacement, so stamp everything as "now" —
  // otherwise the merge would treat a restored 2-year-old house as stale and the shared copy
  // would immediately undo the restore.
  const t=Date.now();
  store.rooms.forEach(r=>{ r.updatedAt=t; (r.tasks||[]).forEach(x=>{ x.updatedAt=t; }); });
  store.settingsUpdatedAt=t; store.weekUpdatedAt=t;
  store.seeded=true;
  ui.pendingImport=null; ui.openRoomId=null; resetSpin();
  save(); flash("Backup restored"); render();
}
function resetAll(){
  store=freshDefaults();
  store.seeded=false;
  seedRooms();                 // land back on the starter list rather than a blank screen
  ui.openRoomId=null; ui.resetConfirm=false; resetSpin();
  save(); flash("Everything reset"); render();
}

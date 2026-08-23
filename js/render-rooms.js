"use strict";
/* ============================ plan tab (rooms) ============================ */
function renderRooms(){
  return ui.openRoomId ? renderRoomDetail(roomById(ui.openRoomId)) : renderRoomList();
}

/* MD3 filled text field (rounded top, square bottom, 2px bottom rule that turns primary on
   focus) paired with a small FAB — the "add" affordance the system reserves for creating
   something new. */
const addRoomBar = () => `<div class="fieldrow">
    <label class="field">
      <input id="newRoom" placeholder="Add a room…" value="${esc(ui.newRoomText)}" autocomplete="off" aria-label="New room name">
    </label>
    <button id="addRoomBtn" class="fab" aria-label="Add room">${I.plus}</button>
  </div>`;

function renderRoomList(){
  if(!store.rooms.length){
    return addRoomBar() + emptyState(I.plan,"Empty plan",
      "List every room in the house, then rate each one out of ten. The weekly spin draws from this list.");
  }
  // Worst first — the low numbers are the ones the app exists to surface, so they get the top
  // of the sheet. Ties break alphabetically so the order doesn't shuffle between renders.
  const sorted=[...store.rooms].sort((a,b)=> a.rating-b.rating || a.name.localeCompare(b.name));
  const weekRoom=store.week?.roomId;
  const hs=houseScore();

  const tiles=sorted.map(r=>{
    const open=openTasks(r), total=(r.tasks||[]).length;
    return `<button class="tile ${r.snoozed?"hold":""} ${r.id===weekRoom?"active":""}" data-room="${r.id}"
              style="--c:${ratingColor(r.rating)}">
      <div class="tile-top">
        <span class="tname">${esc(r.name)}</span>
        <span class="tscore mono">${fmtRating(r.rating)}</span>
      </div>
      ${chipStrip(r.rating,"sm")}
      <div class="tile-foot">
        ${r.id===weekRoom?`<em class="badge sm">This week</em>`:r.snoozed?`<em class="badge sm quiet">On hold</em>`:""}
        <span>${total? `${total-open}/${total} done` : "No items"}</span>
      </div>
    </button>`;
  }).join("");

  return `
    <div class="hero">
      <div class="hero-num mono">${fmtScore(hs)}<span>/10</span></div>
      <div class="hero-meta">
        <div class="slab">House score</div>
        <div class="hero-sub">${store.rooms.length} rooms · ${totalOpenTasks()} open items</div>
        ${chipStrip(hs)}
      </div>
    </div>
    ${sectionLabel("Rooms","worst first")}
    <div class="tiles">${tiles}</div>
    ${addRoomBar()}`;
}

function renderRoomDetail(r){
  if(!r){ ui.openRoomId=null; return renderRoomList(); }
  const tasks=r.tasks||[];
  const open=tasks.filter(t=>!t.done), done=tasks.filter(t=>t.done);
  const isWeekRoom = store.week?.roomId===r.id;

  const taskRow=t=>`<div class="item ${t.done?"done":""}">
      <button class="ibox" data-toggletask="${t.id}">${t.done?I.check:""}</button>
      <span class="itext">${esc(t.text)}</span>
      <button class="idel ${ui.confirmDelTask===t.id?"confirm":""}" data-deltask="${t.id}" aria-label="Delete item">${ui.confirmDelTask===t.id?I.check:I.trash}</button>
    </div>`;

  return `
    <button class="backbtn" id="backRooms">${I.back}All rooms</button>
    <div class="dhead">
      <input class="dname" id="roomName" value="${esc(r.name)}" spellcheck="false" aria-label="Room name">
      <div class="badges">
        ${isWeekRoom?`<span class="badge">This week</span>`:""}
        ${r.snoozed?`<span class="badge quiet">On hold</span>`:""}
      </div>
    </div>

    ${sectionLabel("Condition")}
    <div class="ratepanel" style="--c:${ratingColor(r.rating)}">
      <div class="ratehead">
        <button class="nudge" data-rate="-0.5" aria-label="Down a half point">${I.minus}</button>
        <div class="ratenum mono">${fmtRating(r.rating)}<span>/10</span></div>
        <button class="nudge" data-rate="0.5" aria-label="Up a half point">${I.plus}</button>
      </div>
      ${ratingSlider(r.rating,'data-rateslider')}
      <p class="note left">Half points count. Lower ratings get a bigger wedge on the wheel.</p>
    </div>

    ${sectionLabel("Punch list", tasks.length?`${done.length}/${tasks.length} done`:"")}
    <div class="fieldrow">
      <label class="field">
        <input id="newTask" placeholder="Add something to do here…" value="${esc(ui.taskDraft[r.id]||"")}" autocomplete="off" aria-label="New punch-list item">
      </label>
      <button id="addTaskBtn" class="fab" aria-label="Add item">${I.plus}</button>
    </div>
    ${tasks.length?`
      <div class="items">${open.map(taskRow).join("")}</div>
      ${done.length?`<div class="subhead">Completed</div><div class="items">${done.map(taskRow).join("")}</div>`:""}
    `:`<p class="note left">Nothing listed yet. Write down the specific jobs — "regrout the shower", "hang blinds" — so the week you land on this room you already know where to start.</p>`}

    ${sectionLabel("Notes")}
    <textarea class="notes" id="roomNotes" rows="3" placeholder="Measurements, paint codes, what it would take to hit a 10…">${esc(r.notes||"")}</textarea>

    <div class="spacer"></div>
    <button class="btn tonal" id="snoozeRoom">${r.snoozed?"Put back in the spin":"Put on hold — keep out of the spin"}</button>
    <button class="btn outlined danger ${ui.confirmDelRoom===r.id?"armed":""}" id="delRoom">${I.trash}${ui.confirmDelRoom===r.id?"Tap again to delete":"Delete room"}</button>
    <p class="note">Deleting a room drops its rating history and punch list for good.</p>`;
}

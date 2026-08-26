"use strict";
/* ============================ job tab (current week) ============================ */
function renderWeek(){
  const w=store.week;
  if(!w){
    return emptyState(I.clipboard,"No job open",
      "Spin the house — whichever room comes up becomes this week's job.") +
      `<button class="btn filled" id="goSpin">${I.spin}Go spin</button>` +
      (store.history.length?renderRecentWeeks():"");
  }
  const r=roomById(w.roomId);
  if(!r){ store.week=null; save(); return renderWeek(); }

  const tasks=r.tasks||[];
  const done=tasks.filter(t=>t.done).length;
  const len=store.settings.weekLength||7;
  const left=weekDaysLeft(), over=left<=0;
  const elapsed=clamp(dayDiff(todayStr(),w.startDate),0,len);
  const delta=r.rating-w.startRating;

  const taskRow=t=>`<div class="itemwrap">
    <div class="item ${t.done?"done":""}">
      <button class="ibox" data-toggletask="${t.id}">${t.done?I.check:""}</button>
      <span class="itext">${esc(t.text)}</span>
      ${pillarChip(t)}
    </div>
    ${ui.pillarPickFor===t.id?pillarPicker(t):""}
  </div>`;

  // Day ticks read like a strip of days on a job sheet rather than a percentage bar — you're
  // counting down actual days here, not tracking a continuous quantity.
  const dayTicks=Array.from({length:len},(_,i)=>
    `<i class="${i<elapsed?"past":i===elapsed?"now":""}"></i>`).join("");

  const closeOut = ui.endWeekOpen ? `
    <div class="ratepanel signoff" style="--c:${ratingColor(ui.endWeekRating)}">
      <div class="slab">Sign off — re-rate ${esc(r.name)}</div>
      <div class="ratehead">
        <button class="nudge" data-endnudge="-0.5" aria-label="Down a half point">${I.minus}</button>
        <div class="ratenum mono">${fmtRating(ui.endWeekRating)}<span>/10</span></div>
        <button class="nudge" data-endnudge="0.5" aria-label="Up a half point">${I.plus}</button>
      </div>
      ${ratingSlider(ui.endWeekRating,'data-endslider')}
      <div class="delta mono ${ui.endWeekRating>w.startRating?"up":ui.endWeekRating<w.startRating?"down":""}">
        ${fmtRating(w.startRating)} → ${fmtRating(ui.endWeekRating)}
        ${ui.endWeekRating!==w.startRating?`(${ui.endWeekRating>w.startRating?"+":""}${fmtRating(ui.endWeekRating-w.startRating)})`:"(no change)"}
      </div>
      <button class="btn filled" id="confirmEnd">${I.stamp}Log it &amp; free up the spin</button>
      <button class="btn text" id="cancelEnd">Cancel</button>
    </div>` : `
    <button class="btn ${over?"filled":"tonal"}" id="openEnd">${I.stamp}${over?"Week's up — sign off":"Sign off early"}</button>`;

  return `
    <div class="sheet" style="--c:${ratingColor(r.rating)}">
      <div class="badge ${over?"due":""}">${over?"Due":`Day ${elapsed+1} of ${len}`}</div>
      <div class="slab">Current job</div>
      <div class="sheetname">${esc(r.name)}</div>
      <div class="days">${dayTicks}</div>
      <div class="sheetsub">${prettyDate(w.startDate)} → ${prettyDate(w.endDate)}
        · opened at ${fmtRating(w.startRating)}${delta?` · ${delta>0?"+":""}${fmtRating(delta)} so far`:""}</div>
    </div>

    ${ui.endWeekOpen?"":`
    ${sectionLabel("Condition now")}
    <div class="ratepanel" style="--c:${ratingColor(r.rating)}">
      <div class="ratehead">
        <button class="nudge" data-rate="-0.5" aria-label="Down a half point">${I.minus}</button>
        <div class="ratenum mono">${fmtRating(r.rating)}<span>/10</span></div>
        <button class="nudge" data-rate="0.5" aria-label="Up a half point">${I.plus}</button>
      </div>
      ${ratingSlider(r.rating,'data-rateslider')}
      <p class="note left">Nudge it as the week goes, or leave it and set it once at sign-off.</p>
    </div>`}

    ${sectionLabel("Design pillars", `${coveredCount(r)}/${pillarTotal(r)}`)}
    ${pillarGrid(r)}

    ${sectionLabel("Punch list", tasks.length?`${done}/${tasks.length} done`:"")}
    <div class="fieldrow">
      <label class="field">
        <input id="newTask" placeholder="Add something to do here…" value="${esc(ui.taskDraft[r.id]||"")}" autocomplete="off" aria-label="New punch-list item">
      </label>
      <button id="addTaskBtn" class="fab" aria-label="Add item">${I.plus}</button>
    </div>
    ${tasks.length?`<div class="items">${tasks.filter(t=>!t.done).map(taskRow).join("")}</div>
      ${done?`<div class="subhead">Completed</div><div class="items">${tasks.filter(t=>t.done).map(taskRow).join("")}</div>`:""}`
     :`<p class="note left">Nothing listed for this room yet — add the jobs you want to knock out this week.</p>`}

    <div class="spacer"></div>
    ${closeOut}`;
}

function renderRecentWeeks(){
  return sectionLabel("Recent weeks") + `<div class="rows">${store.history.slice(0,5).map(h=>{
    const d=h.endRating-h.startRating;
    return `<div class="row">
      <span class="rname">${esc(h.roomName)}</span>
      <span class="rdate">${prettyDate(h.startDate)}</span>
      <span class="rdelta mono ${d>0?"up":d<0?"down":""}">${fmtRating(h.startRating)}→${fmtRating(h.endRating)}</span>
    </div>`;
  }).join("")}</div>`;
}

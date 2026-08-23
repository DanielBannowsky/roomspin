"use strict";
/* ============================ data tab ============================ */
function renderSettings(){
  const s=store.settings, imp=ui.pendingImport;
  return `
    ${sectionLabel("Spin bias")}
    <div class="chiprow">${BIAS_LEVELS.map(b=>`
      <button class="bchip ${s.bias===b.v?"on":""}" data-bias="${b.v}">
        <span class="bl">${b.label}</span><span class="bs">${b.sub}</span>
      </button>`).join("")}</div>
    <p class="note left">${biasExample()}</p>

    ${sectionLabel("Week length")}
    <div class="card inline">
      <button class="nudge" data-weeklen="-1" aria-label="Shorter">${I.minus}</button>
      <div class="ratenum mono">${s.weekLength}<span>days</span></div>
      <button class="nudge" data-weeklen="1" aria-label="Longer">${I.plus}</button>
    </div>

    ${sectionLabel("Spin rules")}
    <button class="toggle ${s.avoidRepeat?"on":""}" id="toggleRepeat">
      <span class="tlab">No back-to-back repeats<em>last week's room sits out the next spin</em></span>
      <span class="knob"></span>
    </button>

    ${sectionLabel("Your data")}
    <p class="note left">Everything lives in this browser's storage on this device — nothing is uploaded anywhere. Clearing site data or switching browsers loses it, so download a backup now and then.</p>
    <button class="btn tonal" id="backupBtn">${I.down}Download backup (.json)</button>
    <button class="btn tonal" id="importBtn">${I.up}Restore from backup</button>
    <button class="btn tonal" id="copyBtn">${I.copy}Copy summary to clipboard</button>
    ${imp?`
      <div class="card confirmbox">
        <div class="slab">Replace everything?</div>
        <p class="note left">This backup holds <strong>${imp.rooms} room${imp.rooms===1?"":"s"}</strong> and <strong>${imp.weeks} closed week${imp.weeks===1?"":"s"}</strong>. Restoring overwrites what's on this device now.</p>
        <button class="btn filled" id="confirmImport">${I.check}Restore it</button>
        <button class="btn text" id="cancelImport">Cancel</button>
      </div>`:""}
    ${ui.importError?`<div class="warn">${esc(ui.importError)}</div>`:""}

    ${sectionLabel("Danger zone")}
    <button class="btn outlined danger ${ui.resetConfirm?"armed":""}" id="resetAll">${I.trash}${ui.resetConfirm?"Tap again — this wipes everything":"Reset all data"}</button>

    <p class="note">Roomspin ${APP_VERSION} · works offline · <span class="mono">${KEY}</span></p>`;
}

/* Concrete illustration of what the current bias does to *this* house — "higher = more
   weighted" doesn't tell you whether your 3/10 kitchen will realistically beat your 8/10
   office to the top of the wheel, and that's the only question anyone actually has. */
function biasExample(){
  const rooms=[...activeRooms()].sort((a,b)=>a.rating-b.rating);
  if(store.settings.bias===0) return "Every room is equally likely — ratings are ignored entirely.";
  if(rooms.length<2) return "Add a couple more rooms to see what this does to the odds.";
  const worst=rooms[0], best=rooms[rooms.length-1];
  if(worst.rating===best.rating) return "Every room is rated the same right now, so the odds are even either way.";
  const ratio=roomWeight(worst)/roomWeight(best);
  return `${esc(worst.name)} (${fmtRating(worst.rating)}) comes up about ${ratio.toFixed(1)}× as often as ${esc(best.name)} (${fmtRating(best.rating)}).`;
}

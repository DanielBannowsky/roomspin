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

    ${sectionLabel("Shared house")}
    ${renderSync()}

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
    <button class="btn outlined danger ${ui.resetConfirm?"armed":""}" id="resetAll">${I.trash}${
      ui.resetConfirm ? (isSynced()?"Tap again — wipes it for both of you":"Tap again — this wipes everything")
                      : "Reset all data"}</button>
    ${isSynced()?`<p class="note left bad">This device is connected to a shared house, so resetting wipes it for <strong>both</strong> of you on the next sync. To reset only this phone, disconnect first.</p>`:""}

    <p class="note">Roomspin ${APP_VERSION} · works offline · <span class="mono">${KEY}</span></p>`;
}

/* Sync panel. Two states: connected (status + controls) or the setup form. The form asks for
   the four things the GitHub contents API needs and nothing else, and the copy is explicit
   about the token's scope — an over-scoped token is the one genuinely damaging mistake
   available here, and it's made at exactly this moment. */
function renderSync(){
  const c=syncConfig();
  if(c){
    const when=c.lastSync?new Date(c.lastSync).toLocaleString([], {month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"not yet";
    return `
      <div class="card synccard ${sync.status}">
        <div class="syncrow">
          <span class="syncdot"></span>
          <div class="syncmain">
            <strong>${esc(c.owner)}/${esc(c.repo)}</strong>
            <em>${esc(c.path)} · last synced ${esc(when)}</em>
          </div>
        </div>
        ${sync.detail?`<p class="note left ${sync.status==="error"?"bad":""}">${esc(sync.detail)}</p>`:""}
        ${c.lastError&&sync.status!=="error"?`<p class="note left bad">Last error: ${esc(c.lastError)}</p>`:""}
      </div>
      <button class="btn tonal" id="syncNow" ${sync.busy?"disabled":""}>${I.sync}${sync.busy?"Syncing…":"Sync now"}</button>
      <button class="btn outlined" id="syncOff">Disconnect this device</button>
      <p class="note left">Disconnecting leaves the shared house untouched and keeps a copy of it on this device.</p>`;
  }
  const d=ui.syncDraft||{};
  return `
    <p class="note left">Point this device at a JSON file in a <strong>private</strong> GitHub repo and both of you will see the same house. Every change is a normal commit, so you also get full history and can undo anything from github.com.</p>
    <div class="synform">
      <label class="field"><input id="syncOwner" placeholder="GitHub username" value="${esc(d.owner||"")}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="GitHub username"></label>
      <label class="field"><input id="syncRepo" placeholder="private repo name" value="${esc(d.repo||"")}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Repository name"></label>
      <label class="field"><input id="syncPath" placeholder="roomspin.json" value="${esc(d.path||"roomspin.json")}" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="File path"></label>
      <label class="field"><input id="syncToken" type="password" placeholder="fine-grained access token" value="${esc(d.token||"")}" autocomplete="off" spellcheck="false" aria-label="Access token"></label>
    </div>
    <button class="btn filled" id="syncConnect" ${sync.busy?"disabled":""}>${I.sync}${sync.busy?"Connecting…":"Connect"}</button>
    ${sync.status==="error"?`<p class="note left bad">${esc(sync.detail)}</p>`:""}
    <p class="note left"><strong>Make the token fine-grained</strong>, scoped to that one private repo, with <em>Contents: Read and write</em> and an expiry date. It is stored only in this browser, is never included in a backup file, and never reaches the public repo. Anyone with the phone unlocked can read it, so don't use a classic token with access to everything you own.</p>`;
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

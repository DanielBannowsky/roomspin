"use strict";
/* ============================ render ============================ */
const $main=document.getElementById("main");
const $nav=document.getElementById("nav");

function render(){
  const hs=houseScore();
  document.getElementById("scoreTag").textContent = hs==null ? "—" : `${fmtScore(hs)} / 10`;
  document.getElementById("verTag").textContent = APP_VERSION;
  // Header indicator: only present once this device is connected, so the app looks and
  // behaves exactly as before for anyone using the public build without sync.
  const sd=document.getElementById("syncTag");
  if(sd){
    const on=isSynced();
    sd.hidden=!on;
    sd.className="syncstat "+(on?sync.status:"");
    sd.title=on?(sync.detail||"Shared house"):"";
  }
  let body;
  if(ui.tab==="rooms") body=renderRooms();
  else if(ui.tab==="spin") body=renderSpin();
  else if(ui.tab==="week") body=renderWeek();
  else if(ui.tab==="progress") body=renderProgress();
  else body=renderSettings();
  $main.innerHTML = errBanner() + body;
  renderNav();
  wire();
}

function renderNav(){
  const tabs=[
    ["rooms","Plan",I.plan,""],
    ["spin","Spin",I.spin, store.week?"":"•"],
    ["week","Job",I.clipboard, store.week&&weekIsOver()?"•":""],
    ["progress","Punch",I.chart,""],
    ["settings","Data",I.disk,""],
  ];
  $nav.innerHTML=tabs.map(([k,l,ic,dot])=>
    // MD3 navigation bar item: the icon sits inside its own pill, which is the active
    // indicator — the label underneath never moves, only the pill fades in behind the icon.
    `<button data-tab="${k}" class="${ui.tab===k?"on":""}">
       <span class="navind">${ic}${dot?`<i class="dot"></i>`:""}</span>
       <span class="navlab">${l}</span>
     </button>`).join("");
}

function errBanner(){
  const parts=[];
  if(loadError) parts.push(`<div class="warn">Saved data couldn't be read and was reset. A copy of the unreadable data was kept in this browser under <span class="mono">${KEY}-corrupt-backup</span>.</div>`);
  if(saveError) parts.push(`<div class="warn">Couldn't write to this device's storage — changes may not persist. (Private/incognito windows often block it.)</div>`);
  if(ui.flash) parts.push(`<div class="okbar">${esc(ui.flash)}</div>`);
  return parts.join("");
}

/* ---- shared components ----
   The rating readout is a paint-chip strip: ten cells, filled left to right, with a half-width
   cell for a half point. Chosen over a plain progress bar because the scale here is a discrete
   0-10 judgement, and a chip strip makes "7.5 out of 10" countable at a glance rather than
   something you have to estimate from a bar's length. */
function chipStrip(r,cls){
  const full=Math.floor(r), half=(r-full)>=0.5;
  const col=ratingColor(r);
  const cells=Array.from({length:10},(_,i)=>{
    if(i<full) return `<i style="background:${col}"></i>`;
    if(i===full && half) return `<i class="half" style="--c:${col}"></i>`;
    return `<i></i>`;
  }).join("");
  return `<div class="chips ${cls||""}">${cells}</div>`;
}
function scoreTag(r){
  const col=ratingColor(r);
  return `<span class="stag mono" style="color:${col};border-color:${col}">${fmtRating(r)}</span>`;
}
/* Range input for a rating. Half-point steps; the value is echoed by the caller's own readout
   rather than by the slider, since native range inputs have no visible value on any platform. */
function ratingSlider(val,attr){
  const col=ratingColor(val);
  return `<div class="sliderwrap">
      <input type="range" class="rslider" min="0" max="10" step="0.5" value="${val}" ${attr}
             style="--c:${col}; --p:${val*10}%" aria-label="Rating out of ten">
      <div class="sticks">${[0,2,4,6,8,10].map(n=>`<span class="mono">${n}</span>`).join("")}</div>
    </div>`;
}
/* ---- design pillars ---- */
/* Coverage grid. Each tile carries a COUNT, never a tick — "Light: 1" and "Light: 4" are very
   different rooms and the old "done" label flattened them. Covering every pillar means nothing
   has been forgotten; it does not mean the room is good, and the copy below says so, because
   all three reviewers warned that letting the grid impersonate the rating is exactly how the
   old `comfort` became a junk drawer.

   Tapping a tile starts an item already tagged with it. The small x marks a pillar as not
   applicable to this room, so the pantry stops asking for a houseplant forever. */
function pillarGrid(room){
  const cov=pillarCoverage(room);
  const covered=cov.filter(c=>c.total>0).length;
  const total=pillarTotal(room);
  const na=naPillars(room);
  return `
    <div class="pgrid">
      ${cov.map(c=>{
        const open=c.total-c.done;
        return `<div class="ptile ${c.total?"some":"none"} ${ui.pillarPrefill===c.pillar.key?"armed":""}"
                  style="--p:var(--pil-${c.pillar.key})">
          <button class="ptap" data-pillartile="${c.pillar.key}" title="${esc(c.pillar.hint)}">
            <span class="pdot"></span>
            <span class="plab">${c.pillar.label}</span>
            <span class="pcount">${c.total? `${c.total}${open?"":" ✓"}` : "—"}</span>
          </button>
          ${c.total?"":`<button class="pna" data-natoggle="${c.pillar.key}" aria-label="Not for this room">✕</button>`}
        </div>`;
      }).join("")}
    </div>
    ${na.length?`<div class="narow">
      <span class="slab">Not for this room</span>
      ${na.map(k=>{const p=pillarBy(k); return p?`<button class="pchip" data-natoggle="${k}">${esc(p.label)} <em>put back</em></button>`:"";}).join("")}
    </div>`:""}
    <p class="note left">${covered===total
      ? "Nothing forgotten — every pillar has something against it. Whether the room is <em>good</em> is what the rating is for."
      : `${covered}/${total} pillars have something against them. Tap one to add an item, or ✕ if it doesn't apply here.`}</p>`;
}
/* The tag shown on a punch-list item. It's a button: tapping opens the picker for that item. */
function pillarChip(t){
  const p=pillarBy(t.pillar);
  return `<button class="pchip ${p?"on":""}" data-pillarpick="${t.id}"
            style="${p?`--p:var(--pil-${p.key})`:""}" aria-label="Design pillar">
      <span class="pdot"></span>${p?esc(p.label):"tag"}
    </button>`;
}
/* Inline picker, rendered under the item being tagged — same pattern as the two-tap delete,
   so tagging never leaves the list or covers it with a sheet. */
function pillarPicker(t){
  return `<div class="ppick">
    ${PILLARS.map(p=>`<button class="pchip ${t.pillar===p.key?"on":""}"
        data-setpillar="${p.key}" data-forta="${t.id}" style="--p:var(--pil-${p.key})">
        <span class="pdot"></span>${p.label}</button>`).join("")}
  </div>`;
}

function emptyState(icon,title,body){
  return `<div class="empty"><div class="icon">${icon}</div><div class="t">${title}</div><div class="b">${body}</div></div>`;
}
/* MD3 section heading: title-small in the primary colour with optional trailing metadata.
   No rules or dividers — in this system separation comes from tonal surfaces, not lines. */
function sectionLabel(text,right){
  return `<div class="slabel"><span>${text}</span>${right?`<em>${right}</em>`:""}</div>`;
}

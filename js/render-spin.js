"use strict";
/* ============================ spin tab ============================ */
function renderSpin(){
  const pool=spinPool();

  if(store.week){
    const r=roomById(store.week.roomId);
    const over=weekIsOver();
    return `
      <div class="sheet locked">
        <div class="badge ${over?"due":""}">${over?"Due":"In progress"}</div>
        <div class="slab">Current job</div>
        <div class="sheetname">${esc(r?r.name:"—")}</div>
        <div class="sheetsub">${over?"Week complete — re-rate to close it out"
          :`${weekDaysLeft()} day${weekDaysLeft()===1?"":"s"} remaining · opened ${prettyDate(store.week.startDate)}`}</div>
      </div>
      <button class="btn filled" id="goWeek">${I.clipboard}Open the job sheet</button>
      <p class="note">The next spin unlocks once this week is signed off on the Job tab.</p>
      <button class="btn outlined danger ${ui.resetConfirm?"armed":""}" id="abandonWeek">${ui.resetConfirm?"Tap again to void this week":"Void this week without rating"}</button>`;
  }

  if(!pool.length){
    return emptyState(I.spin,"Nothing to spin",
      store.rooms.length ? "Every room is on hold. Take one off hold on the Plan tab."
                         : "Add some rooms first, then come back and spin.");
  }

  const odds=spinOdds(pool);
  const sp=ui.spin;
  const spinning=sp?.phase==="spinning";
  const landed=sp?.phase==="landed";
  const landedRoom=landed?roomById(sp.resultId):null;
  const rotation=sp?.rotation||0;

  const caption = landed && landedRoom
    ? `<div class="wcap landed">
         <div class="slab">This week you're working on</div>
         <div class="sheetname">${esc(landedRoom.name)}</div>
         <div class="sheetsub">${fmtRating(landedRoom.rating)}/10 · ${openTasks(landedRoom)} open item${openTasks(landedRoom)===1?"":"s"}</div>
       </div>`
    : `<div class="wcap"><div class="sheetsub">${spinning?"Spinning…":`${pool.length} rooms · wedge size = chance`}</div></div>`;

  return `
    <div class="wheelbox ${spinning?"spinning":""} ${landed?"landed":""}"
         style="${landed&&landedRoom?`--land:${ratingColor(landedRoom.rating)}`:""}"
         data-target="${spinning?sp.target:""}">
      ${wheelSvg(odds,rotation,landed?sp.resultId:null)}
    </div>
    ${caption}
    ${landed ? `
      <button class="btn filled" id="startWeek">${I.stamp}Start the week</button>
      <button class="btn tonal" id="reSpin">Spin again</button>`
     : `<button class="btn filled ${spinning?"busy":""}" id="doSpin" ${spinning?"disabled":""}>${I.spin}${spinning?"Spinning…":"Spin the house"}</button>`}

    <button class="btn text wide" id="toggleOdds">${ui.oddsOpen?"Hide":"Show"} the numbers ${ui.oddsOpen?"▲":"▼"}</button>
    ${ui.oddsOpen?renderOdds(odds):""}
    ${store.settings.avoidRepeat && store.history[0] ? `<p class="note">${esc(store.history[0].roomName)} is sitting this one out — back-to-back repeats are off.</p>` : ""}`;
}

/* The wheel already shows the weighting; this table is the exact reading of it, for when you
   want to know whether the office is at 3% or 0.4%. */
function renderOdds(odds){
  const top=odds[0].p||1;
  return `<div class="odds">
    ${odds.map(o=>`<div class="oddrow">
      <span class="oname">${esc(o.room.name)}</span>
      ${scoreTag(o.room.rating)}
      <div class="obar"><i style="width:${(o.p/top)*100}%;background:${ratingColor(o.room.rating)}"></i></div>
      <span class="opct mono">${pct(o.p*100)}%</span>
    </div>`).join("")}
    <p class="note left">Weight = (11 − rating)<sup>${store.settings.bias}</sup>, normalised across the pool. Change the bias on the Data tab.</p>
  </div>`;
}

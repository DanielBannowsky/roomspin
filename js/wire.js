"use strict";
/* ============================ wire ============================
   Re-attached after every render, since render() replaces $main's innerHTML wholesale. Every
   handler mutates state then calls render(); nothing patches the DOM in place. */
function wire(){
  const $=sel=>$main.querySelector(sel);
  const all=sel=>$main.querySelectorAll(sel);
  // The room a rating/task control acts on: the one open on the Plan tab, or — on the Job tab,
  // which has no drill-down — this week's room.
  const ctxRoom = () => ui.openRoomId ? roomById(ui.openRoomId)
                     : (ui.tab==="week" && store.week ? roomById(store.week.roomId) : null);

  // ---- nav ----
  $nav.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{
    const t=b.dataset.tab;
    if(t!=="spin") resetSpin();
    if(t!=="rooms") ui.openRoomId=null;
    ui.confirmDelRoom=null; ui.confirmDelTask=null; ui.resetConfirm=false; ui.endWeekOpen=false;
    ui.pillarPickFor=null; ui.pillarPrefill=null;
    ui.tab=t; render();
  });

  // ---- rooms list ----
  all("[data-room]").forEach(b=>b.onclick=()=>{ ui.openRoomId=b.dataset.room; render(); });
  const nr=$("#newRoom");
  if(nr){
    nr.oninput=e=>{ ui.newRoomText=e.target.value; };   // no re-render: that would drop focus mid-word
    nr.onkeydown=e=>{ if(e.key==="Enter") commitNewRoom(); };
  }
  const arb=$("#addRoomBtn"); if(arb) arb.onclick=commitNewRoom;
  function commitNewRoom(){
    const el=$("#newRoom"); if(!el) return;
    if(!el.value.trim()) return;
    addRoom(el.value);
    ui.newRoomText="";
    render();
    const again=$main.querySelector("#newRoom"); if(again) again.focus();
  }

  // ---- room detail ----
  const back=$("#backRooms");
  if(back) back.onclick=()=>{ ui.openRoomId=null; ui.confirmDelRoom=null; ui.confirmDelTask=null;
    ui.pillarPickFor=null; ui.pillarPrefill=null; render(); };
  const nameEl=$("#roomName");
  if(nameEl) nameEl.onchange=e=>{
    const r=ctxRoom(); if(!r) return;
    const v=e.target.value.trim();
    if(v) r.name=v; else e.target.value=r.name;   // refuse to blank a room's name
    touchRoom(r); save(); render();
  };
  const notesEl=$("#roomNotes");
  if(notesEl) notesEl.onchange=e=>{ const r=ctxRoom(); if(r){ r.notes=e.target.value; touchRoom(r); save(); } };

  // ---- rating ----
  all("[data-rate]").forEach(b=>b.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    setRating(r, r.rating + Number(b.dataset.rate));
    render();
  });
  // Slider: repaint live while dragging (so the number and colour track the thumb) but only
  // write to storage on release — a single drag across the track would otherwise fire dozens
  // of localStorage writes and stack up ratingLog churn.
  const rs=$("[data-rateslider]");
  if(rs){
    rs.oninput=e=>{
      const r=ctxRoom(); if(!r) return;
      r.rating=snapRating(e.target.value);
      paintSlider(e.target, r.rating);
      liveRatingReadout(r.rating);
    };
    rs.onchange=e=>{
      const r=ctxRoom(); if(!r) return;
      setRating(r, e.target.value);
      render();
    };
  }

  // ---- tasks ----
  const nt=$("#newTask");
  if(nt){
    nt.oninput=e=>{ const r=ctxRoom(); if(r) ui.taskDraft[r.id]=e.target.value; };
    nt.onkeydown=e=>{ if(e.key==="Enter") commitNewTask(); };
  }
  const atb=$("#addTaskBtn"); if(atb) atb.onclick=commitNewTask;
  function commitNewTask(){
    const r=ctxRoom(), el=$("#newTask");
    if(!r||!el||!el.value.trim()) return;
    addTask(r, el.value, ui.pillarPrefill);
    ui.taskDraft[r.id]="";
    ui.pillarPrefill=null;
    render();
    const again=$main.querySelector("#newTask"); if(again) again.focus();
  }
  // Tapping an item's tag opens the picker under that row; tapping it again closes it.
  all("[data-pillarpick]").forEach(b=>b.onclick=()=>{
    const id=b.dataset.pillarpick;
    ui.pillarPickFor = ui.pillarPickFor===id ? null : id;
    render();
  });
  all("[data-setpillar]").forEach(b=>b.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    setTaskPillar(r, b.dataset.forta, b.dataset.setpillar);
    ui.pillarPickFor=null;
    render();
  });
  // Tapping a pillar in the coverage grid starts an item already tagged with it — the point
  // of the grid is to surface a gap, so the tap that notices it should also begin closing it.
  all("[data-pillartile]").forEach(b=>b.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    const key=b.dataset.pillartile;
    ui.pillarPrefill = ui.pillarPrefill===key ? null : key;
    render();
    const box=$main.querySelector("#newTask"); if(box) box.focus();
  });
  all("[data-toggletask]").forEach(b=>b.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    toggleTask(r,b.dataset.toggletask); render();
  });
  // Two-tap delete: first tap arms the row (icon flips to a tick), second commits. Avoids a
  // modal for something this small while still not deleting on a stray tap.
  all("[data-deltask]").forEach(b=>b.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    const id=b.dataset.deltask;
    if(ui.confirmDelTask===id){ deleteTask(r,id); ui.confirmDelTask=null; }
    else ui.confirmDelTask=id;
    render();
  });

  const sn=$("#snoozeRoom");
  if(sn) sn.onclick=()=>{ const r=ctxRoom(); if(!r) return; r.snoozed=!r.snoozed; touchRoom(r); save(); render(); };
  const dr=$("#delRoom");
  if(dr) dr.onclick=()=>{
    const r=ctxRoom(); if(!r) return;
    if(ui.confirmDelRoom===r.id){ deleteRoom(r.id); ui.openRoomId=null; ui.confirmDelRoom=null; flash("Room deleted"); }
    else ui.confirmDelRoom=r.id;
    render();
  };

  // ---- spin ----
  const ds=$("#doSpin"); if(ds) ds.onclick=()=>startSpin();
  const rsp=$("#reSpin"); if(rsp) rsp.onclick=()=>startSpin();
  const to=$("#toggleOdds"); if(to) to.onclick=()=>{ ui.oddsOpen=!ui.oddsOpen; render(); };
  // The wheel is rendered still at its old angle with the CSS transition armed; the transform
  // has to change *after* the element is in the document, or there's no from-value to animate
  // from and it would jump straight to the target. Hence the rAF nudge here rather than baking
  // the target angle into the markup.
  const box=$(".wheelbox.spinning");
  if(box){
    const rot=box.querySelector("#wrot"), target=box.dataset.target;
    if(rot && target) requestAnimationFrame(()=>requestAnimationFrame(()=>{
      rot.style.transform=`rotate(${target}deg)`;
    }));
  }
  const sw=$("#startWeek");
  if(sw) sw.onclick=()=>{
    const r=roomById(ui.spin?.resultId); if(!r) return;
    startWeek(r); resetSpin(); ui.tab="week"; render();
  };
  const gw=$("#goWeek"); if(gw) gw.onclick=()=>{ ui.tab="week"; render(); };
  const gs=$("#goSpin"); if(gs) gs.onclick=()=>{ ui.tab="spin"; render(); };
  const aw=$("#abandonWeek");
  if(aw) aw.onclick=()=>{
    // Voiding throws the week away without writing a history row — an abandoned week shouldn't
    // show up as a 0-point result and drag the "points gained" total down.
    if(ui.resetConfirm){ store.week=null; touchWeek(); save(); ui.resetConfirm=false; flash("Week voided"); }
    else ui.resetConfirm=true;
    render();
  };

  // ---- week sign-off ----
  const oe=$("#openEnd");
  if(oe) oe.onclick=()=>{
    const r=roomById(store.week.roomId);
    ui.endWeekOpen=true;
    ui.endWeekRating=r?r.rating:store.week.startRating;   // start from wherever it stands now
    render();
  };
  const ce=$("#cancelEnd"); if(ce) ce.onclick=()=>{ ui.endWeekOpen=false; render(); };
  all("[data-endnudge]").forEach(b=>b.onclick=()=>{
    ui.endWeekRating=snapRating(ui.endWeekRating+Number(b.dataset.endnudge)); render();
  });
  const es=$("[data-endslider]");
  if(es){
    es.oninput=e=>{
      ui.endWeekRating=snapRating(e.target.value);
      paintSlider(e.target, ui.endWeekRating);
      liveRatingReadout(ui.endWeekRating);
    };
    es.onchange=()=>render();
  }
  const cf=$("#confirmEnd");
  if(cf) cf.onclick=()=>{
    endWeek(ui.endWeekRating);
    ui.endWeekOpen=false; ui.endWeekRating=null;
    ui.tab="spin"; resetSpin();
    flash("Week signed off — spin again");
    render();
  };

  // ---- data tab ----
  all("[data-bias]").forEach(b=>b.onclick=()=>{ store.settings.bias=Number(b.dataset.bias); touchSettings(); save(); render(); });
  all("[data-weeklen]").forEach(b=>b.onclick=()=>{
    store.settings.weekLength=clamp(store.settings.weekLength+Number(b.dataset.weeklen),1,60);
    // Keep a running week's end date consistent with the new length — otherwise the setting
    // appears to do nothing until the next spin.
    if(store.week){ store.week.endDate=addDays(store.week.startDate, store.settings.weekLength); touchWeek(); }
    touchSettings(); save(); render();
  });
  const tr=$("#toggleRepeat");
  if(tr) tr.onclick=()=>{ store.settings.avoidRepeat=!store.settings.avoidRepeat; touchSettings(); save(); render(); };
  const bb=$("#backupBtn"); if(bb) bb.onclick=doBackup;
  const cb=$("#copyBtn"); if(cb) cb.onclick=doCopy;
  const ib=$("#importBtn"); if(ib) ib.onclick=()=>document.getElementById("importer").click();
  const ci=$("#confirmImport"); if(ci) ci.onclick=applyImport;
  const xi=$("#cancelImport"); if(xi) xi.onclick=()=>{ ui.pendingImport=null; render(); };
  const ra=$("#resetAll");
  if(ra) ra.onclick=()=>{ if(ui.resetConfirm) resetAll(); else { ui.resetConfirm=true; render(); } };

  // ---- shared house ----
  // The four inputs write to a draft rather than straight to config: re-rendering on every
  // keystroke would blur the field, and a half-typed token must never be saved anywhere.
  ["Owner","Repo","Path","Token"].forEach(f=>{
    const el=$("#sync"+f);
    if(el) el.oninput=e=>{ ui.syncDraft={...(ui.syncDraft||{}), [f.toLowerCase()]:e.target.value}; };
  });
  const sc=$("#syncConnect");
  if(sc) sc.onclick=async()=>{
    const d=ui.syncDraft||{};
    sync.busy=true; setSyncStatus("syncing","Connecting…"); render();
    try{
      await connectSync({owner:d.owner||"", repo:d.repo||"", path:d.path||"roomspin.json", token:d.token||""});
      ui.syncDraft=null;
      flash("Shared house connected");
    }catch(err){
      setSyncStatus("error", String(err.message||err));
    }finally{ sync.busy=false; render(); }
  };
  const sn2=$("#syncNow"); if(sn2) sn2.onclick=()=>syncNow();
  const so=$("#syncOff");
  if(so) so.onclick=()=>{ disconnectSync(); flash("Disconnected — this device is local again"); render(); };
}

/* Mid-drag repaint, DOM-only. Deliberately not a render() — re-rendering while a range input
   is being dragged replaces the very element the pointer is captured on, which drops the drag
   on the floor on both iOS and Android. */
function paintSlider(el,val){
  const col=ratingColor(val);
  el.style.setProperty("--c",col);
  el.style.setProperty("--p",(val*10)+"%");
  const panel=el.closest(".ratepanel");
  if(panel) panel.style.setProperty("--c",col);
}
function liveRatingReadout(val){
  const num=$main.querySelector(".ratepanel .ratenum");
  if(num) num.childNodes[0].nodeValue=fmtRating(val);
}

"use strict";
/* ============================ punch tab (progress) ============================ */
function renderProgress(){
  if(!store.rooms.length) return emptyState(I.chart,"Nothing to chart yet",
    "Add rooms and rate them — the house score and week-by-week history land here.");

  const hs=houseScore();
  const dates=houseTrendDates();
  const first=dates.length?houseScoreOn(dates[0]):hs;
  const change=hs-(first??hs);
  const weeksDone=store.history.length;
  const gained=store.history.reduce((a,h)=>a+(h.endRating-h.startRating),0);
  const tasksDone=store.rooms.reduce((a,r)=>a+doneTasks(r),0);

  return `
    <div class="hero">
      <div class="hero-num mono">${fmtScore(hs)}<span>/10</span></div>
      <div class="hero-meta">
        <div class="slab">House score</div>
        <div class="hero-sub ${change>0.05?"up":change<-0.05?"down":""}">${change>=0?"+":""}${fmtScore(change)} all time</div>
        ${chipStrip(hs)}
      </div>
    </div>

    <div class="statgrid">
      ${[["Weeks closed",weeksDone],["Points gained",(gained>=0?"+":"")+fmtRating(gained)],
         ["Items done",tasksDone],["Items open",totalOpenTasks()]]
        .map(([l,v])=>`<div class="stat"><div class="slab">${l}</div><div class="statv mono">${v}</div></div>`).join("")}
    </div>

    ${sectionLabel("House trend")}
    ${houseChart(dates)}

    ${sectionLabel("Every room","current")}
    <div class="rows">${[...store.rooms].sort((a,b)=>b.rating-a.rating||a.name.localeCompare(b.name)).map(r=>{
      const log=r.ratingLog||[];
      const d=log.length>1 ? r.rating-log[0].rating : 0;
      return `<div class="row">
        <span class="rname">${esc(r.name)}</span>
        <div class="obar"><i style="width:${r.rating*10}%;background:${ratingColor(r.rating)}"></i></div>
        <span class="rdelta mono ${d>0?"up":d<0?"down":""}">${fmtRating(r.rating)}${d?` (${d>0?"+":""}${fmtRating(d)})`:""}</span>
      </div>`;
    }).join("")}</div>

    ${sectionLabel("Closed weeks")}
    ${store.history.length? `<div class="rows">${store.history.map(h=>{
      const d=h.endRating-h.startRating;
      return `<div class="row tall">
        <div class="rmain">
          <span class="rname">${esc(h.roomName)}</span>
          <span class="rsub">${prettyDate(h.startDate)} → ${prettyDate(h.endDate)} · ${h.tasksDone} item${h.tasksDone===1?"":"s"} ticked</span>
        </div>
        <span class="rdelta mono ${d>0?"up":d<0?"down":""}">${fmtRating(h.startRating)}→${fmtRating(h.endRating)}${d?` (${d>0?"+":""}${fmtRating(d)})`:""}</span>
      </div>`;
    }).join("")}</div>` : `<p class="note left">No closed weeks yet.</p>`}`;
}

/* House average over time, drawn as inline SVG so the app stays a zero-dependency static site
   (nothing to fetch, nothing that breaks offline). Y is pinned to 0-10 rather than auto-scaled
   to the data: the absolute number is the meaningful thing here, and auto-scaling would make a
   0.2 wobble look like a transformation. Drawn as a stepped line, since a rating holds its
   value until the day you change it — it doesn't drift continuously between readings. */
function houseChart(dates){
  const pts=dates.map(d=>({d, v:houseScoreOn(d)})).filter(p=>p.v!=null);
  if(pts.length<2) return `<div class="card"><p class="note left">Change ratings on two different days and the trend line starts here.</p></div>`;

  const W=320,H=132,PL=24,PR=10,PT=12,PB=20;
  const iw=W-PL-PR, ih=H-PT-PB;
  const x=i=>PL+(i/(pts.length-1))*iw;
  const y=v=>PT+ih-(v/10)*ih;

  let dstr=`M${x(0).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for(let i=1;i<pts.length;i++) dstr+=`H${x(i).toFixed(1)}V${y(pts[i].v).toFixed(1)}`;
  const area=`${dstr}V${PT+ih}H${x(0).toFixed(1)}Z`;
  const grid=[0,2.5,5,7.5,10].map(v=>{
    const major=v===0||v===5||v===10;
    return `<line x1="${PL}" y1="${y(v).toFixed(1)}" x2="${W-PR}" y2="${y(v).toFixed(1)}"
      class="${major?"gmaj":"gmin"}"/>${major?`<text x="${PL-5}" y="${(y(v)+3).toFixed(1)}" text-anchor="end" class="gtext">${v}</text>`:""}`;
  }).join("");
  const last=pts[pts.length-1];

  return `<div class="card chartcard">
    <svg viewBox="0 0 ${W} ${H}" class="chart">
      ${grid}
      <path d="${area}" class="carea"/>
      <path d="${dstr}" class="cline"/>
      <circle class="cdot" cx="${x(pts.length-1).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.4" style="fill:${ratingColor(last.v)}"/>
    </svg>
    <div class="chartfoot"><span>${prettyDate(pts[0].d)}</span><span>${prettyDate(last.d)}</span></div>
  </div>`;
}

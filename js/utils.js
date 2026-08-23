"use strict";
/* ============================ utils ============================ */
const pad = n => String(n).padStart(2,"0");
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
/* Local calendar-date arithmetic via setDate() rather than an epoch-ms round trip — adding
   n*86400000 to a timestamp silently shifts the result by an hour across a DST boundary,
   which can land the week's end date on the wrong day. setDate stays in local calendar
   terms throughout, so it's immune to that. */
function addDays(dateStr,n){
  const d=new Date(dateStr+"T12:00:00"); d.setDate(d.getDate()+n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
const dayDiff = (a,b) => Math.round((new Date(a+"T12:00:00")-new Date(b+"T12:00:00"))/86400000);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));

/* Ratings move in half points, so snap to the nearest 0.5 rather than the nearest integer —
   the slider's step already does this for direct input, but the +/- buttons, imported files
   and hand-edited JSON all come through here too. NaN (a hand-broken file, a missing field)
   snaps to 5 rather than poisoning every average downstream. */
const snapRating = v => Number.isFinite(Number(v)) ? clamp(Math.round(Number(v)*2)/2, 0, 10) : 5;
/* 7 prints as "7", 7.5 as "7.5" — trailing ".0" on whole numbers reads as false precision. */
const fmtRating = r => Number.isInteger(r) ? String(r) : Number(r).toFixed(1);
const fmtScore = v => (Math.round(v*10)/10).toFixed(1);

function prettyDate(s){ return new Date(s+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}); }
function prettyDateFull(s){ return new Date(s+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}); }
/* Colour ramp is indexed by whole points, so a 6.5 borrows the 7's swatch — near enough at
   the resolution a colour chip is actually read at. */
const ratingColor = r => RATING_COLORS[clamp(Math.round(r),0,10)];
/* Percentages in the odds/wheel readouts: keep one decimal only when rounding to whole
   numbers would print "0%" for a room that genuinely can come up. */
const pct = v => v>0 && v<0.95 ? v.toFixed(1) : String(Math.round(v));

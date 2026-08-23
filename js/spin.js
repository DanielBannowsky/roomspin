"use strict";
/* ============================ spin animation ============================
   The winner is drawn up front with pickWeighted(), then the wheel is rotated so that room's
   wedge lands under the needle. Doing it the other way round — spin, then read off whatever
   stopped at the top — would work too, since the wedges are already sized by weight, but it
   makes the outcome depend on animation timing and floating-point angle maths. Drawing first
   keeps the randomness in one auditable place. */
const SPIN_MS = 4200;
let spinTimer=null;

const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function clearSpinTimer(){ if(spinTimer){ clearTimeout(spinTimer); spinTimer=null; } }

function startSpin(){
  const pool=spinPool();
  if(!pool.length) return;
  const odds=spinOdds(pool);
  const winner=pickWeighted();
  const wedges=wheelWedges(odds);
  const w=wedges.find(x=>x.id===winner.id);
  if(!w) return;

  const cur=ui.spin?.rotation || 0;
  // Land somewhere inside the winning wedge rather than dead centre every time — 70% of the
  // half-sweep keeps it clear of the seams so the needle never sits ambiguously on a border.
  const jitter=(Math.random()*2-1)*(w.sweep/2)*0.7;
  // Rotate forward only: take the shortest forward delta that brings the wedge under the
  // needle (which sits at -90°), then add whole extra turns on top.
  const need=(((-90 - w.mid - cur) % 360) + 360) % 360;
  const target=cur + 360*4 + need + jitter;

  if(reduceMotion()){
    ui.spin={phase:"landed", rotation:target, resultId:winner.id};
    render();
    return;
  }
  // Render still at the old rotation with the transition armed; wire() then nudges it to the
  // target on the next frame, which is what gives the transition a from-value to animate off.
  ui.spin={phase:"spinning", rotation:cur, target, resultId:winner.id};
  render();
  clearSpinTimer();
  spinTimer=setTimeout(()=>{
    ui.spin={phase:"landed", rotation:target, resultId:winner.id};
    spinTimer=null;
    render();
    if(navigator.vibrate) try{ navigator.vibrate([15,45,70]); }catch{}
  }, SPIN_MS+40);
}
function resetSpin(){ clearSpinTimer(); ui.spin=null; }

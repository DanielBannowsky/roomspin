"use strict";
/* ============================ the wheel ============================
   The whole point of the app is that the spin is *weighted*, so the wheel is drawn with each
   room's wedge sized to its actual probability — a 2/10 room visibly owns a bigger slice than
   an 8/10 one. An even-wedge wheel with hidden weighting would be lying about the mechanic,
   and the odds would only be discoverable in a table. Here the picture is the explanation. */
const WHEEL = {size:300, r:142, inner:56, labelMin:15};   // labelMin = smallest wedge (deg) worth labelling

const polar = (cx,cy,r,deg) => {
  const a=(deg*Math.PI)/180;
  return [cx+r*Math.cos(a), cy+r*Math.sin(a)];
};
/* Annulus wedge: outer arc forward, inner arc back. Angles are in degrees with 0 at 3 o'clock,
   and the layout starts at -90 so the first wedge begins at the top under the pointer. */
function wedgePath(cx,cy,rOut,rIn,a0,a1){
  const large = (a1-a0) > 180 ? 1 : 0;
  const [x0,y0]=polar(cx,cy,rOut,a0), [x1,y1]=polar(cx,cy,rOut,a1);
  const [x2,y2]=polar(cx,cy,rIn,a1),  [x3,y3]=polar(cx,cy,rIn,a0);
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${rOut},${rOut} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
       + `L${x2.toFixed(2)},${y2.toFixed(2)}A${rIn},${rIn} 0 ${large} 0 ${x3.toFixed(2)},${y3.toFixed(2)}Z`;
}
/* Wedge geometry for the current pool, in draw order. Kept separate from the SVG so the spin
   animation can ask "where does this room's slice sit?" without re-parsing markup. */
function wheelWedges(odds){
  let a=-90;
  return odds.map(o=>{
    const sweep=o.p*360;
    const w={id:o.room.id, room:o.room, p:o.p, a0:a, a1:a+sweep, mid:a+sweep/2, sweep};
    a+=sweep;
    return w;
  });
}
/* `landedId`, when set, marks the wedge the needle stopped on: everything else drops back in
   opacity so the result is unmistakable even before you read the caption. Without it the
   needle alone has to carry the answer, which is ambiguous on a 15-wedge wheel where two
   slices meet under the point. */
function wheelSvg(odds,rotation,landedId){
  const {size,r,inner,labelMin}=WHEEL;
  const c=size/2;
  const wedges=wheelWedges(odds);
  const slices=wedges.map(w=>{
    const col=ratingColor(w.room.rating);
    // A full-circle single wedge can't be drawn as an arc (start and end coincide), so the
    // one-room pool is drawn as a plain ring instead.
    const path = w.sweep>=359.9
      ? `M${c},${c-r}A${r},${r} 0 1 1 ${c-0.01},${c-r}Z M${c},${c-inner}A${inner},${inner} 0 1 0 ${c-0.01},${c-inner}Z`
      : wedgePath(c,c,r,inner,w.a0,w.a1);
    const won = landedId && w.id===landedId;
    const dim = landedId && !won;
    // fill/stroke go through style rather than presentation attributes: presentation
    // attributes taking var() is well supported in Blink but patchier elsewhere, and a
    // silently-unresolved token here would paint the whole wheel black.
    return `<path class="${won?"won":dim?"dim":""}" d="${path}"
      style="fill:${col}" fill-rule="evenodd"/>`;
  }).join("");
  // When a result is showing, label only the winner — the dimmed slices' names are noise at
  // that point, and the winner's label stays legible even if its wedge is a thin one.
  const labelled = landedId ? wedges.filter(w=>w.id===landedId) : wedges.filter(w=>w.sweep>=labelMin);
  const labels=labelled.map(w=>{
    const [lx,ly]=polar(c,c,(r+inner)/2,w.mid);
    // Keep text upright-ish: past the 90° mark the radial angle would render it upside down.
    const flip = w.mid>90 && w.mid<270;
    const rot = flip ? w.mid+180 : w.mid;
    const name = w.room.name.length>14 ? w.room.name.slice(0,13)+"…" : w.room.name;
    return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" transform="rotate(${rot.toFixed(1)} ${lx.toFixed(1)} ${ly.toFixed(1)})"
      text-anchor="middle" dominant-baseline="middle" class="wlabel">${esc(name)}</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" class="wheel" aria-hidden="true">
      <g class="wrot" id="wrot" style="transform:rotate(${rotation}deg)">
        ${slices}${labels}
      </g>
      <circle cx="${c}" cy="${c}" r="${inner-6}" class="whub"/>
      <circle cx="${c}" cy="${c}" r="${r+7}" class="wring"/>
      <path d="M${c-11},6 L${c+11},6 L${c},26 Z" class="wneedle"/>
    </svg>`;
}

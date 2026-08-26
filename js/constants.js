"use strict";
/* ============================ constants ============================ */
// Bump alongside sw.js's CACHE string on every deploy — shown in the header so it's
// obvious at a glance (e.g. after a force-close/reopen) which build is actually running.
const APP_VERSION = "v1";
const KEY = "roomspin-v1";

/* Rating 0-10 → colour, as design tokens rather than literals: the actual values live in
   styles.css next to every other colour in the system, which is what lets the ramp restyle
   itself for dark mode without JS knowing anything about the theme. Index = rating, so
   RATING_COLORS[r] is direct.

   The ramp is deliberately muted and runs rose-red → teal-green rather than fire-engine red →
   grass green: it still reads semantically (bad on the left, done on the right) but the cool
   cast at both ends sits inside the app's purple scheme instead of fighting it. */
const RATING_COLORS = Array.from({length:11},(_,i)=>`var(--rate-${i})`);

/* Weighted-spin bias. weight = (11 - rating) ** bias, so a 1/10 room is always more likely
   than a 9/10 one; the exponent controls by how much. bias 0 makes every room equally likely
   (a plain random pick), 3 makes the worst room dominate. 2 is the default: a 2/10 room comes
   up ~16x as often as an 8/10 one, which is lopsided enough to matter without ever making a
   decent-but-not-done room unreachable. */
const BIAS_LEVELS = [
  {v:0, label:"Even",   sub:"ignore ratings"},
  {v:1, label:"Gentle", sub:"mild pull to worst"},
  {v:2, label:"Normal", sub:"recommended"},
  {v:3, label:"Harsh",  sub:"worst room dominates"},
];

/* ============================ design pillars ============================
   Finalised after three independent design reviews — a practising designer, a design educator
   and an architect — each asked the same question: is this set SUFFICIENT? All three said the
   old nine were not, and all three found the same hole by the same route: every item this
   house had failed to tag (Steps, Hose thing, Dumbbells, Baking soda, Scratching stuff) was
   something the room needs to DO ITS JOB, and no pillar covered that. The set described how a
   room looks, not whether it works. Hence `function`.

   Level of abstraction, and every member obeys it: A PILLAR IS A CLASS OF JOB YOU CAN SHOP FOR
   OR SCHEDULE. Not a property, not an outcome, not a component. `character` failed that test
   (an outcome — it's what you get, not what you buy) and became `art`; the old `comfort`
   failed it too (a feeling) and is now only the invisible environment.

   Tag by what an item is FOR, not what it's made of: a curtain is Light, a cushion is
   Textiles, a fan is Comfort. If two still fit, tag the one the room has nothing against yet.

   WHAT COVERAGE MEANS — all three reviewers were emphatic, so it's written here rather than
   left to be re-litigated: covering every pillar does NOT mean the room is good. "Light: done"
   and "Light: three layers at three heights" are the same tag, so ten pillars closed by one
   cheap item each proves nothing. Coverage is a breadth signal: it means nothing has been
   FORGOTTEN. The 0-10 rating stays the verdict on quality. Do not let the grid impersonate the
   rating — that conflation is what turned the old `comfort` into a junk drawer.

   Order is the order you'd work in — shell, then use, then the layers on top — so the list
   itself teaches sequence. `repair` moved from last to first for the same reason: it read as
   least important sitting at the end, when it's the prerequisite. */
const PILLARS = [
  {key:"repair",   label:"Repair",        hint:"Fix what's broken, unfinished or grubby. Do this first — nothing else reads right until it is."},
  {key:"surfaces", label:"Surfaces",      hint:"The fixed planes — floor, walls, ceiling, counters. Paint, paper, tile, flooring."},
  {key:"light",    label:"Light",         hint:"Layer it: ambient, task, accent. Daylight and blinds count — and go look after dark."},
  {key:"function", label:"Function",      hint:"Can the room do its job? The furniture, fixtures and power it needs to work."},
  {key:"layout",   label:"Layout",        hint:"Where everything goes. Zones, flow, what faces what, and where the edges are."},
  {key:"storage",  label:"Storage",       hint:"Everything needs a home — or needs to go. Clutter always reads as low."},
  {key:"comfort",  label:"Comfort",       hint:"The invisible half — warmth, airflow, quiet, smell, bugs. What you feel before you look."},
  {key:"textiles", label:"Textiles",      hint:"The soft layer — rug, curtains, cushions, bedding, towels. Bare hard rooms never rate."},
  {key:"greenery", label:"Greenery",      hint:"Something alive — pots, beds, herbs, cut stems, the view out the window."},
  {key:"art",      label:"Art & objects", hint:"Walls and shelves — art, photos, mirrors, the things with a story."},
];
const pillarBy = k => PILLARS.find(p=>p.key===k) || null;

/* Keys from before the rebuild. Fallback only — an item's own text is a better guide than its
   old bucket, because `texture` alone splits three ways (soft goods, fixed planes, storage). */
const PILLAR_LEGACY = {
  color:"surfaces", texture:"textiles", character:"art",
  light:"light", layout:"layout", storage:"storage", greenery:"greenery",
  comfort:"comfort", repair:"repair",
};

/* Keyword → pillar, in order so the more specific rule wins. Two rules moved deliberately:
   shelf/shelves left `texture` for `storage`, and the furniture nouns left `layout` for
   `function`, leaving layout the verbs (arrange, zone, screen) rather than the nouns. */
const PILLAR_HINTS = [
  ["repair",    /\b(fix|repair|patch|seal|caulk|foam|broken|leaks?|cracks?|rot|sand|regrout|grout|unsafe|grubby)\b/i],
  ["light",     /\b(lights?|lighting|lamps?|sconces?|bulbs?|dimmers?|lanterns?|pendant|chandelier|blinds?|shades?|shutters?|skylights?)\b/i],
  ["surfaces",  /\b(paint|repaint|wallpaper|stain|limewash|whitewash|tile|tiling|flooring|floors?|ceilings?|walls?|counters?|countertop|trim|plaster|drywall|pavers?|gravel|decking|concrete)\b/i],
  ["greenery",  /\b(plants?|pots?|planters?|trees?|flowers?|garden|herbs?|beds?|climbing|moss|shrubs?|mulch|lawn)\b/i],
  ["storage",   /\b(storage|store|shelf|shelving|shelves|cabinets?|cupboards?|bins?|baskets?|hooks?|closets?|organi[sz]e|racks?|drawers?|pegboard|declutter|clear|cull|donate|get rid|take out|containers?|jars?)\b/i],
  ["comfort",   /\b(fans?|heater|heating|insulation|ac|a\/c|air|airflow|vent|draughts?|drafts?|damp|bugs?|repellent|mosquito|pest|sound|noise|echo|speakers?|scent|smell|odou?r|breeze|baking soda)\b/i],
  ["textiles",  /\b(rugs?|runners?|towels?|linen|throws?|pillows?|cushions?|blankets?|bedding|curtains?|drapes?|fabric|upholster|mats?)\b/i],
  ["art",       /\b(art|artwork|photos?|frames?|framed|prints?|posters?|candles?|decor|mirrors?|vases?|books?|objects?)\b/i],
  ["function",  /\b(tables?|chairs?|sofas?|couch(es)?|desks?|bench(es)?|stools?|beds?|furniture|outlets?|sockets?|power|hose|spigot|tap|irrigation|steps?|handrail|bar|rail|equipment|dumbbells?|weights?|litter|scratching|feeder|tools?|toolbox|appliance|dining|eat|eating|cooking|laundry)\b/i],
  ["layout",    /\b(arrange|rearrange|move|face|facing|zone|flow|screen|screening|privacy|fence|hedge|edges?|layout|seating plan)\b/i],
];
/* Best match rather than first match: "paint the ceiling and touch up around the fan" hits
   `surfaces` twice and `comfort` once, and first-match handed it to whichever rule sat higher.
   Counting lets the rule with more evidence win; order only settles genuine ties. */
function suggestPillar(text){
  const t=String(text||"");
  let best=null, bestHits=0;
  PILLAR_HINTS.forEach(([key,re])=>{
    const hits=(t.match(new RegExp(re.source,"gi"))||[]).length;
    if(hits>bestHits){ best=key; bestHits=hits; }
  });
  return best;
}

/* Seeded on first run so the app is usable immediately — every one of these is editable and
   deletable on the Rooms tab, so treat it as a starting point, not a fixed list. */
const STARTER_ROOMS = ["Kitchen","Living Room","Primary Bedroom","Primary Bath","Guest Bedroom",
  "Guest Bath","Dining Room","Office","Laundry","Garage","Entryway","Hallway","Basement",
  "Backyard","Front Yard"];

const DEFAULTS = {
  version: 1,
  settings: { bias:2, weekLength:7, avoidRepeat:true },
  rooms: [],
  week: null,          // active week: {id, roomId, startDate, endDate, startRating, spunAt}
  history: [],         // finished weeks: {id, roomId, roomName, startDate, endDate, startRating, endRating, tasksDone, tasksTotal}
  seeded: false,
  /* Merge bookkeeping for the shared-house sync (js/sync.js). Rooms and tasks carry their own
     updatedAt; these cover the parts of the document that aren't in those lists. Tombstones
     record deletions so a delete on one phone isn't undone by the other phone still holding
     a copy. All of it is inert when sync is switched off. */
  settingsUpdatedAt: 0,
  weekUpdatedAt: 0,
  clock: 0,            // hybrid logical clock — see stamp() in logic.js
  graveyard: { rooms:{}, tasks:{} },
};

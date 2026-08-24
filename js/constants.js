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

/* The design pillars a punch-list item can be tagged with. One shared vocabulary for inside
   and outside deliberately: a patio needs light, texture and greenery for the same reasons a
   living room does, and a second set of exterior-only names would just make the coverage view
   incomparable between rooms.

   The point isn't the tag, it's the coverage. A room reads as finished when several pillars
   are handled at once — good light on a bare, hard-surfaced room still feels unfinished — so
   the room view shows which pillars have nothing against them. `repair` is the odd one out and
   sits last on purpose: it isn't a design pillar, it's the baseline, and nothing else in a
   room reads properly while something is visibly broken. */
const PILLARS = [
  {key:"light",     label:"Light",     hint:"Layer it — ambient, task, accent. Daylight counts."},
  {key:"color",     label:"Color",     hint:"Paint and palette. Pick a few tones and repeat them."},
  {key:"texture",   label:"Texture",   hint:"Mix hard and soft — rug, wood, linen, stone."},
  {key:"layout",    label:"Layout",    hint:"Zones and flow. What faces what, how you move through."},
  {key:"storage",   label:"Storage",   hint:"Everything needs a home. Clutter always reads as low."},
  {key:"greenery",  label:"Greenery",  hint:"Something alive — plants, herbs, cut stems."},
  {key:"character", label:"Character", hint:"Art, objects, things with a story. The personal layer."},
  {key:"comfort",   label:"Comfort",   hint:"Temperature, airflow, sound, scent, softness underfoot."},
  {key:"repair",    label:"Repair",    hint:"Fix what's broken or unfinished. The baseline, not a flourish."},
];
const pillarBy = k => PILLARS.find(p=>p.key===k) || null;

/* Keyword → pillar, tried in order so the more specific rule wins ("paint" is colour even
   though a paint job is also a repair). Only ever a suggestion: it pre-selects a tag when you
   add an item and you can change it with one tap. Anything unmatched stays untagged rather
   than being forced into a pillar it doesn't belong in. */
const PILLAR_HINTS = [
  ["repair",    /\b(fix|repair|patch|seal|caulk|foam|broken|leak|crack|rot|sand|regrout|grout|replace)\b/i],
  ["light",     /\b(light|lighting|lamp|sconce|bulb|dimmer|lantern|shade|shades|blind|blinds|skylight|window)\b/i],
  ["color",     /\b(paint|colou?r|wallpaper|stain|whitewash)\b/i],
  ["greenery",  /\b(plant|plants|pot|pots|planter|tree|flower|garden|herb|plants?|climbing|moss|shrub)\b/i],
  ["storage",   /\b(storage|store|shelf|shelving|shelves|cabinet|bin|basket|hook|hooks|closet|organi[sz]e|toolbox|rack|drawer|pegboard)\b/i],
  ["comfort",   /\b(fan|heater|heat|insulation|ac|a\/c|air|airflow|bug|repellent|mosquito|sound|speaker|scent|diffuser|cushion|breeze|shade cloth)\b/i],
  ["texture",   /\b(rug|towel|towels|linen|throw|pillow|blanket|mat|mats|fabric|upholster|curtain|curtains|tile|wood|stone)\b/i],
  ["character", /\b(art|photo|frame|print|poster|candle|book|books|decor|mirror|vase|shelf styling)\b/i],
  ["layout",    /\b(table|chair|chairs|sofa|couch|desk|bench|stool|bed|arrange|layout|furniture|seating)\b/i],
];
function suggestPillar(text){
  const t=String(text||"");
  for(const [key,re] of PILLAR_HINTS) if(re.test(t)) return key;
  return null;
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

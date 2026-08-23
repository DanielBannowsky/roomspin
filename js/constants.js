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

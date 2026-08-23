"use strict";
/* ============================ constants ============================ */
// Bump alongside sw.js's CACHE string on every deploy — shown in the header so it's
// obvious at a glance (e.g. after a force-close/reopen) which build is actually running.
const APP_VERSION = "v1";
const KEY = "roomspin-v1";

/* Rating 0-10 → colour. Index = rating, so RATING_COLORS[r] is direct. Material You is a
   colourful, expressive system, so this ramp is saturated rather than muted — but it stays
   semantic (needs-work red through to done teal-green) because the colour is carrying real
   information here, not decoration. */
const RATING_COLORS = ["#B3261E","#C13A21","#CC5522","#D2701F","#D08B18","#C4A410",
  "#A9B41B","#86B62F","#5FB24C","#35A96A","#00997E"];

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
};

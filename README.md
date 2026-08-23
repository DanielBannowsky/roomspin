# Roomspin

Rate every room in the house out of ten. Once a week, spin — the wheel is weighted toward
your worst rooms, so the places that need the most work come up the most often. Whatever it
lands on is the week's job. Work the room's checklist, re-rate it at the end, spin again.

A static, offline-capable PWA. No build step, no dependencies, no server: all data lives in
`localStorage` on the device you use it on.

## Running it

Open `index.html` — that's it. For the service worker (offline support) to register you need
to be on `http://` or `https://` rather than `file://`, so for local work:

```sh
python3 -m http.server 8765     # then open http://localhost:8765
```

## Hosting on GitHub Pages

Same setup as CruxLog — the repo root *is* the site.

```sh
git remote add origin https://github.com/<you>/roomspin.git
git push -u origin main
```

Then in the repo on GitHub: **Settings → Pages → Source: "Deploy from a branch" → Branch:
`main`, folder: `/ (root)` → Save.** It publishes at `https://<you>.github.io/roomspin/`
within a minute or two. Open that on your phone and use the browser's "Add to Home Screen" to
install it as an app.

**After every deploy, bump two things together** or phones will keep serving the old build
from cache:

- `CACHE` in `sw.js` (`roomspin-v1` → `roomspin-v2`)
- `APP_VERSION` in `js/constants.js` (shown next to the title, so you can tell at a glance
  which build is actually running)

## How the weighting works

```
weight = (11 − rating) ^ bias
```

Each room's share of the wheel is its weight over the total. The `11` rather than `10` is
deliberate: a perfect 10/10 room keeps a weight of 1 instead of dropping to 0, so a finished
room still surfaces occasionally — a 10 today drifts to a 9 in a year, and the spin should be
able to catch that. To take a room out of the pool entirely, put it **on hold**; a high rating
is not a way to remove it.

`bias` is set on the Data tab: `0` ignores ratings completely, `2` (the default) makes a 2/10
room come up about 16× as often as an 8/10 one, `3` lets the worst room dominate. The Spin tab
shows the exact odds for your actual house.

Ratings move in **half points** via the slider, and fractional ratings feed straight into the
weighting — a 6.5 sits properly between a 6 and a 7 on the wheel.

## Layout

```
index.html              app shell + boot
styles.css              Material Design 3 token layer, then components
sw.js                   service worker (bump CACHE on deploy)
js/constants.js         palette, bias levels, starter rooms, storage defaults
js/utils.js             dates, escaping, rating formatting/snapping
js/logic.js             weighting, spin pool, week lifecycle, house stats
js/state.js             load/save/migrate localStorage, transient UI state
js/wheel.js             wheel geometry (wedge angles ∝ probability)
js/spin.js              spin animation and landing maths
js/render-*.js          one file per tab, each returning an HTML string
js/wire.js              event handlers, re-attached after every render
js/io.js                backup / restore / clipboard summary
tests/harness.html      test suite — see below
```

Rendering is deliberately dumb: mutate state, re-render the tab's HTML string, re-attach
handlers. The only exceptions are documented in the code — the slider repaints in place mid-
drag (re-rendering would drop the pointer capture), and the wheel's rotation is nudged after
insertion so the CSS transition has a from-value.

## Tests

`tests/harness.html` loads the real application files and runs ~150 assertions covering the
weighting maths (including a 60,000-draw distribution check), wheel geometry, the week
lifecycle, corrupt/hand-edited storage, import validation, HTML escaping, every tab's render
in every notable state, and the wired-up controls. It also asserts every interactive control
meets a 44px touch target — that check is what caught a field that had been left unstyled.

Serve the repo and open `http://localhost:8765/tests/harness.html`. Green means all passed;
any failure is printed at the top with the offending values.

## Your data

Everything is in `localStorage` under `roomspin-v1`, on that one device and browser. There is
no account and nothing is uploaded. The Data tab downloads a JSON backup and restores one —
worth doing occasionally, since clearing site data or switching browsers loses it. If the
stored data is ever unreadable, it is copied to `roomspin-v1-corrupt-backup` rather than
discarded, and the app tells you so.

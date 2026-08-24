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

## Design pillars

Every punch-list item can be tagged with one of nine pillars — **light, color, texture,
layout, storage, greenery, character, comfort, repair**. One vocabulary covers inside and out
on purpose: a patio needs light, texture and greenery for the same reasons a living room does,
and a separate exterior set would make coverage incomparable between rooms.

The tag isn't the point, the **coverage** is. A room reads as finished when several pillars are
handled at once — good lighting in a bare, hard-surfaced room still feels unfinished — so the
room and job views show a nine-tile grid with the empty pillars hollow. That's the prompt for
"what would actually take this to a ten?". Tapping a hollow tile starts an item already tagged
with it.

`repair` sits last deliberately. It isn't a design pillar, it's the baseline: nothing else in a
room reads properly while something is visibly broken.

Items are auto-tagged from their wording as you type them (`suggestPillar` in
`js/constants.js`), and one tap changes it. Anything the keywords don't recognise stays
untagged rather than being forced into a pillar it doesn't belong in.

## Sharing a house between two people

Optional, off by default. A device that never connects stays entirely local and makes no
network requests at all, so the public build still works for anyone who opens the link.

The shared house is a single JSON file in a **private** GitHub repo, written through the
contents API. No extra service, no server, no third-party JavaScript — and because every write
is an ordinary commit, the shared house gets full version history that you can browse and
revert on github.com.

**Setup, once per person:**

1. Make a **private** repo to hold the data (it must not be the same repo as this app).
2. Create a **fine-grained** personal access token at
   *Settings → Developer settings → Personal access tokens → Fine-grained tokens*:
   - **Repository access:** Only select repositories → the private data repo
   - **Permissions:** Repository permissions → **Contents: Read and write** (nothing else)
   - Set an expiry
3. In the app: **Data → Shared house**, enter the owner, repo name, file path
   (`roomspin.json` is fine), and the token. Tap **Connect**.

The second person repeats step 2 with their own token — the repo owner grants access by adding
them as a collaborator on the private repo.

**When it syncs.** Automatically — the button is only a manual override:

| Trigger | When |
| --- | --- |
| App opened (cold start) | every launch |
| App returns to the foreground | resuming from the app switcher, if the last sync was over 20s ago |
| Any edit | ~1.6s after you stop editing, so a burst of changes becomes one commit |
| Connectivity returns | as soon as the device is back online |
| **Sync now** | when you want to force it |

Each sync is a single read-merge-write, so it pulls and pushes at the same time. The one case
that still needs a tap is both apps sitting open on screen at once — there is no live push, so
her change lands on your screen when your app next foregrounds, when you next edit, or when you
hit **Sync now**.

**About the token.** It is stored only in that browser's `localStorage`, is deliberately kept
out of `store` so it can never ride along in a downloaded backup, and is never sent anywhere
except `api.github.com`. Two things worth knowing: anyone with the phone unlocked can read it,
and all of a user's GitHub Pages sites share one origin (`<user>.github.io`), so a scripting
flaw in *any* site you host there could read it. That is exactly why the instructions insist on
a fine-grained, single-repo, expiring token: the blast radius is then one private data repo.

**How conflicts resolve.** Per field, not per document. Every room and every task carries its
own `updatedAt`, and deletions leave tombstones, so one of you ticking a checklist item while
the other re-rates the same room keeps both changes. Only a genuine edit to the same field is
resolved by "later wins".

Stamps come from a hybrid logical clock rather than `Date.now()` directly: each stamp is forced
to exceed every stamp that device has seen, including ones that arrived from the other phone.
Without that, whichever phone's clock ran fast would silently win every conflict until the
other caught up.

**Resetting.** "Reset all data" on a connected device wipes the shared house for *both* of you
on the next sync. Disconnect first if you only mean to reset your own phone.

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
js/sync.js              shared-house sync: GitHub client + the per-field merge
tests/harness.html      test suite — see below
```

Rendering is deliberately dumb: mutate state, re-render the tab's HTML string, re-attach
handlers. The only exceptions are documented in the code — the slider repaints in place mid-
drag (re-rendering would drop the pointer capture), and the wheel's rotation is nudged after
insertion so the CSS transition has a from-value.

## Tests

`tests/harness.html` loads the real application files and runs ~200 assertions covering the
weighting maths (including a 60,000-draw distribution check), wheel geometry, the week
lifecycle, corrupt/hand-edited storage, import validation, HTML escaping, every tab's render
in every notable state, and the wired-up controls. Sync gets its own block: merge scenarios
for two devices, clock skew, and a full cycle driven against a stubbed GitHub API including a
409 retry and disconnect.

Two of the checks exist because they caught real bugs and are cheap to keep: every interactive
control must meet a 44px touch target (which found a field left unstyled after a refactor), and
no rendered tab may contain the string `undefined` (which found a missing icon key rendering
into the page instead of throwing).

Serve the repo and open `http://localhost:8765/tests/harness.html`. Green means all passed;
any failure is printed at the top with the offending values.

## Your data

Everything is in `localStorage` under `roomspin-v1`, on that one device and browser. There is
no account and nothing is uploaded. The Data tab downloads a JSON backup and restores one —
worth doing occasionally, since clearing site data or switching browsers loses it. If the
stored data is ever unreadable, it is copied to `roomspin-v1-corrupt-backup` rather than
discarded, and the app tells you so.

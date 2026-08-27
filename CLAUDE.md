# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

FaceWires — a React frontend for a Picasa-style face-tagging/review tool. Users browse photo folders or
detected "people," and assign/confirm/reject face detections against people via a Django REST backend
(`picasa.exploretheworld.tech/api`). SSO/auth is handled by an external Authelia instance, not by this app.

## Workflow preferences

**Remote Control sessions:** when the user is driving this session via Remote Control (not typing
directly at this terminal), propose code changes and get explicit approval before making them —
don't edit/write files autonomously. This applies to any code change, not just git commits.

## Commands

```bash
npm start      # Vite dev server on port 3000 (also used inside Docker via docker-compose)
npm run build  # Vite production build
npm run serve  # Preview the production build
```

There is no test suite and no lint script configured — don't invent commands that aren't in `package.json`.

The repo also ships a legacy `webpack.config.js` / babel setup. It is not wired into any npm script and is
not part of the current build; Vite (`vite.config.js`) is the real build tool. Treat webpack config as
vestigial unless told otherwise.

Dev runs in Docker via `docker-compose.yml` (`picasa_frontend_dev` service, host port 8092 → container
3000), bind-mounting the repo into `/app` with polling-based file watching (`CHOKIDAR_USEPOLLING`, and
`vite.config.js`'s `watch.usePolling`) — needed because the mount is a network path.

## Architecture

**Auth flow (SSO via Authelia, not a local login form):**
`App.jsx` defines routes: `/faces` → `MainApp`, everything else redirects to Authelia SSO login
(`AUTHELIA_LOGIN_URL` from `src/config.js`), which bounces back to `/faces` on success. `MainApp`
(`src/components/mainApp.jsx`) calls `isLoggedIn()` (`src/components/isLoggedIn.jsx`) on mount, which pings
`/parameters/` and checks whether the response is JSON (logged in) vs HTML (redirected to a login page —
logged out). There is no username/password form in this app; `login.jsx` and `customContext.jsx` were
removed. Session state relies on cookies (`withCredentials`, `xsrfCookieName: 'csrftoken'`) set by the
Django backend/Authelia, not on tokens the frontend manages itself.

**Config duplication:** `src/config.js` and `src/components/config.js` are duplicate files (same exports:
`isDev`, `FRONTEND_URL`, `API_URL`, `AUTHELIA_LOGIN_URL`, `AUTHELIA_LOGOUT_URL`). Update both together when
changing URLs/environment logic, or consolidate them if doing a larger refactor.

**Data flow / state management:** No Redux/Context — state lives in class-component `state`, plus the
`store` package (localStorage-backed key/value) used as a poor-man's global for things like `api_url` and
`access_key`, read via `store.get(...)` throughout components rather than passed down as props everywhere.

**Component tree:**
`MainApp` → `PicasaScreen` (`picasaScreen.jsx`, the real root component) → tab switch between:
- **People tab:** `PersonSidebar` (list of tagged people) + `ImageScreen` → `Gallery` (grid of face crops)
- **Folders tab:** `FolderSidebar` (photo folders/albums by year) + `ImageScreen` → `Gallery`

`PicasaScreen` fetches the full people list (`/person_list/`) and folder list (`/folder_list/`) on mount,
paginating through DRF-style `{results, next, count}` responses via `compile_api_list` +
`mapWithConcurrency` (`concurrencyPool.jsx`) to fetch remaining pages in parallel (capped at
`PAGINATION_CONCURRENCY = 5`) rather than serially following `next`.

`Gallery` (`gallery.jsx`) is the core interaction surface: a virtualized (`react-window`) grid of `LazyImage` tiles
(`lazyImg.jsx`), single/shift/ctrl-click multi-select, double-click to open a full-size modal, and bulk
face operations (`close_unassigned`, `close_ignored`, `close_assigned`, `confirm_proposed`, `verify_face`)
sent via `PATCH /faces/bulk_operation/`. Keyboard shortcuts: `Delete` closes ignored faces (when on the
`.ignore`/unassigned person tab), `Shift+R` closes assigned faces.

**Special people:** two person records have magic names and are treated specially throughout
(`picasaScreen.jsx`, `personSidebar.jsx`, `gallery.jsx`): `_NO_FACE_ASSIGNED_`/`Unassigned` (faces not yet
attributed to anyone) and `.ignore` (faces marked to be excluded). Their ids are looked up by name at
startup and threaded through as `unassigned_person_id` / `ignore_person_id` props.

**API layer:** `axios_setup.jsx` creates a shared axios instance (`baseURL` from `store.get('api_url')`,
`withCredentials`, CSRF header wiring, `axios-retry` with 3 retries) used everywhere as `axiosInstance`.
`apiRetry.jsx` (`withRetry`) is a separate, app-level retry wrapper used around mutating calls (e.g. the
bulk face operation in `gallery.jsx`) — it retries only on network errors or 5xx, not on 4xx, with
increasing backoff. Don't conflate the two: `axios-retry` covers transient transport retries at the HTTP
client level, `withRetry` covers "surface an error to the user after a few tries" at the call-site level.

**Routing:** `react-router-dom` v5 (`Switch`/`Route`/`Redirect`), not v6 — don't introduce v6 APIs
(`Routes`, `element` prop, etc.).

**Undo/redo (not yet manually verified against the real backend — see "Currently in progress /
open" below):** `picasaScreen.jsx` owns a plain in-memory undo/redo stack (`state.undoStack`/
`undoPointer`, capped at 20 entries, never persisted to `store`/localStorage — deliberately,
since replaying a reversal against faces that moved some other way since the tab was last open
would be worse than just losing history on reload). Two action *kinds* are recorded right now,
each as one entry per bulk action (never one per face): `assign_to_person` ("send to other
person", recorded in `mutableSelect.jsx`'s `assignPerson`) and `close_unassigned` ("send to
ignore", recorded in `gallery.jsx`'s `runBulkOperation`), via a new `onRecordUndo` prop threaded
the same route as `updatePersonCounts`/`onApiError`. Undo negates the action's
originally-computed count deltas and fires the real reverse API call (see `faceActions.js`'s
`assignFaceToPerson`/`bulkFaceOperation`, shared by `gallery.jsx`, `mutableSelect.jsx`, and
`picasaScreen.jsx`'s undo/redo execution itself, which has no live `Gallery` instance to call
back into); redo reapplies the deltas and replays the original call. `confirm_proposed`
("confirm") and `verify_face` aren't recorded — see backend-blocked follow-ups below, both for
the same root cause (no trustworthy reverse operation). Toolbar buttons + Ctrl+Z/Ctrl+Y live in
`tabular_menu.jsx`/`picasaScreen.jsx`; undoing/redoing more than `BULK_CONFIRM_THRESHOLD` (10)
faces asks for confirmation first, since every reversal here is a real write against the live
backend.

**Known stale/inconsistent spots** (don't "fix" silently without confirming — some may be work in
progress): `README.md` is unmodified Create React App boilerplate and doesn't reflect the Vite/Docker
setup actually used. (This note used to also flag `src/index.jsx` for `ReactDOM.render`/hardcoded
`api_url` — both already fixed as of 2026-08-27; `index.jsx` uses `createRoot` and `API_URL` from
`config.js`.)

## Project context (carried over from a chat session)

FaceWires — React 18 / Vite SPA frontend for a Django REST Framework +
PostgreSQL backend ("picasa"), running in Docker. Migrated from Create
React App to Vite, and from JWT auth to Authelia OIDC + Django
session-cookie auth.

- Dev frontend: https://facewire_dev.exploretheworld.tech (container
  picasa_frontend_dev, port 8092)
- Prod frontend: https://facewire.exploretheworld.tech (container
  picasa_frontend, port 8081)
- Backend API: https://picasa.exploretheworld.tech/api

**Two separate host checkouts of this same repo, same as the backend's
`django_picasa`/`django_picasa_dev` split** — dev at
`/home/benjamin/git_repos/dev_facewire` (branch `vite_upgrade` during
active development), prod at `/home/benjamin/git_repos/facewires_frontend`
(tracks `master`). `docker-compose.yml` defines both services
(`picasa_frontend_dev` / `picasa_frontend`) in one file that's checked
into git and thus identical in both checkouts — `build: context: .`
resolves relative to wherever the file actually lives, so which service
you run from which directory is what determines dev vs prod, not the
file contents. Dev bind-mounts source into a live `vite` dev server
(`Dockerfile`, `npm start`); prod has no bind mount at all and instead
builds a static bundle baked into the image (`Dockerfile.prod`: multi-stage
`vite build` → serve `dist/` with the `serve` npm package on port 3000/8081).
**A prod deploy is: merge to `master` and push, `git pull` inside the
`facewires_frontend` checkout, then `docker-compose up -d --build
picasa_frontend` from there** — there is no automatic deploy-on-push.

As of 2026-08-27: the backend (`django_picasa`, `master`, container
`picasa_api`) had already been fully migrated to Authelia/session-cookie
auth and CORS for a while — but the frontend prod checkout was still
running the *original* pre-migration Create React App app (Node 13, PM2,
the old JWT login form) until this date, since `vite_upgrade` had never
been merged to `master` before. A prior note here claiming "both
migrations are complete... on prod" was wrong for the frontend half of
that sentence — worth remembering next time prod and dev seem to disagree
about something: check which commit prod is actually on before assuming
its behavior, don't assume this file's history describes what's live.

### Bugs fixed this migration (for context, not to redo)
- mainApp.jsx was missing a config.js import, causing SSO checks to
  hang silently — fixed.
- Django's CORS regex didn't allow underscores in subdomains
  (facewire_dev), causing an infinite Authelia redirect loop — fixed.
- axios wasn't sending the X-CSRFToken header on cross-subdomain
  PATCH/POST requests (axios's cross-origin XSRF default) — fixed by
  adding `withXSRFToken: true` to the axios instance.
- Removed dead JWT-era code (axios-auth-refresh, token polling) now
  that auth is cookie/session based via Authelia.
- Added a withRetry helper (src/components/apiRetry.js) with an
  error banner for API write calls that can transiently fail.
- Fixed direct-state-mutation bugs, memoized gallery image rendering
  (React.memo/PureComponent + stabilized onClick + shared
  get_unique_list callback instead of passing the full imgsSelected
  array to every thumbnail).
- Deleted dead files: pcScreenTest.jsx, login.jsx, customContext.jsx.

### Currently in progress / open
- Fixed (2026-08-27): `buildCountDeltas`'s `close_assigned` case
  (`gallery.jsx`) always credited Unassigned's sidebar count with every
  rejected face, including ones rejected as a candidate for `.ignore`
  specifically. `reject_association()` (the backend method behind the
  `proposed`/possible-match sub-case) never touches `declared_name` — a
  face with `.ignore` as a possible match already has `declared_name ===
  Unassigned`, so it was already sitting in Unassigned's count before the
  action, not newly added by it. Only the `defined` sub-case (a face
  actually declared to `.ignore`, moved to Unassigned via
  `associate_person(blank_person.id)`) is a real transition into
  Unassigned's queue. Fixed by only counting `definedCount` toward
  Unassigned when `current_person_id === ignore_person_id`, vs. the full
  `n` (both defined + proposed) for every other person, where rejecting a
  possible-match candidate is still the case this delta was originally
  written for.
- Changed (2026-08-27): the red X on the `.ignore` screen (`lazyImg.jsx`'s
  ignore-tab delete button) now fires `close_assigned` instead of
  `close_ignored`, per explicit user request. Previously it called
  `close_ignored`, which the backend (`api/views.py`'s `bulk_thread`)
  treats as promoting the face to a second, separate "hard ignore" person
  (`.realignore`) — a one-way move with no UI anywhere to review or undo
  it (`.realignore` isn't one of the special-cased sidebar names, and
  isn't in the undo/redo stack). The user wants the same behavior as the
  "no" (x) button everywhere else instead: `close_assigned` either rejects
  `.ignore` as a possible-match candidate (if the face was only a
  `proposed` suggestion) or reassigns it to Unassigned (if it was already
  declared to `.ignore`) — see `buildCountDeltas`'s `close_assigned` case
  (`gallery.jsx`), unchanged, already handles both cases correctly
  regardless of which tab triggered it. `close_ignored`/`.realignore`
  remain wired up server-side and in `buildCountDeltas` (deliberately left
  as-is, per the user - "not useful right now" but harmless) - just no
  longer reachable from this specific button. The right-click "Remove
  from person" menu item already called `close_assigned` for every tab
  including `.ignore`, so this makes the dedicated X button consistent
  with it instead of the two disagreeing.
- Fixed (2026-08-26): `PicasaScreen`'s initial load (params/people/folders fetch, all
  three fire from the constructor/`componentDidMount`) used to hang on the loading spinner
  forever instead of failing visibly, in two cases: (1) backend unreachable — `fetchAPIURL`
  used to swallow axios errors with a `console.log` and never resolve/reject the promise it
  returned, so the `await` in `compile_api_list` just hung; (2) the people list coming back
  empty (or missing the special `_NO_FACE_ASSIGNED_`/`.ignore` records) — `fetchPeopleList`
  did `resp[0].id` unconditionally, which threw inside a `.then` with no `.catch` anywhere
  in the chain, becoming a silent unhandled rejection. Fixed by having `fetchAPIURL`/
  `compile_api_list` actually reject on failure, guarding the empty/malformed-people-list
  case explicitly, and adding a `loadError` state string that all three initial fetch chains
  set on failure; `render()` shows a "Something went wrong" screen with Retry/Logout buttons
  instead of the spinner when it's set, instead of spinning indefinitely.
- Not yet verified: the undo/redo feature (send-to-other-person, send-to-ignore, confirm —
  see "Undo/redo" under Architecture above) was built and passes a container build, but hasn't
  been manually clicked through against the real backend yet (undo/redo round-trips, the
  >10-face confirm prompt, Ctrl+Z/Ctrl+Y, failure rollback, etc. — see the plan's Verification
  section for the full checklist). Don't assume it works end-to-end until that's done.
- Fixed (2026-08-25): `Gallery.fetchMoreData` (gallery.jsx) used to rebuild
  `state.items` via `.concat()` on every infinite-scroll page load
  (copying the whole accumulated list each time), and `computeVisibleRows`
  used to re-filter/re-chunk that entire list on every call too — cost of
  both grew with total images loaded, so scrolling deep into a large
  gallery (or the first load of a large `.ignore` bucket) got progressively
  slower. Fixed by switching to an append-only pattern: `this.itemsRef`
  is a plain mutable array `fetchMoreData` pushes new pages onto directly
  (`state.itemsVersion`, a plain counter, is bumped alongside it purely to
  trigger a re-render — itemsRef's own identity never changes so React
  needs something else to notice). `computeVisibleRows` now only
  processes the newly-appended tail on the common path (item count grew,
  `hidden`/`columnCount` didn't) instead of recomputing from scratch;
  a real change to `hidden` (any bulk face action) or `columnCount`
  (resize) still triggers a full rebuild, since those can affect items
  already baked into the cache too. `buildCountDeltas`'s old `typeById`
  scan (built fresh from `state.items` on every bulk action) similarly
  became `this._typeById`, maintained incrementally in `fetchMoreData`
  instead. Doesn't affect correctness — same behavior as before, just not
  re-derived from scratch every time.
- Fixed (2026-08-26): the gallery grid is now virtualized (`react-window`'s
  `List`, one row of tiles per list row — `gallery.jsx`). Previously every
  loaded face tile stayed mounted as a live DOM `<img>` forever (via
  LazyImage) even once scrolled far out of view, on a `float: left`-based
  grid where hiding even one face forced the browser to re-layout every
  floated sibling after it — headless-profiled (Puppeteer, mocked backend)
  against a synthetic 6,000-item `.ignore` gallery: ~2.0s of continuous
  main-thread work on a single "send to ignore" click, ~60% of it browser
  style/layout recalculation, before this fix; ~0.86s after, with the
  layout-specific cost (`Blink.Layout.UpdateTime`) down roughly 7x. DOM
  tile count now stays flat (~100-150, viewport-bound) regardless of scroll
  depth or total dataset size, instead of growing unboundedly.
  Implementation notes for future changes to `gallery.jsx`:
  - The old "infinite scroll" (`fetchMoreData`/`itemsRef` pagination,
    100-at-a-time) is gone entirely — `ImageScreen` already fetches the
    *complete* `img_ids`/`poss_ids` array before ever mounting a `Gallery`
    (see "Architecture" above), so there was never real backend pagination
    to preserve; `buildItems()` now builds the full item list once, up
    front, and `react-window` alone decides what actually renders.
  - `.imgDiv` tiles are no longer floated — each row is a CSS grid
    (`.galleryRow`, `display: grid`, `grid-template-columns` set inline
    per row from the live-measured column count) built explicitly from
    `computeVisibleRows()`'s row grouping, with the row-action button
    (Confirm row/Verify row) as a pinned last grid cell instead of
    absolutely-positioned math.
  - Tile size and row-button width are declared once as CSS custom
    properties (`--tile-size`, `--row-button-width` in `image_tile.css`)
    and read via `getComputedStyle` (see `readSizeVars` in `gallery.jsx`)
    rather than measured off a live-rendered DOM node — single source of
    truth, and avoids a chicken-and-egg "can't size the virtualized list
    until something's already rendered" problem. If either of those two
    CSS values ever changes, nothing needs updating in `gallery.jsx` — it
    reads them live — but if a *third* tile-affecting property is ever
    added there, it needs its own custom property too, the same way.
  - Column count is still measured live (matches the container's actual
    rendered width, same as before) — but now comes from `react-window`'s
    own `onResize` callback (`handleListResize`) instead of a
    hand-rolled `ResizeObserver` + `gridRef`.
  - `hidden` faces are now filtered out of the row list entirely (not
    just CSS `display:none`'d) — closing/ignoring a face now actually
    stops it from being a DOM node at all, rather than leaving it mounted
    forever with `.hidden_img`.
  - Dropped the `trackWindowScroll`/`scrollPosition` wiring
    (`react-lazy-load-image-component`) — it existed to gate lazy-loading
    against *window* scroll position, which no longer applies now that
    the gallery scrolls in its own internal box (see below) and
    `react-window` already only mounts tiles that are in view.
    `mutableSelect.jsx` had a standing comment about working around
    "gallery-wide re-renders trackWindowScroll forces on scroll" — that
    workaround is now moot, though harmless to leave in place.
  - **User-visible change**: the gallery grid now scrolls in its own
    internal box (height = viewport minus header/menu bar, same formula
    `.infinite-scroll-component`'s old `min-height` used) instead of the
    whole page scrolling together — a deliberate tradeoff (confirmed with
    the user) since `react-window` needs to own a fixed-height scroll
    container. The sidebar/header stay fixed; only the tile grid scrolls.
  - Fixed (2026-08-27): the per-tile right-click context menu
    (`react-contexify`'s `<Menu>`, `lazyImg.jsx`) showed up offset by
    several rows/columns from the tile it was opened on, and behind other
    tiles. Same root cause and same fix as the `MutableSelect` dropdown
    fix above, just a second, independent component hitting it:
    react-contexify positions its menu with `position: fixed` computed
    from the raw click coordinates, but a `position: fixed` element's
    containing block becomes its nearest ancestor with a CSS `transform`
    if one exists (per the CSS spec) — and every tile sits inside a
    react-window row `<div>` that has exactly that
    (`transform: translateY(...)`, for virtualized row positioning).
    Fixed by wrapping the `<Menu>` in `createPortal(..., document.body)`,
    same as `MutableSelect`'s. Worth remembering for *any* future
    `position: fixed` UI added inside a gallery tile — it needs a portal
    too, for the same reason.
  - `handleRowAction` (Confirm row/Verify row) now scrolls the list back
    to row 0 (`this.listRef.current.scrollToRow({index: 0, ...})`,
    `React.createRef()` passed to `<List listRef={...}>`) right after
    firing the bulk action. Confirming/verifying is "up to and including
    this row," which hides everything from the top of the gallery through
    the clicked row — the images that used to be *below* it become the
    new top of the list, but `scrollTop` doesn't move on its own, so
    without this the user keeps looking at whatever now happens to sit at
    that same pixel offset instead of picking up where they left off.
- Bug, root-caused and fixed — but **only on the backend's dev branch, not
  where this frontend's UI actually points**: "Remove from person"
  (close_assigned action, gallery.jsx/lazyImg.jsx - both the context-menu
  item and the "x" reject button call `api_action('close_assigned', face_id)`)
  never actually removed the face from the person, in both the verify tab
  and the main person gallery, and (once undo/redo shipped) undoing a
  "confirm" hit the identical symptom, since its only reverse was calling
  `close_assigned` too. Root cause, found 2026-08-24 in the backend repo
  (`django_picasa_dev`, `backend_upgrade` branch): `close_assigned` always
  called `Face.reject_association()`, which only knows how to decline a
  *proposed* candidate (asserts the person is in the face's `poss_identN`
  list) - it was never built to unassign an already-*declared* face, which
  is what "Remove from person"/undo-of-confirm actually need. The assert
  raised every time on a declared face, silently swallowed by the backend's
  own blanket exception handler, so the PATCH always reported success while
  doing nothing. Fixed in `api/views.py`'s `bulk_thread()` (branches on
  whether `current_person_id` is a possible-match candidate vs. the face's
  actual `declared_name`) with two new regression tests - see
  `django_picasa_dev/CLAUDE.md` for the full writeup.
  **This frontend talks to the production API (`picasa.exploretheworld.tech/api`,
  per this file's "Project context" section), not the dev backend the fix
  landed on** - so nothing changes here yet. Don't re-enable `confirm_proposed`
  in the undo/redo stack (see the follow-up below) or consider this bug
  actually resolved from this repo's side until the fix is ported to
  `master` and deployed to the live `picasa_api` container. Deliberately left
  as a TODO in the API repo for now rather than deployed immediately - see
  `django_picasa_dev/CLAUDE.md`.
- Bug to investigate: after the tab sits in the background for a while
  (laptop asleep, tab backgrounded, etc.) and the user comes back and
  clicks to a different person, no images render. Not yet diagnosed -
  plausible suspects worth checking first: the session cookie/CSRF
  token expiring while backgrounded (face images are plain `<img src>`
  tags hitting `/keyed_image/...` directly, not through axiosInstance,
  so an expired-session redirect there would fail silently with no
  error banner); the browser throttling background-tab timers, which
  could stall `PicasaScreen`'s 10-minute people-list refresh interval
  or `ImageScreen`'s fetch-generation bookkeeping; or `store`
  (localStorage) losing `access_key`/`api_url` some other way. Needs
  reproducing with dev tools open (Network tab, and check for console
  errors) to narrow down.
- Feature follow-up, blocked on backend: "Merge into..." (personSidebar.jsx
  context menu -> picasaScreen.jsx's submitMerge) currently only
  reassigns the source person's *confirmed* faces (num_faces) to the
  target, via a loop of the existing per-face assign_face_to_person
  PATCH. It deliberately leaves the source's possible/unconfirmed
  matches (num_possibilities) alone, since converting them to confirmed
  faces on the target would be presumptuous. What's actually wanted:
  reassign those possible matches to the target too, but *still as
  possible matches* (not auto-confirmed) - there's no backend endpoint
  for "change which person a proposed/possible match candidate is
  against" without confirming it. Needs that endpoint built before the
  frontend can do this; submitMerge is the place to wire it up once it
  exists.
- Feature follow-up, blocked on backend: after a merge, the source
  person's now-empty record isn't actually deleted on the backend -
  `finishMerge` (picasaScreen.jsx) only removes it from the frontend's
  local `state.people`. It stays hidden (fetchPeopleList already filters
  out num_faces===0 people other than the two special names), but sits
  as an orphan row server-side indefinitely. Needs a delete-person
  endpoint; once it exists, call it from finishMerge (or right after the
  reassignment loop in submitMerge) to actually clean up the source.
- Feature follow-up, blocked on backend: `verify_face` actions aren't part of
  the undo/redo stack (see "Undo/redo" above) because there's no "un-verify"
  endpoint - once a face is verified there's currently no way to reverse it.
  Once such an endpoint exists: record it in `gallery.jsx`'s `runBulkOperation`
  the same way `close_unassigned` is (new `onRecordUndo` call with
  `kind: 'verify_face'`), and add a matching case to `picasaScreen.jsx`'s
  `runUndoRedoCall` (reverse = the new un-verify call, forward = `verify_face`
  again).
- Feature follow-up, blocked on backend deploy (fix exists, just not live):
  `confirm_proposed` ("confirm") is also not part of the undo/redo stack,
  since its only available reverse (`close_assigned`) was the operation
  that was broken (see the bug entry above) - undoing a confirm looked like
  it worked locally but didn't actually persist. The backend fix now exists
  on `django_picasa_dev`'s `backend_upgrade` branch, but this frontend talks
  to the production API, which doesn't have it yet. Re-add it (same pattern
  as `close_unassigned` in `runBulkOperation`, plus a `case 'confirm_proposed'`
  back in `picasaScreen.jsx`'s `runUndoRedoCall` - see git history around
  2026-08-24 for the exact code that was removed) once the backend fix is
  actually deployed to the live `picasa_api` container - not merely fixed on
  the dev branch.
- Minor known gap: undoing an "assign to other person" that created a
  *brand-new* person (via `face_to_new_person`) doesn't delete that new person
  server-side - same underlying gap as the merge orphan-record issue above
  (no delete-person endpoint yet). The frontend just decrements its count back
  to 0 locally; it'll sit as an empty orphan row until that endpoint exists.
- Future feature, blocked on backend (not started - requested 2026-08-24): upload
  images to the backend via the API, with:
  - Drag-and-drop onto the page, plus a button to open the system file dialog,
    handling any number of files at once with a progress/loading bar.
  - Uploads should keep going in the background if the user navigates elsewhere
    in the app while they're in flight (i.e. not tied to whatever component
    happened to start them - needs to live somewhere that survives navigation,
    the same reasoning that put the undo/redo stack in `picasaScreen.jsx` rather
    than `Gallery`).
  - After each upload, verify the photo actually made it onto the backend/
    filesystem rather than just trusting a 200 from the initial request.
  - User-defined sub-directory name at upload time, so uploads land pre-segmented
    within the larger photo directory rather than all dumped in one place.
  - Backend currently only has *read* access to the photo filesystem - no upload
    endpoint exists at all yet. Needs: a new Django endpoint (accepting the
    file(s) + the target sub-directory name), a defined default upload root in
    the backend's `settings.py`, and - since the API container currently mounts
    the photo directory read-only - either mounting a specific writable
    sub-directory read/write in `docker-compose.yml`, or some other way to grant
    write access without opening up the whole photo tree. Needs backend design/
    implementation before any frontend work here can start.

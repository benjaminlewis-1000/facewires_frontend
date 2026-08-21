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

`Gallery` (`gallery.jsx`) is the core interaction surface: infinite-scroll grid of `LazyImage` tiles
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

**Known stale/inconsistent spots** (don't "fix" silently without confirming — some may be work in
progress): `src/index.jsx` still uses `ReactDOM.render` (not `createRoot`) and hardcodes
`store.set('api_url', ...)` rather than using `API_URL` from `config.js`; `README.md` is unmodified
Create React App boilerplate and doesn't reflect the Vite/Docker setup actually used.

## Project context (carried over from a chat session)

FaceWires — React 18 / Vite SPA frontend for a Django REST Framework +
PostgreSQL backend ("picasa"), running in Docker. Recently migrated
from Create React App to Vite, and from JWT auth to Authelia OIDC +
Django session-cookie auth. Both migrations are complete and working
on prod and dev.

- Dev frontend: https://facewire_dev.exploretheworld.tech (container
  picasa_frontend_dev, port 8092)
- Prod frontend: https://facewire.exploretheworld.tech
- Backend API: https://picasa.exploretheworld.tech/api

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
- Known perf issue (low priority, not yet fixed): `Gallery.fetchMoreData`
  (gallery.jsx) rebuilds `state.items` via `.concat()` on every
  infinite-scroll page load, copying the whole accumulated list each
  time — cost grows roughly with the square of total images loaded, so
  scrolling deep into a large gallery gets progressively slower. Doesn't
  affect correctness (the "confirm up to this row" bulk action still
  works on items scrolled out of view — nothing is removed from state).
- Known perf issue (low priority, not yet fixed): the gallery isn't
  virtualized — every loaded face tile stays mounted as a live DOM
  `<img>` (via LazyImage) even after scrolling past it, so long
  scrolling sessions accumulate real memory/render overhead. Fixing
  this properly means true windowing (e.g. react-window), which is a
  bigger change since row-button/column math currently assumes every
  item is present in the DOM to measure against.

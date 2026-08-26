# FaceWires

React frontend for a Picasa-style face-tagging/review tool. Users browse photo folders or detected
"people," and assign/confirm/reject face detections against people via a Django REST backend
(`picasa.exploretheworld.tech/api`). SSO/auth is handled by an external Authelia instance, not by this app.

Built with [Vite](https://vitejs.dev/) (not Create React App — this repo used to be CRA-based, but that
migration is complete). See `CLAUDE.md` for a fuller architecture overview.

## Scripts

```bash
npm start      # Vite dev server on port 3000
npm run build  # Vite production build
npm run serve  # Preview the production build
```

There is no test suite and no lint script configured.

## Running in Docker

Dev runs via `docker-compose.yml` (`picasa_frontend_dev` service, host port 8092 → container 3000),
bind-mounting the repo into `/app` with polling-based file watching (`CHOKIDAR_USEPOLLING`, and
`vite.config.js`'s `watch.usePolling`) — needed because the mount is a network path.

```bash
docker compose up picasa_frontend_dev
```

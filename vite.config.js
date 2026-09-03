import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // This replaces CHOKIDAR_USEPOLLING for Vite
    watch: {
      usePolling: true,
    },
    // Vite 5.4.x added DNS-rebinding protection: by default it only
    // accepts requests whose Host header is localhost/127.0.0.1/an IP,
    // rejecting anything else with a plain-text "Blocked request" page -
    // including the real domain this dev server is actually reached
    // through (facewire_dev.exploretheworld.tech, proxied in from
    // outside the container). Explicitly allowlisting it here restores
    // the pre-5.4 behavior for these known-safe hosts, without disabling
    // the protection outright (`true`). facewire.exploretheworld.tech
    // (prod) is included too per the user, though it's not actually
    // needed today - Dockerfile.prod never runs this dev server at all,
    // it does a one-time `vite build` and serves the static output with
    // the separate `serve` npm package instead - only harmless to have
    // listed here in case that ever changes.
    allowedHosts: ['facewire_dev.exploretheworld.tech', 'facewire.exploretheworld.tech'],
  },
});
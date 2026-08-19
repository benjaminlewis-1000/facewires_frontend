import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // This ensures Vite runs on the port your Docker setup expects
    port: 3000,
    // host: true is required for Docker containers to expose the port to the host machine
    host: true, 
  },
});

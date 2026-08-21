import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The admin dashboard talks to the API at VITE_API_BASE (default :4000).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});

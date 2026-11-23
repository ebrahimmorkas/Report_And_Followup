import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy API calls to Express so the HttpOnly cookie is same-origin.
    proxy: { '/api': 'http://localhost:5000' },
  },
});

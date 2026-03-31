import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Assets em /spa/* — o Express serve index.html em /login e /dashboard/*
export default defineConfig({
  plugins: [react()],
  base: '/spa/',
  build: {
    outDir: '../backend/public/spa',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: 'http://localhost:8080', changeOrigin: true },
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
});

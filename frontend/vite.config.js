import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev  → base '/'      → acessa localhost:5173/expedicao/bling
// prod → base '/spa/'  → Railway serve em /spa/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/spa/' : '/',
  build: {
    outDir: '../backend/public/spa',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/bling':   { target: 'http://localhost:8080', changeOrigin: true },
      '/orders':  { target: 'http://localhost:8080', changeOrigin: true },
      '/api':     { target: 'http://localhost:8080', changeOrigin: true },
      '/auth':    { target: 'http://localhost:8080', changeOrigin: true },
      '/admin':   { target: 'http://localhost:8080', changeOrigin: true },
      '/produtos': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
}));

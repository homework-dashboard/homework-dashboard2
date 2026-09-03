import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { copyFileSync, existsSync } from 'node:fs';

// Copies dist/index.html → dist/404.html after build so GitHub Pages
// serves the SPA for any deep link (GitHub Pages uses 404.html as fallback).
function githubPages404(): Plugin {
  return {
    name: 'github-pages-404',
    closeBundle() {
      const indexHtml = fileURLToPath(new URL('./dist/index.html', import.meta.url));
      const notFoundHtml = fileURLToPath(new URL('./dist/404.html', import.meta.url));
      if (existsSync(indexHtml)) {
        copyFileSync(indexHtml, notFoundHtml);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [react(), githubPages404()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
}));

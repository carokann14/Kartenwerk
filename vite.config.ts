import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// "npm run build"          → docs/  (für GitHub Pages: Branch main, Ordner /docs)
// "npm run build:preview"  → preview/ (eine einzige HTML-Datei, Daten eingebettet)
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'preview' ? [react(), viteSingleFile()] : [react()],
  build: {
    outDir: mode === 'preview' ? 'preview' : 'docs',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
}));

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolve = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Сборка ТОЛЬКО варианта А — для честного замера веса продакшн-бандла. */
export default defineConfig({
  root: resolve('.'),
  plugins: [react()],
  build: {
    outDir: resolve('./dist-a'),
    emptyOutDir: true,
    rollupOptions: { input: resolve('./index-a.html') },
  },
});

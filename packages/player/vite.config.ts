import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const resolve = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Сборка плеера в САМОСТОЯТЕЛЬНЫЙ ESM-бандл (инвариант №9).
 *
 * Ничего не помечено как external намеренно: бандл обязан открываться
 * в голом HTML-файле, где нет ни сборщика, ни карты импортов. Всё, что
 * нужно плееру, включая zod и anime.js, лежит внутри.
 *
 * Кладём результат в public стенда, чтобы тест мог открыть его по обычному
 * URL и убедиться, что браузер справляется без нашей помощи.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@player/core': resolve('../core/src/index.ts'),
    },
  },
  build: {
    outDir: resolve('../../apps/playground/public/bundle'),
    emptyOutDir: true,
    target: 'es2023',
    lib: {
      entry: resolve('src/index.ts'),
      formats: ['es'],
      fileName: () => 'player.js',
    },
    rollupOptions: {
      // Пустой список внешних зависимостей — это и есть требование
      // самодостаточности, выраженное в конфигурации.
      external: [],
    },
  },
});

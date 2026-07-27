import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const resolve = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * Отдаёт эталонные фикстуры по /fixtures/<имя>.json прямо из fixtures/projects.
 *
 * Копировать их в public нельзя: копия неизбежно разойдётся с оригиналом,
 * а эталоны у нас неприкосновенны. Плагин отдаёт тот самый файл, который
 * читают тесты.
 */
function serveFixtures(): Plugin {
  return {
    name: 'serve-fixtures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/fixtures\/([\w-]+\.json)$/.exec(req.url ?? '');
        if (!match) return next();
        const file = resolve(`../../fixtures/projects/${match[1]}`);
        readFile(file, 'utf8').then(
          (body) => {
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(body);
          },
          (error: unknown) => {
            res.statusCode = 404;
            res.end(`Фикстура не найдена: ${match[1]} (${String(error)})`);
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [serveFixtures()],
  resolve: {
    alias: {
      // Стенд работает с исходниками пакетов напрямую: правка в player
      // видна сразу, без пересборки. Направление зависимостей при этом
      // не нарушается — алиасы ведут только вниз.
      '@player/core': resolve('../../packages/core/src/index.ts'),
      '@player/player': resolve('../../packages/player/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: {
      // Фикстуры лежат выше по дереву, чем корень стенда.
      allow: [resolve('../..')],
    },
  },
  // Эталонные фикстуры отдаём как есть, не копируя: копия неизбежно
  // разойдётся с оригиналом, а они у нас неприкосновенны.
  publicDir: resolve('public'),
});

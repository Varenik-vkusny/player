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

/**
 * Отдаёт шрифты скриншотных тестов по /fonts/<имя> прямо из e2e/fonts.
 *
 * Ровно та же причина, что и у фикстур: копия в public неизбежно разойдётся
 * с оригиналом. Шрифты живут рядом со своими лицензиями и README в e2e/fonts,
 * потому что это тестовая оснастка, а не ресурс продукта, — но браузеру их
 * надо отдать по обычному адресу.
 */
function serveTestFonts(): Plugin {
  return {
    name: 'serve-test-fonts',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/fonts\/([\w.-]+\.(?:woff2|css))$/.exec(req.url ?? '');
        if (!match) return next();
        const name = match[1] as string;
        const file = resolve(`../../e2e/fonts/${name}`);
        readFile(file).then(
          (body) => {
            res.setHeader(
              'content-type',
              name.endsWith('.css') ? 'text/css; charset=utf-8' : 'font/woff2',
            );
            res.setHeader('cache-control', 'no-store');
            res.end(body);
          },
          (error: unknown) => {
            res.statusCode = 404;
            res.end(`Шрифт не найден: ${name} (${String(error)})`);
          },
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [serveFixtures(), serveTestFonts()],
  resolve: {
    alias: {
      // Стенд работает с исходниками пакетов напрямую: правка в player
      // видна сразу, без пересборки. Направление зависимостей при этом
      // не нарушается — алиасы ведут только вниз.
      '@player/core': resolve('../../packages/core/src/index.ts'),
      '@player/player': resolve('../../packages/player/src/index.ts'),
      '@player/editor': resolve('../../packages/editor/src/index.ts'),
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

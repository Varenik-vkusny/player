import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolve = (path) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Отдаёт эталонную фикстуру по /fixtures/<имя>.json прямо из fixtures/projects.
 * Копировать нельзя: копия разойдётся с оригиналом, а conditions.json
 * неприкосновенна. Тот же приём, что в spikes/editor-stack/vite.config.mjs.
 */
function serveFixtures() {
  return {
    name: 'serve-fixtures',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = /^\/fixtures\/([\w-]+\.json)$/.exec(req.url ?? '');
        if (!match) return next();
        readFile(resolve(`../../fixtures/projects/${match[1]}`), 'utf8').then(
          (body) => {
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(body);
          },
          (error) => {
            res.statusCode = 404;
            res.end(`Фикстура не найдена: ${match[1]} (${String(error)})`);
          },
        );
      });
    },
  };
}

export default defineConfig({
  root: resolve('.'),
  plugins: [react(), serveFixtures()],
  server: { port: 5193, strictPort: true, fs: { allow: [resolve('../..')] } },
});

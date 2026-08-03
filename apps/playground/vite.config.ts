import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

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

/** Разобранное слово расшифровки, отдаётся клиенту вместо сырого ответа Deepgram. */
interface TranscribeWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly confidence: number;
}

/** Узкий ответ дев-эндпоинта расшифровки — то, что нужно клиенту, и ничего лишнего. */
interface TranscribeResponse {
  readonly words: readonly TranscribeWord[];
  readonly transcript: string;
  readonly durationSeconds: number;
}

/** Форма ответа Deepgram `POST /v1/listen`, сужаем только то, что читаем. */
interface DeepgramListenResponse {
  readonly metadata: { readonly duration: number };
  readonly results: {
    readonly channels: readonly {
      readonly alternatives: readonly {
        readonly transcript: string;
        readonly words: readonly {
          readonly word: string;
          readonly punctuated_word?: string;
          readonly start: number;
          readonly end: number;
          readonly confidence: number;
        }[];
      }[];
    }[];
  };
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: import('node:http').IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Ключ Deepgram обязан остаться на сервере: `VITE_`-переменная попадает
 * в бандл и видна любому, кто откроет вкладку. Дев-сервер Vite — единственный
 * сервер, который у проекта есть, поэтому расшифровка идёт через него.
 *
 * Отсутствие ключа — законный случай (продукт обязан работать без
 * расшифровки), а не поломка: отвечаем 503 с внятным текстом, а не глушим.
 */
function transcribeApi(apiKey: string | undefined): Plugin {
  return {
    name: 'transcribe-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'POST' || !/^\/api\/transcribe(?:\?|$)/.test(req.url ?? '')) {
          next();
          return;
        }
        void handle(req, res);
      });

      async function handle(
        req: import('node:http').IncomingMessage,
        res: import('node:http').ServerResponse,
      ): Promise<void> {
        if (!apiKey) {
          sendJson(res, 503, {
            error: 'нет ключа',
            detail: 'DEEPGRAM_API_KEY не задан в .env — расшифровка недоступна в этом дев-стенде, продукт должен работать и без неё',
          });
          return;
        }

        const language = new URL(req.url ?? '', 'http://localhost').searchParams.get('language') ?? 'ru';
        const body = await readRequestBody(req);
        const contentType = req.headers['content-type'] ?? 'application/octet-stream';

        const deepgramUrl = new URL('https://api.deepgram.com/v1/listen');
        deepgramUrl.searchParams.set('model', 'nova-3');
        deepgramUrl.searchParams.set('language', language);
        deepgramUrl.searchParams.set('punctuate', 'true');
        deepgramUrl.searchParams.set('smart_format', 'false');

        const upstream = await fetch(deepgramUrl, {
          method: 'POST',
          headers: { Authorization: `Token ${apiKey}`, 'content-type': contentType },
          body,
        });

        if (!upstream.ok) {
          const detail = await upstream.text();
          sendJson(res, 502, { error: 'Deepgram отклонил запрос', detail });
          return;
        }

        const data = (await upstream.json()) as DeepgramListenResponse;
        const alternative = data.results.channels[0]?.alternatives[0];
        if (!alternative) {
          sendJson(res, 502, {
            error: 'Deepgram вернул пустой ответ',
            detail: JSON.stringify(data),
          });
          return;
        }

        const response: TranscribeResponse = {
          words: alternative.words.map((word) => ({
            text: word.punctuated_word ?? word.word,
            start: word.start,
            end: word.end,
            confidence: word.confidence,
          })),
          transcript: alternative.transcript,
          durationSeconds: data.metadata.duration,
        };
        sendJson(res, 200, response);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env лежит в корне репозитория, а не в apps/playground: без явного envDir
  // Vite ищет .env рядом со своим конфигом и ключ не найдёт. Третий аргумент
  // '' убирает требование префикса VITE_ — ключ обязан НЕ попасть в бандл,
  // а значит не может называться VITE_DEEPGRAM_API_KEY.
  const rootEnv = loadEnv(mode, resolve('../..'), '');
  const apiKey = rootEnv.DEEPGRAM_API_KEY || undefined;

  return {
    plugins: [serveFixtures(), serveTestFonts(), transcribeApi(apiKey)],
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
      // 5179, а не общевайтовый 5173. Порт по умолчанию занимают соседние
      // проекты на той же машине, и это не теория: 03.08.2026 e2e полчаса
      // гонялись по чужому сайту, потому что на 5173 стоял дев-сервер
      // другого проекта, а `reuseExistingServer` в playwright.config.ts
      // берёт всё, что отвечает по адресу, не спрашивая, наше ли оно.
      port: 5179,
      // Без strictPort vite при занятом порте молча берёт следующий
      // свободный. Тогда стенд поднимается на 5180, Playwright продолжает
      // ходить на 5179, находит там чужое — и падает так, что причину
      // приходится искать по снимку чужой страницы. Пусть падает сразу.
      strictPort: true,
      fs: {
        // Фикстуры лежат выше по дереву, чем корень стенда.
        allow: [resolve('../..')],
      },
    },
    // Эталонные фикстуры отдаём как есть, не копируя: копия неизбежно
    // разойдётся с оригиналом, а они у нас неприкосновенны.
    publicDir: resolve('public'),
  };
});

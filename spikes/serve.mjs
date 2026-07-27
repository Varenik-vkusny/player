// Статический сервер для спайков. Без зависимостей — это одноразовая оснастка,
// а не часть продукта.
//
// Зачем вообще сервер: с file:// не грузятся ES-модули, а без поддержки
// Range-запросов браузер не сможет нормально работать с 55-мегабайтным WAV.
// Оба ограничения исказили бы измерения S1-S3.
//
// Запуск: node spikes/serve.mjs [порт]

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// resolve() снимает завершающий разделитель, который добавляет fileURLToPath.
// Без этого проверка startsWith(ROOT + sep) сравнивается с двойным слэшем
// и отвергает вообще всё, включая собственный корень.
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] ?? 5180);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/**
 * Разбирает заголовок Range вида "bytes=0-1023" / "bytes=1024-".
 * Возвращает null, если заголовка нет; бросает, если он есть, но неразбираем —
 * молча отдавать целый файл в ответ на кривой Range нельзя, это как раз тот
 * случай, когда тихий фолбэк превращается в неверное измерение.
 */
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) throw new Error(`Неразбираемый Range: ${header}`);

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') throw new Error(`Пустой Range: ${header}`);

  // "bytes=-500" — последние 500 байт
  const start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart);
  const end = rawStart === '' || rawEnd === '' ? size - 1 : Number(rawEnd);

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end) {
    throw new Error(`Некорректный Range: ${header} при размере ${size}`);
  }
  return { start, end: Math.min(end, size - 1) };
}

function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const absolute = join(ROOT, relative);
  if (absolute !== ROOT && !absolute.startsWith(ROOT + sep)) {
    throw new Error(`Выход за пределы каталога спайков: ${decoded}`);
  }
  return absolute;
}

const server = createServer(async (req, res) => {
  try {
    let path = resolveSafe(req.url ?? '/');
    let info = await stat(path).catch(() => null);

    if (info?.isDirectory()) {
      path = join(path, 'index.html');
      info = await stat(path).catch(() => null);
    }
    if (!info?.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404: ${req.url}`);
      return;
    }

    const type = MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
    // Кэш выключен намеренно: спайк правится и перезагружается десятки раз,
    // и попасть в закэшированную версию во время измерения — худший из багов.
    const base = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };

    const range = parseRange(req.headers.range, info.size);
    if (range) {
      res.writeHead(206, {
        ...base,
        'content-range': `bytes ${range.start}-${range.end}/${info.size}`,
        'content-length': range.end - range.start + 1,
      });
      createReadStream(path, { start: range.start, end: range.end }).pipe(res);
    } else {
      res.writeHead(200, { ...base, 'content-length': info.size });
      createReadStream(path).pipe(res);
    }
  } catch (error) {
    // Громко и в том месте, где возникло. Никаких заглушек.
    console.error(`[serve] ${req.method} ${req.url} ->`, error);
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(error));
  }
});

server.listen(PORT, () => {
  console.log(`Спайки: http://localhost:${PORT}/`);
  console.log(`Корень: ${ROOT}`);
});

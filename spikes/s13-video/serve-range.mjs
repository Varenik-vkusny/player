/**
 * Спайк S13: статика С ПОДДЕРЖКОЙ ЗАПРОСОВ ПО ДИАПАЗОНУ.
 *
 * Вынесено в общий модуль после того, как самодельная отдача «файл целиком»
 * провалила замер молча. Без заголовка `Accept-Ranges: bytes` и обработки
 * `Range:` браузер умеет ТОЛЬКО играть подряд: `video.currentTime = 5`
 * не выполняется, чтение возвращает 0, ошибки нет ни одной. Первый прогон
 * дал из-за этого вывод «браузер не умеет вести видео перемоткой» —
 * правдоподобный, архитектурный и целиком ложный.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const MIME = {
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.html': 'text/html; charset=utf-8',
};

/**
 * Поднимает сервер и возвращает его. Занятый порт роняет с ошибкой,
 * а не уезжает на соседний: молчаливый переезд уже стоил стенду полчаса
 * прогонов по чужому сайту (CLAUDE.md, порт 5179).
 */
export async function serveWithRanges(root, port) {
  const server = createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/') {
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end('<!doctype html><meta charset="utf-8"><title>s13</title><body></body>');
      return;
    }
    if (path === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    const file = join(root, path);
    let size;
    try {
      size = (await stat(file)).size;
    } catch {
      res.writeHead(404);
      res.end('нет такого файла');
      return;
    }

    const type = MIME[extname(path)] ?? 'application/octet-stream';
    const body = await readFile(file);
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
      res.end(body);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return;
    }
    const start = match[1] === '' ? size - Number(match[2]) : Number(match[1]);
    const end = match[2] === '' || match[1] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    if (start < 0 || start > end) {
      res.writeHead(416, { 'content-range': `bytes */${size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      'content-type': type,
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${size}`,
      'accept-ranges': 'bytes',
    });
    res.end(body.subarray(start, end + 1));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });
  return server;
}

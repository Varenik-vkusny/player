/**
 * Спайк S13, замер 1: умеет ли `decodeAudioData` вынуть звук из `.mp4`.
 *
 * Спецификация Web Audio оставляет список форматов на усмотрение реализации,
 * поэтому ответ добывается прогоном в живом Chromium, а не чтением документа.
 *
 * От ответа зависит архитектура: если умеет — автор кладёт ОДИН файл, его
 * звук становится дорожкой сегмента (ADR-002), а `<video muted>` идёт ведомым
 * и губы не могут разъехаться по построению. Если не умеет — звук придётся
 * отделять от видео заранее, и это другая работа.
 *
 * Свой порт 5181: 5179 — стенд e2e, 5180 — сервер спайков. Занятый порт
 * обязан падать громко.
 *
 * Запуск: node spike-video-decode.mjs
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = join(dirname(fileURLToPath(import.meta.url)), '..'); // корень репозитория: адреса в замерах вида /spikes/...
const PORT = 5181;

const MIME = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.html': 'text/html' };

const server = createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><meta charset="utf-8"><title>s13</title><body></body>');
    return;
  }
  try {
    const ext = path.slice(path.lastIndexOf('.'));
    const body = await readFile(join(here, path));
    res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
    res.end(body);
  } catch (error) {
    res.writeHead(404);
    res.end(String(error));
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject); // занятый порт падает громко, а не уезжает молча
  server.listen(PORT, resolve);
});

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`http://localhost:${PORT}/`);

const result = await page.evaluate(async () => {
  const out = {};

  // ——— 1. Декодирование звука ИЗ mp4 ———
  const bytes = await (await fetch('/spikes/s13-video/flash-3s.mp4')).arrayBuffer();
  out.fileBytes = bytes.byteLength;
  const ctx = new AudioContext();
  try {
    const t0 = performance.now();
    const buffer = await ctx.decodeAudioData(bytes.slice(0));
    out.decode = {
      ok: true,
      ms: +(performance.now() - t0).toFixed(2),
      duration: +buffer.duration.toFixed(6),
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
    };
    // Щелчки стоят в начале каждой секунды. Ищем их в декодированном сигнале:
    // если звук вынут ВЕРНО и без сдвига, пики окажутся у 0, 1 и 2 секунд.
    //
    // Считаем ОГИБАЮЩУЮ по окнам, а не мгновенное значение: щелчок — это
    // синус 3000 Гц, и он пересекает любой порог дважды за период. Детектор
    // по мгновенному значению насчитал бы щелчок каждые 0.2 мс — число
    // правдоподобное и целиком порождённое измерителем.
    const data = buffer.getChannelData(0);
    const win = Math.round(buffer.sampleRate * 0.002); // окно 2 мс
    const env = [];
    for (let i = 0; i < data.length; i += win) {
      let peak = 0;
      for (let j = i; j < Math.min(i + win, data.length); j++) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
      env.push(peak);
    }
    const clicks = [];
    let quiet = true;
    for (let w = 0; w < env.length; w++) {
      if (env[w] > 0.3 && quiet) {
        clicks.push(+((w * win) / buffer.sampleRate).toFixed(4));
        quiet = false;
      } else if (env[w] < 0.05) {
        quiet = true;
      }
    }
    out.decode.clickTimes = clicks.slice(0, 8);
    out.decode.envelopeWindowMs = 2;
  } catch (error) {
    out.decode = { ok: false, error: `${error.name}: ${error.message}` };
  }

  // ——— 2. Что говорит о себе <video> с тем же файлом ———
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = '/spikes/s13-video/flash-3s.mp4';
  document.body.appendChild(video);
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error(`video error code ${video.error?.code}`));
    setTimeout(() => reject(new Error('timeout loadedmetadata')), 5000);
  });
  out.video = {
    duration: +video.duration.toFixed(6),
    hasFrameCallback: typeof video.requestVideoFrameCallback === 'function',
  };

  // ——— 3. Сколько стоит одна установка currentTime и как быстро приходит кадр ———
  await new Promise((resolve) => {
    video.onseeked = resolve;
    video.currentTime = 1.5;
  });
  const seeks = [];
  for (let k = 0; k < 30; k++) {
    const target = 0.2 + k * 0.05;
    const t0 = performance.now();
    video.currentTime = target;
    const setCost = performance.now() - t0;
    const settled = await new Promise((resolve) => {
      const started = performance.now();
      video.onseeked = () => resolve(performance.now() - started);
      setTimeout(() => resolve(-1), 2000);
    });
    seeks.push({ setCost: +setCost.toFixed(3), seekedAfter: +settled.toFixed(2) });
  }
  const setCosts = seeks.map((s) => s.setCost).sort((a, b) => a - b);
  const settleTimes = seeks.map((s) => s.seekedAfter).sort((a, b) => a - b);
  out.seek = {
    n: seeks.length,
    setCostMedian: setCosts[Math.floor(setCosts.length / 2)],
    setCostMax: setCosts[setCosts.length - 1],
    seekedMedian: settleTimes[Math.floor(settleTimes.length / 2)],
    seekedMax: settleTimes[settleTimes.length - 1],
  };

  // ——— 4. Сдвиг звука относительно картинки внутри ОДНОГО файла ———
  //
  // В файле вспышка кадра и щелчок в звуке поставлены на одну и ту же метку
  // времени. Здесь они добываются РАЗНЫМИ путями: щелчки — из декодированного
  // буфера (`decodeAudioData`), вспышки — из показанных кадров
  // (`requestVideoFrameCallback` + canvas). Если пути расходятся, разница
  // и есть постоянный сдвиг, который иначе выглядел бы как «почти совпало».
  //
  // Кандидат на причину сдвига — priming delay кодека AAC: энкодер дописывает
  // в начало ~1024 сэмпла (≈21 мс на 48 кГц), и вопрос в том, отдаёт ли их
  // декодер Web Audio, отбрасывая которые медиаэлемент.
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 24;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const frames = [];
  await new Promise((resolve, reject) => {
    const onFrame = (_now, meta) => {
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += px[i];
      frames.push({ mediaTime: +meta.mediaTime.toFixed(4), lum: +(sum / (px.length / 4)).toFixed(1) });
      if (!video.ended) video.requestVideoFrameCallback(onFrame);
    };
    video.onended = resolve;
    video.onerror = () => reject(new Error('video error during playback'));
    setTimeout(() => resolve(), 12000);
    video.currentTime = 0;
    video.requestVideoFrameCallback(onFrame);
    void video.play();
  });

  const flashes = [];
  let dark = true;
  for (const f of frames) {
    if (f.lum > 128 && dark) {
      flashes.push(f.mediaTime);
      dark = false;
    } else if (f.lum < 64) {
      dark = true;
    }
  }
  out.flash = {
    framesSeen: frames.length,
    flashTimes: flashes.slice(0, 8),
    maxLum: Math.max(...frames.map((f) => f.lum)),
    minLum: Math.min(...frames.map((f) => f.lum)),
  };

  if (out.decode.ok && out.decode.clickTimes.length && flashes.length) {
    const pairs = Math.min(out.decode.clickTimes.length, flashes.length);
    const offsets = [];
    for (let i = 0; i < pairs; i++) {
      offsets.push(+((out.decode.clickTimes[i] - flashes[i]) * 1000).toFixed(2));
    }
    out.offsetMs = { perClick: offsets, note: 'звук минус картинка, миллисекунды' };
  }

  await ctx.close();
  return out;
});

console.log(JSON.stringify(result, null, 2));
console.log('CONSOLE:', consoleErrors.length === 0 ? 'чисто' : consoleErrors);

await browser.close();
server.close();

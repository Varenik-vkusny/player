/**
 * Спайк S13, диагностика: почему замер 2 дал противоречивые числа.
 *
 * Проверяются ТРИ подозрения разом, и каждое опознаётся своим признаком:
 *
 *  1. headless без звукового устройства ломает контекстные часы
 *     → признак: ctx.currentTime растёт не как настоящее время,
 *       либо getOutputTimestamp().contextTime стоит / скачет.
 *       Поэтому здесь сравниваются ТРИ независимых часов: performance.now(),
 *       ctx.currentTime и getOutputTimestamp().contextTime.
 *
 *  2. video.currentTime во время незавершённого seek возвращает старое
 *     → признак: записали X, тут же прочитали — вернулось не X.
 *
 *  3. частая запись currentTime вешает показ кадров
 *     → признак: shown растёт много медленнее, чем идёт время.
 *
 * Печатается СЫРЬЁ построчно, а не квантили: агрегат по сломанному ряду
 * выглядит достоверно и скрывает, в какой момент всё разъехалось.
 *
 * Порт 5183. Окно настоящее (headed), звук настоящий.
 *
 * Запуск: node spike-video-diag.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serveWithRanges } from './s13-video/serve-range.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..'); // корень репозитория: адреса в замерах вида /spikes/...
const PORT = 5183;
const MEDIA = '/spikes/s13-video/flash-60s-busy.mp4';
const HEADLESS = process.argv.includes('--headless');

const server = await serveWithRanges(here, PORT);

const browser = await chromium.launch({
  headless: HEADLESS,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(`http://localhost:${PORT}/`);

const result = await page.evaluate(async (media) => {
  const bytes = await (await fetch(media)).arrayBuffer();
  const ctx = new AudioContext();
  await ctx.resume();
  const buffer = await ctx.decodeAudioData(bytes.slice(0));

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = media;
  document.body.appendChild(video);
  await new Promise((resolve, reject) => {
    video.oncanplaythrough = resolve;
    video.onerror = () => reject(new Error(`video error ${video.error?.code}`));
    setTimeout(() => reject(new Error('timeout')), 30000);
  });

  const out = { env: {} };
  out.env.state = ctx.state;
  out.env.sampleRate = ctx.sampleRate;
  out.env.baseLatency = ctx.baseLatency;
  out.env.outputLatencyBeforePlay = ctx.outputLatency;

  // ——— Подозрение 2, отдельно и в чистоте: читается ли записанное ———
  video.pause();
  const echo = [];
  for (const target of [5, 10, 15, 20]) {
    video.currentTime = target;
    echo.push({ wrote: target, readBack: +video.currentTime.toFixed(4) });
  }
  out.writeReadEcho = echo;
  await new Promise((r) => setTimeout(r, 300));
  out.afterSettle = +video.currentTime.toFixed(4);

  /** Прогон на 10 секунд с построчным сырьём. */
  async function trace(mode) {
    video.pause();
    video.currentTime = 0;
    await new Promise((r) => {
      video.onseeked = r;
      setTimeout(r, 1000);
    });

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // почти тихо, но узел РАБОТАЕТ по-настоящему
    source.connect(gain).connect(ctx.destination);

    const wallStart = performance.now();
    const ctxStart = ctx.currentTime;
    source.start();
    if (mode !== 'driven') void video.play();

    let shown = 0;
    const onShown = () => {
      shown++;
      video.requestVideoFrameCallback(onShown);
    };
    video.requestVideoFrameCallback(onShown);

    const rows = [];
    let nextLog = 0;
    await new Promise((done) => {
      const tick = () => {
        const wall = (performance.now() - wallStart) / 1000;
        if (wall >= 10) {
          done();
          return;
        }
        const stamp = ctx.getOutputTimestamp();
        const position = ctx.currentTime - ctxStart;
        if (mode === 'driven') video.currentTime = position;

        if (wall >= nextLog) {
          nextLog += 1;
          rows.push({
            wall: +wall.toFixed(3),
            ctxElapsed: +position.toFixed(3),
            stampCtx: +(stamp?.contextTime ?? -1).toFixed(3),
            stampMedia: +(stamp?.performanceTime ?? -1).toFixed(1),
            outLat: +ctx.outputLatency.toFixed(4),
            videoTime: +video.currentTime.toFixed(3),
            shown,
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    try {
      source.stop();
    } catch {
      /* кончился */
    }
    video.pause();
    return { mode, rows, shownTotal: shown };
  }

  out.free = await trace('free');
  out.driven = await trace('driven');
  await ctx.close();
  return out;
}, MEDIA);

console.log(JSON.stringify(result, null, 2));
console.log('CONSOLE:', problems.length === 0 ? 'чисто' : problems);

await browser.close();
server.close();

// Оснастка обязана падать громко: если перемотка не выполняется, любые числа
// про «ведомое видео» — про сломанный сервер, а не про браузер.
const echoBroken = result.writeReadEcho.filter((e) => Math.abs(e.readBack - e.wrote) > 0.5);
if (echoBroken.length > 0) {
  console.error('ОСНАСТКА СЛОМАНА: перемотка не выполняется', echoBroken);
  process.exit(2);
}

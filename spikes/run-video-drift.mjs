/**
 * Спайк S13, замер 2: расходятся ли часы видео и часы проекта за минуту,
 * и что стоит держать видео ведомым.
 *
 * Часы проекта — `AudioContext` (ADR-002), а не `<audio>`. У `<video>` часы
 * СВОИ. Инвариант №1 запрещает второй источник времени, поэтому решается,
 * каким способом видео подчиняется звуку — и способ выбирается замером.
 *
 * Три режима, каждый по 60 секунд на одном и том же файле:
 *
 *   A. свободное  — video.play(), никто не поправляет. Даёт ВЕЛИЧИНУ дрейфа:
 *                   если её нет, коррекция не нужна вовсе.
 *   B. ведомое    — каждый кадр video.currentTime = позиция аудио. Даёт цену
 *                   и, главное, ответ «а картинка-то идёт или дёргается».
 *   C. с доводкой — video.play() плюс правка playbackRate, когда расхождение
 *                   перевалило порог. Середина между A и B.
 *
 * Позиция аудио считается по формуле ADR-002 (якорь + контекстные часы,
 * с вычетом outputLatency, который читается КАЖДЫЙ раз, а не однажды).
 *
 * Порт 5182: 5179 — стенд e2e, 5180 — сервер спайков, 5181 — замер 1.
 *
 * Запуск: node spike-video-drift.mjs   (≈3.5 минуты, машина должна быть свободна)
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serveWithRanges } from './s13-video/serve-range.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..'); // корень репозитория: адреса в замерах вида /spikes/...
const PORT = 5182;
const MEDIA = '/spikes/s13-video/flash-60s-busy.mp4';

// Сервер обязан уметь запросы по диапазону: без них перемотка молча
// не выполняется, и весь режим «ведомое» меряет сломанную оснастку.
const server = await serveWithRanges(here, PORT);

const browser = await chromium.launch({
  headless: false,
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
  const SECONDS = 60;

  const bytes = await (await fetch(media)).arrayBuffer();
  const ctx = new AudioContext();
  await ctx.resume();
  const buffer = await ctx.decodeAudioData(bytes.slice(0));

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = media;
  video.style.width = '320px';
  document.body.appendChild(video);
  await new Promise((resolve, reject) => {
    video.oncanplaythrough = resolve;
    video.onerror = () => reject(new Error(`video error ${video.error?.code}`));
    setTimeout(() => reject(new Error('timeout canplaythrough')), 30000);
  });

  // Оснастка проверяется ДО замеров и на другом, чем предмет: предмет —
  // синхронность, проверка — «перемотка вообще выполняется». Сломанный
  // сервер уже один раз выдал за результат собственный отказ.
  video.currentTime = 12;
  const seekWorks = Math.abs(video.currentTime - 12) < 0.5;
  if (!seekWorks) throw new Error('оснастка: перемотка не выполняется, замер бессмыслен');

  const quantiles = (xs) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (q) => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(3);
    return { min: +s[0].toFixed(3), p50: at(0.5), p95: at(0.95), max: +s[s.length - 1].toFixed(3) };
  };

  /** Один прогон длиной SECONDS. `mode` решает, кто правит видео. */
  async function run(mode) {
    video.pause();
    video.currentTime = 0;
    video.playbackRate = 1;
    await new Promise((r) => {
      video.onseeked = r;
      setTimeout(r, 1000);
    });

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const silent = ctx.createGain();
    silent.gain.value = 0; // звук в замере не нужен, нужны его ЧАСЫ
    source.connect(silent).connect(ctx.destination);

    // Якорь по ADR-002: с этого мгновения позиция считается от контекстных часов.
    const startAt = ctx.currentTime + 0.15;
    source.start(startAt);
    if (mode !== 'driven') void video.play();

    const audioPosition = () => {
      // outputLatency читается каждый раз: до начала воспроизведения он ноль,
      // и однажды прочитанное значение считало бы позицию неверно всю дорогу.
      const latency = ctx.outputLatency || 0;
      const stamp = ctx.getOutputTimestamp();
      const audible =
        stamp && stamp.contextTime > 0 ? stamp.contextTime : ctx.currentTime - (ctx.baseLatency + latency);
      return audible - startAt;
    };

    const samples = [];
    const frameCosts = [];
    const shownFrames = [];
    let corrections = 0;

    // Показанные кадры собираются НЕЗАВИСИМО от цикла правки: rVFC знает
    // mediaTime кадра, который композитор действительно отрисовал, а
    // video.currentTime — лишь то, что видео думает о себе.
    const onShown = (_now, meta) => {
      shownFrames.push(+meta.mediaTime.toFixed(4));
      video.requestVideoFrameCallback(onShown);
    };
    video.requestVideoFrameCallback(onShown);

    await new Promise((done) => {
      const tick = () => {
        const position = audioPosition();
        if (position >= SECONDS - 0.2) {
          done();
          return;
        }
        const t0 = performance.now();

        if (position > 0) {
          if (mode === 'driven') {
            video.currentTime = position;
          } else if (mode === 'corrected') {
            const off = video.currentTime - position;
            if (Math.abs(off) > 0.15) {
              video.currentTime = position; // разошлись грубо — перемотать
              corrections++;
            } else if (Math.abs(off) > 0.04) {
              video.playbackRate = off > 0 ? 0.97 : 1.03; // доводчик, без рывка
              corrections++;
            } else if (video.playbackRate !== 1) {
              video.playbackRate = 1;
            }
          }
        }

        frameCosts.push(performance.now() - t0);
        if (position > 0.5) samples.push({ position, drift: video.currentTime - position });
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    try {
      source.stop();
    } catch {
      /* уже кончился */
    }
    video.pause();

    // Ровно ли шла картинка: разрывы между соседними показанными кадрами.
    const gaps = [];
    for (let i = 1; i < shownFrames.length; i++) gaps.push(shownFrames[i] - shownFrames[i - 1]);
    const backwards = gaps.filter((g) => g < 0).length;

    const drifts = samples.map((s) => s.drift);
    const last = samples.length ? samples[samples.length - 1] : null;

    return {
      mode,
      ticks: samples.length,
      driftMs: quantiles(drifts.map((d) => d * 1000)),
      driftAtEndMs: last ? +(last.drift * 1000).toFixed(1) : null,
      frameCostMs: quantiles(frameCosts),
      shown: {
        frames: shownFrames.length,
        expected: SECONDS * 30,
        gapMs: quantiles(gaps.map((g) => g * 1000)),
        backwards,
      },
      corrections,
    };
  }

  const out = { file: media, decoded: { duration: +buffer.duration.toFixed(4), sampleRate: buffer.sampleRate } };
  out.free = await run('free');
  out.driven = await run('driven');
  out.corrected = await run('corrected');
  await ctx.close();
  return out;
}, MEDIA);

console.log(JSON.stringify(result, null, 2));
console.log('CONSOLE:', problems.length === 0 ? 'чисто' : problems);

await browser.close();
server.close();

/**
 * Спайк S13, замер 4 (итоговый): чем видео должно быть — свободным или ведомым.
 *
 * Замер 2 был испорчен собственной оснасткой: перед прогоном перемотка
 * проверялась установкой `currentTime = 12`, и прогон начинался не с нуля.
 * Расхождение «до 10.8 с» было этим, а не поведением браузера.
 *
 * Отсюда правило, купленное в С36 (§12 журнала): промежуточная проверка
 * обязана смотреть НА ДРУГОЕ, чем предмет. Предмет здесь — синхронность
 * картинки со звуком; промежуточная проверка — «видео стоит на нуле перед
 * старт��м» и «перемотка вообще выполняется». Обе падают громко.
 *
 * Часы проекта здоровы: замер 3 дал дрейф 0 мс/мин и постоянное отставание
 * getOutputTimestamp на 53 мс. Значит любое расхождение, найденное здесь,
 * принадлежит видео, а не часам.
 *
 * Позиция считается ТОЙ ЖЕ формулой, что в плеере (clock.ts:230, 237):
 * якорь + (звучащее контекстное время − контекстное время якоря).
 *
 * Запуск: node spike-video-sync.mjs   (≈2.5 минуты, машина свободна)
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serveWithRanges } from './s13-video/serve-range.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..'); // корень репозитория: адреса в замерах вида /spikes/...
const PORT = 5185;
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
  const SECONDS = 60;
  const LEAD = 0.02; // как DEFAULT_LEAD_S в clock.ts

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
    setTimeout(() => reject(new Error('timeout canplaythrough')), 30000);
  });

  const quant = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const at = (q) => +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(2);
    return { min: +s[0].toFixed(2), p50: at(0.5), p95: at(0.95), max: +s[s.length - 1].toFixed(2) };
  };

  async function run(mode) {
    // ——— приведение к нулю, и это ПРОВЕРЯЕТСЯ, а не предполагается ———
    video.pause();
    video.playbackRate = 1;
    if (video.currentTime !== 0) {
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.onerror = () => reject(new Error('seek to 0 failed'));
        video.currentTime = 0;
        setTimeout(() => reject(new Error('таймаут возврата на ноль')), 5000);
      });
    }
    if (video.currentTime > 0.001) {
      throw new Error(`оснастка: перед прогоном видео на ${video.currentTime}, а не на нуле`);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.02;
    source.connect(gain).connect(ctx.destination);

    const anchorCtxTime = ctx.currentTime + LEAD;
    source.start(anchorCtxTime);
    // Видео пускается ровно тогда, когда звук зазвучит, а не раньше:
    // 20 мс запаса на планирование иначе легли бы в постоянный сдвиг.
    const startVideoAt = anchorCtxTime;

    const audible = () => ctx.getOutputTimestamp().contextTime ?? 0;
    const position = () => Math.min(Math.max(audible() - anchorCtxTime, 0), buffer.duration);

    let started = false;
    const shown = [];
    const onShown = (_now, meta) => {
      shown.push(+meta.mediaTime.toFixed(4));
      video.requestVideoFrameCallback(onShown);
    };
    video.requestVideoFrameCallback(onShown);

    const rows = [];
    const offsets = [];
    const costs = [];
    let nextLog = 0;
    let seeks = 0;

    await new Promise((done) => {
      const tick = () => {
        if (!started && ctx.currentTime >= startVideoAt) {
          started = true;
          if (mode !== 'driven') void video.play();
        }
        const pos = position();
        if (pos >= SECONDS - 0.3) {
          done();
          return;
        }
        const t0 = performance.now();
        if (started && mode === 'driven') {
          video.currentTime = pos;
          seeks++;
        } else if (started && mode === 'nudged') {
          // Доводка ТОЛЬКО перемоткой и ТОЛЬКО при грубом расхождении:
          // playbackRate-доводка в замере 2 дала 121 кадр назад, то есть
          // видимые рывки. Порог 0.25 с — заметно уху и глазу, но много
          // больше кадра, чтобы не перематывать без нужды.
          if (Math.abs(video.currentTime - pos) > 0.25) {
            video.currentTime = pos;
            seeks++;
          }
        }
        costs.push(performance.now() - t0);

        if (started && pos > 1) offsets.push((video.currentTime - pos) * 1000);
        if (started && pos >= nextLog) {
          nextLog += 10;
          rows.push({
            pos: +pos.toFixed(3),
            videoTime: +video.currentTime.toFixed(3),
            offsetMs: +((video.currentTime - pos) * 1000).toFixed(1),
            shown: shown.length,
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

    const gaps = [];
    for (let i = 1; i < shown.length; i++) gaps.push((shown[i] - shown[i - 1]) * 1000);
    return {
      mode,
      rows,
      offsetMs: quant(offsets),
      frameCostMs: quant(costs),
      seeks,
      shown: {
        frames: shown.length,
        expected: SECONDS * 30,
        fps: +(shown.length / SECONDS).toFixed(1),
        gapMs: quant(gaps),
        backwards: gaps.filter((g) => g < -1).length,
        stalls: gaps.filter((g) => g > 100).length,
      },
    };
  }

  /**
   * Остановка на гейте. Инвариант №4: гейт останавливает всё сразу,
   * возобновление — с той же позиции, перемотки не происходит никогда.
   *
   * Для звука это уже измерено (S3: 0 разрывов, 0 мс скачка). Для видео нет.
   * Меряется то, что зритель заметит: попала ли картинка обратно в звук
   * после возобновления и не поехала ли она назад.
   *
   * Пауза делается через ctx.suspend(), как в плеере: контекстные часы
   * замирают вместе со звуком, и якорь переживает остановку без пересчёта.
   */
  async function runGated() {
    video.pause();
    video.playbackRate = 1;
    if (video.currentTime !== 0) {
      await new Promise((resolve, reject) => {
        video.onseeked = resolve;
        video.currentTime = 0;
        setTimeout(() => reject(new Error('таймаут возврата на ноль')), 5000);
      });
    }
    if (video.currentTime > 0.001) throw new Error('оснастка: видео не на нуле');

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.02;
    source.connect(gain).connect(ctx.destination);

    const anchorCtxTime = ctx.currentTime + LEAD;
    source.start(anchorCtxTime);
    const position = () => Math.min(Math.max((ctx.getOutputTimestamp().contextTime ?? 0) - anchorCtxTime, 0), buffer.duration);

    const shown = [];
    const onShown = (_now, meta) => {
      shown.push(+meta.mediaTime.toFixed(4));
      video.requestVideoFrameCallback(onShown);
    };
    video.requestVideoFrameCallback(onShown);

    await new Promise((r) => setTimeout(r, 60));
    void video.play();

    const gates = [];
    // Три остановки: на 3-й, 6-й и 9-й секунде, каждая по 1.2 с.
    for (const at of [3, 6, 9]) {
      await new Promise((done) => {
        const wait = () => (position() >= at ? done() : requestAnimationFrame(wait));
        wait();
      });

      const beforeOffset = (video.currentTime - position()) * 1000;
      const framesBefore = shown.length;

      // ——— гейт закрылся ———
      video.pause();
      await ctx.suspend();
      const heldPos = position();
      const heldVideo = video.currentTime;
      await new Promise((r) => setTimeout(r, 1200));
      // Замерло ли всё: за 1.2 с стояния ни звук, ни картинка не должны уйти.
      const posDriftWhileHeld = (position() - heldPos) * 1000;
      const videoDriftWhileHeld = (video.currentTime - heldVideo) * 1000;
      const framesWhileHeld = shown.length - framesBefore;

      // ——— гейт открылся ———
      await ctx.resume();
      void video.play();
      await new Promise((r) => setTimeout(r, 400));
      const afterOffset = (video.currentTime - position()) * 1000;

      gates.push({
        atSeconds: at,
        offsetBeforeMs: +beforeOffset.toFixed(1),
        offsetAfterMs: +afterOffset.toFixed(1),
        posDriftWhileHeldMs: +posDriftWhileHeld.toFixed(1),
        videoDriftWhileHeldMs: +videoDriftWhileHeld.toFixed(1),
        framesShownWhileHeld: framesWhileHeld,
      });
    }

    video.pause();
    try {
      source.stop();
    } catch {
      /* кончился */
    }
    const gaps = [];
    for (let i = 1; i < shown.length; i++) gaps.push((shown[i] - shown[i - 1]) * 1000);
    return { gates, backwards: gaps.filter((g) => g < -1).length, totalFrames: shown.length };
  }

  const out = {};
  out.free = await run('free');
  out.nudged = await run('nudged');
  out.driven = await run('driven');
  out.gated = await runGated();
  await ctx.close();
  return out;
}, MEDIA);

console.log(JSON.stringify(result, null, 2));
console.log('CONSOLE:', problems.length === 0 ? 'чисто' : problems);

await browser.close();
server.close();

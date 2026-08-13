/**
 * Спайк S13, замер 3: врут ли часы, на которых стоит позиция плеера.
 *
 * Видео тут НЕ участвует. Проверяется подозрение, поднятое замером 2:
 * расхождение между ровно идущим видео и позицией росло по ходу минуты,
 * а `position` в плеере (`clock.ts:238`) считается через
 * `getOutputTimestamp().contextTime`.
 *
 * Сравниваются четыре величины на одной оси:
 *
 *   performance.now()             — настоящее время, эталон
 *   ctx.currentTime              — время, до которого контекст отрендерил
 *   getOutputTimestamp().contextTime — время сэмпла, который СЛЫШЕН сейчас
 *   ctx.outputLatency            — заявленная задержка вывода
 *
 * Проверка вменяемости в плеере ОДНОКРАТНА (при создании часов). Если
 * contextTime расходится не сразу, а по ходу, она этого не увидит —
 * поэтому здесь смотрится весь ряд, а не одна точка.
 *
 * Звук идёт по-настоящему (буфер играет), иначе меряются простаивающие часы.
 *
 * Запуск: node spike-clocks-check.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { serveWithRanges } from './s13-video/serve-range.mjs';

const here = join(dirname(fileURLToPath(import.meta.url)), '..'); // корень репозитория: адреса в замерах вида /spikes/...
const PORT = 5184;
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

const result = await page.evaluate(async () => {
  const SECONDS = 60;
  const ctx = new AudioContext();
  await ctx.resume();

  // Минута настоящего звука: часы, по которым ничего не играет, меряют не то.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * SECONDS, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * 220 * i) / ctx.sampleRate) * 0.02;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.02;
  source.connect(gain).connect(ctx.destination);

  const wallStart = performance.now();
  const ctxStart = ctx.currentTime;
  source.start();

  const rows = [];
  let nextLog = 0;
  await new Promise((done) => {
    const tick = () => {
      const wall = (performance.now() - wallStart) / 1000;
      if (wall >= SECONDS) {
        done();
        return;
      }
      if (wall >= nextLog) {
        nextLog += 5;
        const stamp = ctx.getOutputTimestamp();
        rows.push({
          wall: +wall.toFixed(3),
          ctxElapsed: +(ctx.currentTime - ctxStart).toFixed(3),
          stampElapsed: +((stamp?.contextTime ?? 0) - ctxStart).toFixed(3),
          outLatMs: +(ctx.outputLatency * 1000).toFixed(1),
          baseLatMs: +(ctx.baseLatency * 1000).toFixed(1),
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

  // Наклон расхождения: сколько миллисекунд набегает за минуту.
  const first = rows[1] ?? rows[0];
  const last = rows[rows.length - 1];
  const slope = (name) => {
    const dSpan = last[name] - last.wall - (first[name] - first.wall);
    return +(dSpan * 1000).toFixed(2);
  };

  const out = {
    rows,
    driftPerMinuteMs: {
      ctxCurrentTime: slope('ctxElapsed'),
      outputTimestamp: slope('stampElapsed'),
    },
    lagBehindWallMs: {
      ctxCurrentTime: +((last.ctxElapsed - last.wall) * 1000).toFixed(1),
      outputTimestamp: +((last.stampElapsed - last.wall) * 1000).toFixed(1),
    },
  };
  await ctx.close();
  return out;
});

console.log(JSON.stringify(result, null, 2));
console.log('CONSOLE:', problems.length === 0 ? 'чисто' : problems);

await browser.close();
server.close();

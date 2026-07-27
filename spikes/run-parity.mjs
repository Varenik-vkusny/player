// S7: паритет рендера плеера и редактора.
//
// Критерий: различие меньше 0.1% пикселей. Больше — значит у нас два рендера,
// и это чинится архитектурно, а не подкруткой порога.
//
// Запуск: node spikes/run-parity.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const VIEWPORT = { width: 1280, height: 720 };
const THRESHOLD_PERCENT = 0.1;

const browser = await chromium.launch({ headless: true });

async function shoot(path) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:5180/s7-parity/${path}`, { waitUntil: 'load' });
  // Ждём метку готовности, а не таймаут: снимок до построения сцены
  // сравнивал бы пустые экраны и радовал бы нас нулём различий.
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 20000 });
  const buffer = await page.screenshot({ type: 'png' });
  const dom = await page.evaluate(() => {
    const stage = document.querySelector('[data-id]')?.parentElement;
    return {
      элементов: stage ? stage.children.length : 0,
      transform: stage ? getComputedStyle(stage).transform : null,
    };
  });
  await page.close();
  if (errors.length) throw new Error(`${path}: ошибки на странице — ${errors.join('; ')}`);
  return { buffer, dom };
}

const player = await shoot('player.html');
const editor = await shoot('editor.html');

const a = PNG.sync.read(player.buffer);
const b = PNG.sync.read(editor.buffer);
if (a.width !== b.width || a.height !== b.height) {
  throw new Error(`Разные размеры снимков: ${a.width}x${a.height} против ${b.width}x${b.height}`);
}

const diff = new PNG({ width: a.width, height: a.height });
const different = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
const total = a.width * a.height;
const percent = (different / total) * 100;

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s7-player.png', import.meta.url), player.buffer);
await writeFile(new URL('./results/s7-editor.png', import.meta.url), editor.buffer);
await writeFile(new URL('./results/s7-diff.png', import.meta.url), PNG.sync.write(diff));

const report = {
  снимок: `${a.width}x${a.height}`,
  всегоПикселей: total,
  различаетсяПикселей: different,
  различаетсяПроцентов: +percent.toFixed(6),
  порогПроцентов: THRESHOLD_PERCENT,
  DOMПлеера: player.dom,
  DOMРедактора: editor.dom,
  вердикт: percent < THRESHOLD_PERCENT ? 'ПРОШЁЛ' : 'ПРОВАЛ',
};
console.log(JSON.stringify(report, null, 2));
await writeFile(new URL('./results/s7.json', import.meta.url), JSON.stringify(report, null, 2));

await browser.close();
if (report.вердикт === 'ПРОВАЛ') process.exit(1);

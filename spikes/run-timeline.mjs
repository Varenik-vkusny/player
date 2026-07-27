// Запуск S1 / S2 / S3 в изолированном видимом браузере.
//   node spikes/run-timeline.mjs s1 [секунд]
//   node spikes/run-timeline.mjs s2
//   node spikes/run-timeline.mjs s3

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const which = process.argv[2] ?? 's1';
const seconds = Number(process.argv[3] ?? 600);
if (!['s1', 's2', 's3'].includes(which)) throw new Error(`Неизвестный спайк: ${which}`);

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[страница] ${m.text()}`));
page.on('pageerror', (e) => { console.error('ОШИБКА СТРАНИЦЫ:', e.message); });

await page.goto('http://localhost:5180/s1-timeline/', { waitUntil: 'load' });
if (await page.evaluate(() => document.visibilityState) !== 'visible') {
  throw new Error('Вкладка скрыта — измерение недостоверно');
}

if (which === 's1') await page.fill('#dur', String(seconds));
await page.click(`#${which}`);
console.log(`идёт ${which}...`);

const budget = which === 's1' ? (seconds + 240) * 1000 : 600_000;
await page.waitForFunction((k) => window[`__${k}`], which, { timeout: budget });

const result = await page.evaluate((k) => window[`__${k}`], which);
console.log(JSON.stringify(result, null, 2));

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL(`./results/${which}.json`, import.meta.url), JSON.stringify(result, null, 2));

await browser.close();

// Запуск спайка S0b в изолированном браузере Playwright.
//
// Почему не через расширение Chrome: расширение работает в общем браузере, где
// вкладка может оказаться фоновой. В скрытой вкладке requestAnimationFrame
// заморожен, а загрузка медиаэлемента отложена — измерять там нечего.
//
// Запуск (сервер спайков должен быть поднят):
//   node spikes/run-clocks.mjs [секунд] [файл]
//   node spikes/run-clocks.mjs 600 drift-10min.wav

import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const seconds = Number(process.argv[2] ?? 20);
const file = process.argv[3] ?? 'drift-10min.wav';
const url = 'http://localhost:5180/s0-clocks/';

if (!Number.isFinite(seconds) || seconds <= 0) {
  throw new Error(`Некорректная длительность: ${process.argv[2]}`);
}

// headless: false намеренно. Нам нужна настоящая видимая вкладка с работающим
// rAF и реальным аудиовыходом, а не приближение.
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

page.on('console', (m) => console.log(`[страница] ${m.text()}`));
page.on('pageerror', (e) => { throw e; });

await page.goto(url, { waitUntil: 'load' });

const visibility = await page.evaluate(() => document.visibilityState);
if (visibility !== 'visible') {
  throw new Error(`Вкладка ${visibility}, измерение недостоверно`);
}

await page.fill('#duration', String(seconds));
await page.click(file.endsWith('.mp3') ? '#run-mp3' : '#run-wav');

console.log(`идёт прогон ${file} на ${seconds} с...`);
await page.waitForFunction((f) => window.__s0?.[f], file, {
  timeout: (seconds + 180) * 1000,
});

const result = await page.evaluate((f) => window.__s0[f], file);
console.log(JSON.stringify(result, null, 2));

const outPath = new URL(`./results/s0-${file}.json`, import.meta.url);
await writeFile(outPath, JSON.stringify({ file, seconds, ...result }, null, 2));
console.log(`результат записан: ${outPath.pathname}`);

await browser.close();

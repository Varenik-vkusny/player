// S9: запуск всех трёх сценариев стыка узлов в изолированном видимом браузере.
//
// Разрывы и задержка — величины хвостовые (S6: посторонняя нагрузка не
// сдвигает медиану, но разваливает хвост вдвое), поэтому перед прогоном
// стоит закрыть остальные вкладки и задачи.
//
// Запуск (сервер спайков должен быть поднят — pnpm spikes:serve):
//   node spikes/run-seam.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[страница] ${m.text()}`));
page.on('pageerror', (e) => { console.error('ОШИБКА СТРАНИЦЫ:', e.message); throw e; });

await page.goto('http://localhost:5180/s9-seam/', { waitUntil: 'load' });
if (await page.evaluate(() => document.visibilityState) !== 'visible') {
  throw new Error('Вкладка скрыта — измерение недостоверно');
}

async function run(id) {
  console.log(`\nидёт сценарий ${id}...`);
  await page.click(`#${id}`);
  await page.waitForFunction((k) => window[`__s9${k}`], id, { timeout: 120_000 });
  const result = await page.evaluate((k) => window[`__s9${k}`], id);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

const a = await run('a');
const b = await run('b');
const c = await run('c');

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s9.json', import.meta.url), JSON.stringify({ a, b, c }, null, 2));
console.log('\nРезультат записан: spikes/results/s9.json');

await browser.close();

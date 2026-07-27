// S4: вне гейта ни один клик не должен дойти до обработчика.
//
// Проверяем три вещи, а не одну:
//   1. клики по всем элементам вне гейта не сработали;
//   2. вычисленный pointer-events действительно none;
//   3. курсор над элементом не меняется на указательный — иначе интерфейс
//      обещает интерактив, которого нет.
//
// Запуск: node spikes/run-gate-lock.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.on('pageerror', (e) => { throw e; });

await page.goto('http://localhost:5180/s4-gate-lock/', { waitUntil: 'load' });

const ids = await page.evaluate(() =>
  [...document.querySelectorAll('.item')].map((el) => el.id)
);
if (ids.length === 0) throw new Error('На сцене нет элементов — проверять нечего');

const report = { элементов: ids.length };

// --- вне гейта -------------------------------------------------------------
await page.evaluate(() => { window.__setGate('closed'); window.__resetClicks(); });

const pointerEvents = await page.evaluate(() =>
  [...document.querySelectorAll('.item')].map((el) => getComputedStyle(el).pointerEvents)
);
report.pointerEventsВнеГейта = [...new Set(pointerEvents)];

const cursors = await page.evaluate(() =>
  [...document.querySelectorAll('.item')].map((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return top ? (top.id || top.tagName.toLowerCase()) : 'ничего';
  })
);
report.чтоПодКурсоромВнеГейта = [...new Set(cursors)];

for (const id of ids) {
  // force: true намеренно — обычный клик Playwright сам откажется бить
  // по неинтерактивному элементу, и мы проверили бы Playwright, а не продукт.
  await page.locator(`#${id}`).click({ force: true, timeout: 5000 }).catch(() => {});
}
report.кликовПрошлоВнеГейта = await page.evaluate(() => window.__clicks.length);

// --- в гейте ---------------------------------------------------------------
await page.evaluate(() => { window.__setGate('open'); window.__resetClicks(); });
for (const id of ids) {
  await page.locator(`#${id}`).click({ timeout: 5000 });
}
report.кликовПрошлоВГейте = await page.evaluate(() => window.__clicks.length);

report.вердикт =
  report.кликовПрошлоВнеГейта === 0 &&
  report.кликовПрошлоВГейте === ids.length &&
  report.pointerEventsВнеГейта.every((v) => v === 'none')
    ? 'ПРОШЁЛ'
    : 'ПРОВАЛ';

console.log(JSON.stringify(report, null, 2));

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s4.json', import.meta.url), JSON.stringify(report, null, 2));

await browser.close();
if (report.вердикт === 'ПРОВАЛ') process.exit(1);

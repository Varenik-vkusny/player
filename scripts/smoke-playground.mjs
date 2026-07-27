// Быстрая проверка стенда: открывается ли, грузится ли фикстура,
// строится ли сцена. Одноразовая — постоянные проверки живут в e2e-тестах.

import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
const missing = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
// Сам по себе 404 в консоли не говорит, ЧТО не нашлось. Записываем адрес.
page.on('response', (r) => { if (r.status() === 404) missing.push(r.url()); });

await page.goto('http://localhost:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 20000 });

const report = await page.evaluate(() => {
  const stage = document.querySelector('.player-stage');
  return {
    состояние: document.getElementById('state')?.textContent,
    элементовНаСцене: stage?.children.length ?? 0,
    pointerEventsСцены: stage ? getComputedStyle(stage).pointerEvents : null,
    трансформСцены: stage ? getComputedStyle(stage).transform : null,
    меткиГейтов: document.querySelectorAll('.gate-mark').length,
    кнопкаАктивна: !document.querySelector('#play')?.hasAttribute('disabled'),
  };
});

console.log(JSON.stringify(report, null, 2));
console.log(missing.length ? `НЕ НАЙДЕНО: ${missing.join(', ')}` : 'все ресурсы на месте');
console.log(errors.length ? `ОШИБКИ: ${errors.join(' | ')}` : 'ошибок на странице нет');

await page.screenshot({ path: 'scripts/playground-smoke.png' });
await browser.close();
if (errors.length) process.exit(1);

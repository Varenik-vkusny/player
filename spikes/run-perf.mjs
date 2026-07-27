// S6: 15 анимированных элементов на экране 380px при троттлинге CPU 4x.
//
// Критерий: fps не ниже 55, раскладка идентична десктопной, анимируются
// только transform / opacity / filter.
//
// Запуск: node spikes/run-perf.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 380, height: 780 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => { throw e; });

await page.goto('http://localhost:5180/s6-perf/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 20000 });

// Проверка инварианта №8 до всяких измерений: если анимируется что-то кроме
// transform/opacity/filter, мерить fps уже бессмысленно.
const illegal = await page.evaluate(() => window.__illegalProps);
const animated = await page.evaluate(() => [...window.__animatedProps]);

// Раскладка: число строчных боксов обязано совпадать на всех масштабах.
const layout = {};
for (const scale of [1, 0.5, 0.25, 0.198]) {
  layout[scale] = await page.evaluate((s) => window.__lineBoxes(s), scale);
}
const reference = JSON.stringify(layout[1]);
const layoutIdentical = Object.values(layout).every((v) => JSON.stringify(v) === reference);

// Троттлинг процессора — через CDP, как в DevTools.
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

// Два прогона: с filter: blur() и без него. Инвариант №8 ставит filter
// в один ряд с transform и opacity — это утверждение и проверяется.
const withBlur = await page.evaluate(() => window.__measure(10, true));
const withoutBlur = await page.evaluate(() => window.__measure(10, false));

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

const passes = (p) => p['fps p5 (худшие кадры)'] >= 55;

const report = {
  вьюпорт: '380x780, dpr 2, троттлинг CPU 4x',
  анимируемыеСвойства: animated,
  запрещённыеСвойства: illegal,
  раскладкаИдентична: layoutIdentical,
  строчныеБоксыПоМасштабам: layout,
  'с filter: blur()': withBlur,
  'без filter: blur()': withoutBlur,
  вердиктСБлюром: illegal.length === 0 && layoutIdentical && passes(withBlur) ? 'ПРОШЁЛ' : 'ПРОВАЛ',
  вердиктБезБлюра: illegal.length === 0 && layoutIdentical && passes(withoutBlur) ? 'ПРОШЁЛ' : 'ПРОВАЛ',
};

console.log(JSON.stringify(report, null, 2));
await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s6.json', import.meta.url), JSON.stringify(report, null, 2));

await browser.close();

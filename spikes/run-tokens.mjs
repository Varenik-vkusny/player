// S11: выразима ли ссылка на токен темы через тот же `setProperty`,
// которым плеер накатывает стиль элемента (render.ts:115-116).
//
// Головной вопрос не «работает ли var()» — а что происходит при
// НЕИЗВЕСТНОМ токене. Это класс дефекта anime.js с неизвестной плавностью:
// молчит и делает не то. Нужно число, а не уверенность.
//
// headless: true намеренно. В отличие от S0/S6/S9 здесь не меряется
// ни время, ни кадры — только разбор значений CSSOM, а он от видимости
// окна не зависит.
//
// Запуск (сервер спайков должен быть поднят — pnpm spikes:serve):
//   node spikes/run-tokens.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => console.log(`[страница] ${m.text()}`));
page.on('pageerror', (e) => { console.error('ОШИБКА СТРАНИЦЫ:', e.message); throw e; });

await page.goto('http://localhost:5180/s11-tokens/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__s11, null, { timeout: 30_000 });
const result = await page.evaluate(() => window.__s11);

console.log(JSON.stringify(result, null, 2));

// Разбор вслух: спайк обязан отвечать выводом, а не оставлять числа
// на толкование читателю.
const verdict = [];
verdict.push(
  result.known.computed === 'rgb(76, 141, 255)'
    ? 'ДА: известный токен разрешается — ссылка выразима без правки схемы'
    : `НЕТ: известный токен дал ${result.known.computed}`,
);
verdict.push(
  result.unknown.computed === result.unknown.inheritedByDefault
    ? `ТИХИЙ ОТКАЗ: неизвестный токен отбрасывает объявление целиком, элемент показывает унаследованное (${result.unknown.computed}). Ошибки нет — предупреждать обязан РЕДАКТОР`
    : `неизвестный токен дал ${result.unknown.computed}`,
);
verdict.push(
  result.themeSwap.changed && result.themeSwap.elementInlineUnchanged
    ? 'СМЕНА ТЕМЫ: одна запись на предке перекрашивает элементы, инлайн элемента не тронут'
    : 'СМЕНА ТЕМЫ НЕ РАБОТАЕТ так, как рассчитывали',
);
console.log('\n' + verdict.map((line) => '  · ' + line).join('\n'));

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./results/s11.json', import.meta.url),
  JSON.stringify({ result, verdict }, null, 2),
);
console.log('\nРезультат записан: spikes/results/s11.json');

await browser.close();

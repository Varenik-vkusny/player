// S12: «Штора» и «Круг» плашкой на transform при троттлинге CPU 4x.
//
// Критерий ЗАФИКСИРОВАН ДО ЗАМЕРА решением владельца 05.08.2026:
// fps p5 (худшие кадры) >= 55 — тот же порог, что у S6. Приём, не прошедший
// порог, в перечисление схемы v9 НЕ попадает: схема не имеет права обещать
// то, чего плеер не даёт. Правило, придуманное после числа, всегда
// подгоняется под число, поэтому оно записано здесь, а не в отчёте.
//
// Прецедент «Размытия» здесь не работает: размытие в каталоге не потому,
// что ему простили цену, а потому что оно замер ПРОШЛО (58.8 при пороге 55).
//
// Машина обязана быть незанятой. В S6 замер шёл параллельно с другими
// задачами: медиана не изменилась, а хвост разошёлся вдвое — испортилась
// ровно та величина, ради которой всё затевалось.
//
// Запуск: pnpm spikes:serve  (отдельный терминал), затем
//         pnpm spike:transitions

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

await page.goto('http://localhost:5180/s12-transitions/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.dataset.ready === '1', { timeout: 20000 });

// Троттлинг процессора — через CDP, как в DevTools и как в S6.
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

/**
 * Замер одного приёма: прогревочный проход, затем зачётный.
 *
 * Прогрев не роскошь. В первом прогоне S12 «Штора» мерялась первой и дала
 * худший кадр 121 мс при минимуме 8.3 fps, а «Круг» вторым — 19.3 мс
 * и 51.8 fps. Разница на порядок у приёма, который двигает ОДНУ плашку
 * по translateX, физически неоткуда взяться: первый замер платит за JIT,
 * первичную растеризацию слоёв и первый AudioContext. Без прогрева порядок
 * замера решал бы исход, то есть число говорило бы о расписании прогона,
 * а не о приёме.
 *
 * Свойства собираются ПОСЛЕ построения таймлайна каждого приёма: в первом
 * прогоне проверка инварианта №8 читалась один раз до всех замеров и потому
 * покрывала только тот приём, чей таймлайн собрался при загрузке. Вердикт
 * выглядел проверкой обоих, а проверял один.
 */
async function measure(technique) {
  await page.evaluate((t) => window.__measure(2, t), technique);   // прогрев, отбрасывается
  const result = await page.evaluate((t) => window.__measure(10, t), technique);
  const illegal = await page.evaluate(() => window.__illegalProps);
  const animated = await page.evaluate(() => [...window.__animatedProps]);
  return { result, illegal, animated };
}

const wipeRun = await measure('wipe');
const circleRun = await measure('circle');

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

const wipe = wipeRun.result;
const circle = circleRun.result;
const illegal = [...new Set([...wipeRun.illegal, ...circleRun.illegal])];
const animated = [...new Set([...wipeRun.animated, ...circleRun.animated])];

const passes = (p) => p['fps p5 (худшие кадры)'] >= 55;
const legal = illegal.length === 0;

const report = {
  вьюпорт: '380x780, dpr 2, троттлинг CPU 4x',
  порогЗафиксированДоЗамера: 55,
  элементовНаСцене: 15,
  анимируемыеСвойства: animated,
  запрещённыеСвойства: illegal,
  Штора: wipe,
  Круг: circle,
  вердиктШтора: legal && passes(wipe) ? 'ПРОШЁЛ' : 'ПРОВАЛ',
  вердиктКруг: legal && passes(circle) ? 'ПРОШЁЛ' : 'ПРОВАЛ',
};

await mkdir('spikes/results', { recursive: true });
await writeFile('spikes/results/s12.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();

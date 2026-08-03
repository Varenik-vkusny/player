// S10: можно ли отдать слот работы автора одной вкладке так, чтобы вторая
// открылась на чтение — и чтобы после аварии первой слот НЕ остался заперт.
//
// Решение Сессии 16: «вторая вкладка предупреждает и не пишет». Механизм —
// Web Locks: вкладка держит именованную блокировку всё время жизни, вторая
// пробует взять её с {ifAvailable: true} и получает null.
//
// Что здесь на самом деле опасно. Не то, что механизм не заработает, —
// а то, что блокировка ПЕРЕЖИВЁТ смерть вкладки. Тогда один аварийно
// закрытый Chrome навсегда переводит автора в режим чтения, и он ничего
// не сможет с этим сделать: кнопки «отобрать слот» у него нет и быть
// не должно. Поэтому крах рендерера проверяется отдельно от закрытия,
// и проверяется настоящим крахом через CDP, а не имитацией.
//
// Отдельно проверяется, что две страницы одного BrowserContext видят
// блокировки друг друга: без этого свойство нечем покрыть e2e-тестом,
// и решение пришлось бы менять.
//
// Запуск (сервер спайков должен быть поднят — pnpm spikes:serve):
//   node spikes/run-tab-lock.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const ORIGIN = 'http://localhost:5180/s10-tab-lock/';
const LOCK = 'player-workspace';

const browser = await chromium.launch({ headless: false });
// Один контекст на все страницы — это и есть проверяемое условие: так же
// устроены две вкладки одного браузера у автора и две страницы в e2e.
const context = await browser.newContext();

/** Открывает страницу спайка. */
async function newPage() {
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: 'load' });
  return page;
}

/**
 * Вкладка берёт блокировку и держит её всё время жизни.
 *
 * Обещание, возвращённое из обработчика, не резолвится никогда — именно так
 * Web Locks удерживают блокировку. Само `request` при этом не ждём: оно
 * завершится только при снятии. Ждём отдельного обещания о ЗАХВАТЕ.
 */
async function holdLock(page) {
  return page.evaluate((name) => {
    window.__acquired = new Promise((resolve) => {
      navigator.locks.request(name, { mode: 'exclusive' }, () => {
        resolve(true);
        return new Promise(() => {});
      });
    });
    return window.__acquired;
  }, LOCK);
}

/** Проба: свободна ли блокировка прямо сейчас. Взятую сразу отпускает. */
async function tryAcquire(page) {
  return page.evaluate((name) => {
    return navigator.locks.request(name, { ifAvailable: true }, (lock) => lock !== null);
  }, LOCK);
}

/** Что видно про блокировку со стороны — без попытки её взять. */
async function queryLocks(page) {
  return page.evaluate(async (name) => {
    const state = await navigator.locks.query();
    return {
      удерживаются: state.held.filter((l) => l.name === name).map((l) => l.mode),
      вОчереди: state.pending.filter((l) => l.name === name).length,
    };
  }, LOCK);
}

/**
 * Ждёт освобождения блокировки, опрашивая пробой. Возвращает, сколько ждали.
 *
 * Опрос, а не однократная проверка: снятие блокировки после смерти вкладки
 * происходит в процессе браузера и не обязано быть синхронным с закрытием.
 * Нам важно не только ЧТО освободится, но и ЗА СКОЛЬКО: полсекунды автор
 * не заметит, полминуты — заметит и решит, что сломалось.
 */
async function waitForRelease(page, limitMs = 10_000) {
  const started = Date.now();
  for (;;) {
    if (await tryAcquire(page)) return { освободилась: true, черезМс: Date.now() - started };
    if (Date.now() - started > limitMs) return { освободилась: false, черезМс: Date.now() - started };
    await page.waitForTimeout(50);
  }
}

const report = {};

// --- 0. Есть ли вообще Web Locks на этом origin -------------------------

const probe = await newPage();
report.поддержка = await probe.evaluate(() => ({
  userAgent: navigator.userAgent,
  origin: location.origin,
  естьLocks: typeof navigator.locks !== 'undefined',
  естьIfAvailable: typeof navigator.locks?.request === 'function',
}));
console.log('\n=== Поддержка ===');
console.log(JSON.stringify(report.поддержка, null, 2));

// --- 1. Первая вкладка берёт слот, вторая получает отказ -----------------

const tabA = await newPage();
const acquiredA = await holdLock(tabA);

const tabB = await newPage();
const bGotLock = await tryAcquire(tabB);

report.двеВкладки = {
  перваяВзялаСлот: acquiredA === true,
  втораяПолучилаОтказ: bGotLock === false,
  чтоВидитВтораяСоСтороны: await queryLocks(tabB),
};
console.log('\n=== Две вкладки одного контекста ===');
console.log(JSON.stringify(report.двеВкладки, null, 2));

// --- 2. Закрытие вкладки освобождает слот -------------------------------

await tabA.close();
report.послеЗакрытия = await waitForRelease(tabB);
console.log('\n=== После закрытия первой вкладки ===');
console.log(JSON.stringify(report.послеЗакрытия, null, 2));

// --- 3. КРАХ рендерера освобождает слот ---------------------------------
//
// Настоящий крах через CDP, а не page.close(): закрытие — штатный путь,
// на нём отрабатывают обработчики выгрузки. Автор же теряет вкладку иначе:
// падением рендерера, убитым процессом, разрядившимся ноутбуком. Если слот
// переживает такое, механизм не годится, а по штатному закрытию этого
// не увидеть.

const tabC = await newPage();
await holdLock(tabC);
const heldBeforeCrash = await tryAcquire(tabB);

const crashed = new Promise((resolve) => tabC.once('crash', () => resolve(true)));
const cdp = await context.newCDPSession(tabC);
cdp.send('Page.crash').catch(() => {}); // сам вызов не возвращается — рендерер умирает
await crashed;

report.послеКраха = {
  слотБылЗанятДоКраха: heldBeforeCrash === false,
  ...(await waitForRelease(tabB)),
};
console.log('\n=== После КРАХА рендерера ===');
console.log(JSON.stringify(report.послеКраха, null, 2));

// --- 4. Перезагрузка своей вкладки не запирает саму себя ----------------
//
// Автор жмёт F5 в своей единственной вкладке. Если блокировка не успевает
// сняться до того, как новая страница попробует её взять, автор увидит
// «работа открыта в другой вкладке», не открыв ни одной другой.

const tabD = await newPage();
await holdLock(tabD);
await tabD.reload({ waitUntil: 'load' });
const reacquired = await holdLock(tabD);

report.послеПерезагрузки = {
  своя_вкладка_взяла_слот_снова: reacquired === true,
};
console.log('\n=== После перезагрузки своей же вкладки ===');
console.log(JSON.stringify(report.послеПерезагрузки, null, 2));

// --- Вердикт ------------------------------------------------------------

report.вердикт =
  report.поддержка.естьLocks === true &&
  report.двеВкладки.перваяВзялаСлот === true &&
  report.двеВкладки.втораяПолучилаОтказ === true &&
  report.послеЗакрытия.освободилась === true &&
  report.послеКраха.слотБылЗанятДоКраха === true &&
  report.послеКраха.освободилась === true &&
  report.послеПерезагрузки.своя_вкладка_взяла_слот_снова === true
    ? 'ПРОШЁЛ'
    : 'ТРЕБУЕТ РАЗБОРА';

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s10.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\nРезультат записан: spikes/results/s10.json`);
console.log(`Вердикт: ${report.вердикт}`);

await browser.close();
if (report.вердикт !== 'ПРОШЁЛ') process.exit(1);

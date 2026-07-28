// S8: где на самом деле обрывается localStorage на этом origin, что именно
// бросается при превышении, и что в этот момент видит вкладка-читатель.
//
// Не верим документации ("обычно 5-10 МБ") — меряем растущей строкой на
// настоящем Chromium: грубый проход мегабайтами находит интервал, где
// setItem начинает падать, бинарный поиск внутри интервала находит точную
// границу в символах (JS-строка — UTF-16, поэтому байт вдвое больше).
//
// Отдельно: старое значение в сторадже переживает провалившийся setItem
// нетронутым — то есть если вкладка-читатель откроется позже, она увидит
// СТАРЫЙ проект без всякого признака, что только что была попытка его
// перезаписать. Это и есть тихий отказ, а не «плеер сразу поймёт, что беда».
//
// Отдельно (для выбора замены канала): IndexedDB на порядки объёмнее —
// контрольная запись на несколько раз больше найденной границы localStorage
// проверяет это не по документации, а тем же способом.
//
// Запуск (сервер спайков должен быть поднят — pnpm spikes:serve):
//   node spikes/run-quota.mjs

import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const ORIGIN = 'http://localhost:5180/s8-quota/';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
page.on('pageerror', (e) => { throw e; });

await page.goto(ORIGIN, { waitUntil: 'load' });
console.log(`Origin: ${await page.evaluate(() => location.origin)}`);
console.log(`User-Agent (версия Chromium): ${await page.evaluate(() => navigator.userAgent)}`);

// --- 1. Граница localStorage -------------------------------------------

const boundary = await page.evaluate(() => {
  const KEY = 'quota-probe';
  localStorage.clear();

  function attempt(chars) {
    try {
      localStorage.setItem(KEY, 'x'.repeat(chars));
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: {
          name: e.name,
          message: e.message,
          isDOMException: e instanceof DOMException,
          code: typeof e.code === 'number' ? e.code : null,
        },
      };
    }
  }

  const MB = 1024 * 1024; // символов, не байт — уточняем байты отдельно ниже
  let lastOkChars = 0;
  let firstFailMB = null;
  let firstFailError = null;

  // Грубый проход: до 64 МБ символов (128 МБ в UTF-16-байтах) — с большим
  // запасом относительно любого правдоподобного значения квоты.
  for (let mb = 1; mb <= 64; mb++) {
    const r = attempt(mb * MB);
    if (r.ok) {
      lastOkChars = mb * MB;
    } else {
      firstFailMB = mb;
      firstFailError = r.error;
      break;
    }
  }

  if (firstFailMB === null) {
    localStorage.removeItem(KEY);
    return { границаНеНайдена: true, последнееПрошедшее: lastOkChars };
  }

  // Бинарный поиск внутри последнего пройденного мегабайта.
  let lo = lastOkChars; // точно проходит
  let hi = firstFailMB * MB; // точно не проходит
  let lastError = firstFailError;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const r = attempt(mid);
    if (r.ok) lo = mid; else { hi = mid; lastError = r.error; }
  }

  localStorage.removeItem(KEY);

  return {
    максимумСимволовКоторыйПрошёл: lo,
    минимумСимволовКоторыйУпал: hi,
    байтУтф16КоторыйПрошёл: lo * 2,
    мбУтф16КоторыйПрошёл: Number((lo * 2 / (1024 * 1024)).toFixed(3)),
    исключениеНаГранице: lastError,
  };
});

console.log('\n=== Граница localStorage.setItem ===');
console.log(JSON.stringify(boundary, null, 2));

// --- 2. Что видит вкладка-читатель при провале записи -------------------

const readerScenario = await page.evaluate(() => {
  const KEY = 'player:preview-project';
  localStorage.clear();

  // Автор уже один раз успешно открыл предпросмотр — в сторадже лежит
  // прежний, маленький проект.
  const previousGood = JSON.stringify({ marker: 'предыдущий успешный проект', size: 'маленький' });
  localStorage.setItem(KEY, previousGood);
  const before = localStorage.getItem(KEY);

  // Теперь автор вшил в сцену большую картинку и снова жмёт «Открыть
  // в плеере» — новая запись заведомо больше любой разумной квоты.
  let thrown = null;
  try {
    localStorage.setItem(KEY, 'x'.repeat(200 * 1024 * 1024));
  } catch (e) {
    thrown = { name: e.name, message: e.message };
  }

  const after = localStorage.getItem(KEY);
  localStorage.removeItem(KEY);

  return {
    setItemБросил: thrown !== null,
    чтоБросил: thrown,
    значениеДоПопытки: before,
    значениеПослеПровалившейсяПопытки: after,
    старыйПроектВыжилНетронутым: before === after,
  };
});

console.log('\n=== Что видит вкладка-читатель при провале записи ===');
console.log(JSON.stringify(readerScenario, null, 2));

// --- 3. Контрольная проверка IndexedDB на порядок большим объёмом -------

const targetForIndexedDb = Math.max(
  20 * 1024 * 1024,
  (boundary.байтУтф16КоторыйПрошёл ?? boundary.последнееПрошедшее ?? 0) * 3,
);

const indexedDbCheck = await page.evaluate(async (targetBytes) => {
  const DB = 'quota-probe-db';
  const STORE = 'store';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('indexedDB.open без причины'));
    });
  }

  const started = performance.now();
  const db = await openDb();
  const text = 'x'.repeat(targetBytes / 2); // символы UTF-16, targetBytes байт

  let error = null;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(text, 'probe');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('транзакция без причины'));
      tx.onabort = () => reject(tx.error ?? new Error('транзакция прервана'));
    });
  } catch (e) {
    error = { name: e.name, message: e.message };
  }

  // Проверяем, что реально читается обратно то же самое, а не тихо усечено.
  let readBackLength = null;
  if (!error) {
    readBackLength = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('probe');
      req.onsuccess = () => resolve(req.result ? req.result.length : null);
      req.onerror = () => reject(req.error ?? new Error('чтение без причины'));
    });
  }

  db.close();
  indexedDB.deleteDatabase(DB);

  return {
    целевыхБайт: targetBytes,
    целевыхМб: Number((targetBytes / (1024 * 1024)).toFixed(1)),
    успех: error === null,
    ошибка: error,
    символовЗаписаноПрочитано: readBackLength,
    совпалоСОжидаемым: readBackLength === text.length,
    времяМс: Math.round(performance.now() - started),
  };
}, targetForIndexedDb);

console.log('\n=== Контрольная запись в IndexedDB ===');
console.log(JSON.stringify(indexedDbCheck, null, 2));

const report = {
  origin: await page.evaluate(() => location.origin),
  userAgent: await page.evaluate(() => navigator.userAgent),
  границаLocalStorage: boundary,
  сценарийВкладкиЧитателя: readerScenario,
  контрольIndexedDb: indexedDbCheck,
  вердикт:
    boundary.исключениеНаГранице?.name === 'QuotaExceededError' &&
    readerScenario.setItemБросил === true &&
    readerScenario.старыйПроектВыжилНетронутым === true &&
    indexedDbCheck.успех === true
      ? 'ПРОШЁЛ'
      : 'ТРЕБУЕТ РАЗБОРА',
};

await mkdir(new URL('./results/', import.meta.url), { recursive: true });
await writeFile(new URL('./results/s8.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(`\nРезультат записан: spikes/results/s8.json`);
console.log(`Вердикт: ${report.вердикт}`);

await browser.close();
if (report.вердикт !== 'ПРОШЁЛ') process.exit(1);

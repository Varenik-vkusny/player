/**
 * Инвариант №9: плеер собирается в самостоятельный ESM-бандл и открывается
 * в голом HTML-файле. «Проверять это тестом, а не верой».
 *
 * Проверяется три вещи, а не одна:
 *   1. бандл действительно самодостаточен — внутри не осталось импортов
 *      по именам пакетов, которые браузеру нечем разрешить;
 *   2. файл отдаётся браузеру БЕЗ преобразования — байты совпадают с диском,
 *      то есть сборщик в момент открытия не участвует;
 *   3. плеер в таком окружении реально работает, а не просто загружается.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import { migrateToCurrent } from '@player/core';

const BUNDLE_PATH = new URL('../apps/playground/public/bundle/player.js', import.meta.url);

const sha256 = (data: Buffer | string): string =>
  createHash('sha256').update(data).digest('hex');

async function openBare(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/bare.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null,
    { timeout: 30_000 });
  return errors;
}

test.describe('инвариант №9: самостоятельный бандл в голом HTML', () => {
  /**
   * Внешние модули в тексте бандла — по ОБЪЯВЛЕНИЯМ, а не по слову «from».
   *
   * Прежний вид (`/\bfrom\s*["']…/`) искал слово `from` перед кавычкой
   * и потому ловил обычный текст. 16.08.2026 он покраснел на строке
   * `u(n.from, [...a, "from"]), c = u(n.to, [...a, "to"])` — это путь ошибки
   * в проверке схемы, а не импорт. Проверено прогоном: импорт-объявлений
   * в бандле 0, динамических импортов 0.
   *
   * Замена сделана СТРОЖЕ прежнего, а не слабее: добавлены side-effect
   * импорты (`import"pkg"`), реэкспорты (`export … from "pkg"`)
   * и динамический `import("pkg")` — прежний регекс не ловил ни один из трёх.
   */
  const externalModulesIn = (source: string): string[] => [
    // import … from "pkg" / export … from "pkg" — ключевое слово обязано
    // стоять началом инструкции, иначе это снова текст внутри строки.
    ...source.matchAll(/(?:^|[;}\s])(?:import|export)\b[^;'"]*?\bfrom\s*["'](?![./])([^"']+)["']/g),
    // import "pkg" — импорт ради побочного действия, без имён.
    ...source.matchAll(/(?:^|[;}\s])import\s*["'](?![./])([^"']+)["']/g),
    // import("pkg") — динамический.
    ...source.matchAll(/\bimport\(\s*["'](?![./])([^"']+)["']\s*\)/g),
  ].map((match) => match[1]!);

  test('в бандле не осталось неразрешимых импортов', async () => {
    const source = await readFile(BUNDLE_PATH, 'utf8');
    // Импорт по имени пакета («from "zod"») браузер разрешить не сможет:
    // карты импортов в голом HTML нет.
    const bare = externalModulesIn(source);
    expect(bare, `бандл тянет внешние модули: ${bare.join(', ')}`).toEqual([]);
  });

  test('охранник умеет находить нарушение: иначе он зелен впустую', () => {
    // Тот же приём, что у стражей инвариантов в ядре. Без него починка
    // регекса могла бы тихо выключить проверку — и «внешних модулей нет»
    // стало бы значить «искать перестали».
    expect(externalModulesIn('import { z } from "zod";')).toEqual(['zod']);
    expect(externalModulesIn('import"polyfill";')).toEqual(['polyfill']);
    expect(externalModulesIn('export { x } from "lodash";')).toEqual(['lodash']);
    expect(externalModulesIn('await import("chunk-pkg");')).toEqual(['chunk-pkg']);

    // И НЕ находит того, чего нет: относительные пути законны, слово `from`
    // внутри строки — тоже.
    expect(externalModulesIn('import { a } from "./local.js";')).toEqual([]);
    expect(externalModulesIn('u(n.from, [...a, "from"]), c = u(n.to, [...a, "to"]);')).toEqual([]);
  });

  test('браузер получает файл байт в байт, без сборщика в середине', async ({ page }) => {
    const onDisk = await readFile(BUNDLE_PATH);
    const response = await page.request.get('/bundle/player.js');
    expect(response.status()).toBe(200);

    const served = await response.body();
    expect(sha256(served), 'отданный файл отличается от собранного').toBe(sha256(onDisk));
  });

  test('плеер работает в голом HTML: сцена строится, гейт срабатывает', async ({ page }) => {
    const errors = await openBare(page);
    expect(errors, 'в голом HTML не должно быть ошибок').toEqual([]);

    await expect(page.locator('.player-stage > *')).toHaveCount(7);
    // Инвариант №3 действует и здесь: вне гейта сцена недоступна.
    const pointerEvents = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEvents).toBe('none');

    await expect(page.locator('#state')).toHaveText('ready');
  });

  test('валидация действует и в голом HTML', async ({ page }) => {
    // Подменяем ответ сервера битым проектом: загрузка обязана упасть громко,
    // а не открыть «что получилось».
    //
    // demo.json на диске — ещё схема v1, миграция в v3 идёт при загрузке
    // (packages/core/src/load.ts: migrateToCurrent, потом валидация). Портить
    // v1-кью (cue.targetId на несуществующий элемент) больше не годится:
    // миграция сама отбрасывает такую ссылку молча — `applyProperty` вызывается
    // только `if (state && from)` (packages/core/src/migrations.ts:329), а раз
    // элемента с таким id нет, `state` не находится, и запись в `states`
    // просто не создаётся. Ссылка на несуществующий элемент в v1-кью поэтому
    // больше не доходит до валидации как ошибка.
    //
    // Портим поэтому уже МИГРИРОВАННЫЙ v3-проект: дописываем слайду состояние
    // элемента, которого нет в списке элементов сегмента. Эту ссылку схема v3
    // проверяет явно (packages/core/src/schema.ts:443-451).
    await page.route('**/fixtures/demo.json', async (route) => {
      const original = await route.fetch();
      const raw = await original.json();
      const migrated = migrateToCurrent(raw) as {
        segments: { slides: { states: Record<string, unknown> }[] }[];
      };
      const states = migrated.segments[0]!.slides[0]!.states;
      states['элемента-с-таким-id-нет'] = states['card'];
      await route.fulfill({ json: migrated });
    });

    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));

    await page.goto('/bare.html', { waitUntil: 'load' });
    await expect
      .poll(() => failures.join('\n'), { timeout: 15_000 })
      .toContain('которого нет в сегменте');

    const ready = await page.evaluate(() => document.documentElement.dataset['ready']);
    expect(ready, 'битый проект не должен доходить до готовности').toBeUndefined();
  });

  test('у контейнера сцены свой непрозрачный фон, а не просвечивающий', async ({ page }) => {
    // Не косметика. Chromium выбирает режим сглаживания текста по тому, знает
    // ли слой свой непрозрачный фон: при просвечивании он считает фон
    // неизвестным и рисует буквы серым сглаживанием вместо субпиксельного.
    // Измерено на preview.html: без своего фона те же буквы расходились
    // с редактором на 524 пикселя из 360 800, с фоном — на 0.
    //
    // Здесь это важнее, чем в оснастке: bare.html — зрительская точка входа
    // (инвариант №9), и инвариант №5 обещает, что автор видит ровно то же,
    // что зритель. Пиксели тут не сравниваются, поэтому проверяем причину,
    // а не следствие: такой тест не зависит от шрифтов и не будет мигать.
    await openBare(page);

    const background = await page.evaluate(() => {
      const host = document.getElementById('host');
      if (!host) throw new Error('нет контейнера сцены');
      return getComputedStyle(host).backgroundColor;
    });

    expect(background, 'контейнер сцены не имеет своего фона').not.toBe('rgba(0, 0, 0, 0)');
    expect(background, 'фон контейнера сцены полупрозрачен').not.toMatch(/rgba\([^)]*,\s*0?\.\d+\)/);
  });
});

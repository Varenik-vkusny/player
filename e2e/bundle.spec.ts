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
  test('в бандле не осталось неразрешимых импортов', async () => {
    const source = await readFile(BUNDLE_PATH, 'utf8');
    // Импорт по имени пакета («from "zod"») браузер разрешить не сможет:
    // карты импортов в голом HTML нет.
    const bare = source.match(/\bfrom\s*["'](?![./])[^"']+["']/g) ?? [];
    expect(bare, `бандл тянет внешние модули: ${bare.join(', ')}`).toEqual([]);
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
    await page.route('**/fixtures/demo.json', async (route) => {
      const original = await route.fetch();
      const project = await original.json();
      project.scene.cues[0].targetId = 'элемента-с-таким-id-нет';
      await route.fulfill({ json: project });
    });

    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));

    await page.goto('/bare.html', { waitUntil: 'load' });
    await expect
      .poll(() => failures.join('\n'), { timeout: 15_000 })
      .toContain('несуществующий элемент');

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

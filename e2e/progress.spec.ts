/**
 * Двухуровневый прогресс: где зритель внутри главы и где в объяснении целиком.
 *
 * Главное здесь — не число, а ЧЕСТНОСТЬ числа. Длина объяснения заранее
 * неизвестна: ветвление ведёт разных зрителей разными путями. Точный процент
 * и «глава 3 из 7» одинаково врут ровно там, где продукт обещает выбор.
 *
 * Но врут они не всегда: пока впереди у каждой главы одно продолжение,
 * остаток известен точно, и прятать его — такая же неправда, только в другую
 * сторону. Поэтому знаменатель называется тогда и только тогда, когда он есть.
 */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, fixture: string): Promise<void> {
  await page.goto(`/?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const progressOf = (page: Page) =>
  page.evaluate(() => document.getElementById('progress')?.textContent ?? '');

test.describe('прогресс не обещает того, чего не знает', () => {
  test('перед развилкой длина объяснения не называется', async ({ page }) => {
    await open(page, 'split-track');
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');

    // Впереди развилка: сколько частей осталось — зависит от ответа, которого
    // ещё нет. Знаменателя быть не должно.
    const text = await progressOf(page);
    expect(text).toContain('глава 1');
    expect(text, 'знаменатель тут был бы выдумкой').not.toContain('из');
  });

  test('после развилки, когда путь однозначен, длина называется', async ({ page }) => {
    await open(page, 'split-track');
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
    await page.getByRole('button', { name: 'Налево' }).click();

    // Ветка ведёт в продолжение, продолжение — концовка. Дальше развилок нет,
    // поэтому остаток известен точно и его честно показать.
    await expect(page.locator('[data-id="l-bg"]')).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => progressOf(page), { timeout: 10_000 }).toContain('из');
  });

  test('номер главы растёт по мере прохождения', async ({ page }) => {
    await open(page, 'split-track');
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
    expect(await progressOf(page)).toContain('глава 1');

    await page.getByRole('button', { name: 'Направо' }).click();
    await expect(page.locator('[data-id="t-bg"]')).toBeVisible({ timeout: 20_000 });

    // Ветка и продолжение — это вторая и третья главы пути ЭТОГО зрителя.
    await expect.poll(() => progressOf(page), { timeout: 10_000 }).toContain('глава 3');
  });

  test('на линейном объяснении знаменатель есть с самого начала', async ({ page }) => {
    // demo, а не minimal: у minimal нет аудиофайла на диске (так и задумано —
    // часть фикстур проверяет разбор, а не звук), поэтому кадровый цикл
    // там не запускается и показаниям прогресса взяться неоткуда.
    await open(page, 'demo');
    await page.getByRole('button', { name: 'Играть' }).click();
    // Одна глава без развилок: «глава 1 из 1» — правда, а не заглушка.
    await expect.poll(() => progressOf(page), { timeout: 15_000 }).toContain('из 1');
  });
});

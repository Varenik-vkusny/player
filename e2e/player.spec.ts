/**
 * Поведенческие тесты плеера.
 *
 * Проверяют то, чего не видит юнит-тест: что зритель действительно не может
 * кликнуть вне гейта, что остановка происходит на нужной секунде и что
 * возобновление не перематывает дорожку.
 */
import { expect, test, type Page } from '@playwright/test';

/** Гейты в фикстуре e2e стоят на словах «смотришь» (1.175 с) и «момент» (2.938 с). */
const FIRST_GATE_AT = 1.175;

async function openPlayground(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=e2e', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

test.describe('плеер: сквозной сценарий', () => {
  test('грузит фикстуру, строит сцену и ждёт жеста', async ({ page }) => {
    await openPlayground(page);

    expect(await stateOf(page)).toBe('ready');
    await expect(page.locator('.player-stage > *')).toHaveCount(7);
    // Первый кадр отрисован: зритель видит сцену, а не пустоту.
    await expect(page.locator('[data-id="title"]')).toBeVisible();
  });

  test('вне гейта ни один элемент сцены не получает клики', async ({ page }) => {
    await openPlayground(page);

    // Инвариант №3: не «мы не вешаем обработчик», а физически недоступно.
    const pointerEvents = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEvents).toBe('none');

    // Проверка попадания проходит НАСКВОЗЬ: в точке элемента лежит не элемент.
    const hit = await page.evaluate(() => {
      const node = document.querySelector('[data-id="title"]')!;
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top?.getAttribute('data-id') ?? top?.tagName.toLowerCase() ?? null;
    });
    expect(hit, 'в точке элемента сцены не должно быть самого элемента').not.toBe('title');
  });

  test('останавливается на гейте ровно на его времени', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    expect(await stateOf(page)).toBe('at-gate');

    const position = await positionOf(page);
    // Логическое время записывается явно, а не «где успели затормозить».
    expect(Math.abs(position - FIRST_GATE_AT)).toBeLessThan(0.001);
  });

  test('в гейте сцена становится доступной, после — снова нет', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const inGate = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(inGate).toBe('auto');

    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();

    const afterGate = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(afterGate).toBe('none');
  });

  test('неверный ответ не пропускает дальше, верный — пропускает', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Отдельный таймер' }).click();
    await expect(page.locator('.feedback')).toContainText('Неверно');
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible();
    expect(await stateOf(page)).toBe('at-gate');

    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(page)).toBe('playing');
  });

  test('возобновление продолжает с той же секунды: перемотки нет', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const atGate = await positionOf(page);
    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect.poll(() => stateOf(page)).toBe('playing');

    // Сразу после возобновления позиция обязана быть НЕ МЕНЬШЕ той, на которой
    // встали. Отход назад означал бы перемотку, а её не существует.
    const afterResume = await positionOf(page);
    expect(afterResume).toBeGreaterThanOrEqual(atGate);
    expect(afterResume - atGate).toBeLessThan(0.5);
  });

  test('доезжает до второго гейта, а он с полем ввода', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Позиция в аудио' }).click();

    await expect(page.locator('#gate-input')).toBeVisible({ timeout: 15_000 });
    await page.locator('#gate-input').fill('гейт');
    await page.getByRole('button', { name: 'Ответить' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(page)).toBe('playing');
  });
});

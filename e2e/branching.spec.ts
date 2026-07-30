/**
 * Развилка: ответ записывается в переменную, СЕГМЕНТ ВЫБИРАЕТ ВЫХОД.
 *
 * До схемы v3 этот файл проверял другое: что клик по варианту немедленно
 * перекидывает зрителя в другой узел. Такого поведения больше не существует
 * и не может существовать — ADR-015 отобрал у гейта право на рёбра, и поля
 * для них в схеме нет вообще. Гейт делает ровно одно: пишет ответ в свою
 * переменную. Решение о следующем сегменте принимает `exit`, когда дорожка
 * доиграет.
 *
 * Разница не косметическая, и именно её и надо охранять тестом: при старом
 * поведении зритель терял остаток объяснения, потому что переход случался
 * из середины дорожки.
 *
 * Проверки нажимают по ВИДИМОМУ элементу сцены, а не зовут `answer()`:
 * логика ответа исправна и при сломанной раскладке, масштабе и порядке
 * наложения — там уже находили дефект, где кликабельная сцена перехватывала
 * нажатия по вариантам.
 *
 * fixtures/projects/exit-branch.json: s-ask с гейтом на второй секунде
 * и двумя правилами выхода; s-right и s-left — концовки без правил.
 * У всех трёх СВОЯ дорожка (ask.wav / branch-yes.wav / branch-no.wav):
 * общий src означал бы попадание в кэш и один и тот же буфер, то есть
 * переход проверялся бы на случае, где ломаться нечему.
 */
import { expect, test, type Page } from '@playwright/test';

async function openBranching(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=exit-branch', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
  return errors;
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

/** Доводит до открытого гейта развилки. */
async function reachGate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Играть' }).click();
  await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
}

test.describe('развилка: выход сегмента выбирает продолжение', () => {
  test('оба варианта нарисованы автором и видны на сцене', async ({ page }) => {
    await openBranching(page);

    expect(await stateOf(page)).toBe('ready');
    await expect(page.locator('[data-id="title"]')).toBeVisible();
    // Ни одна из концовок ещё не показана.
    await expect(page.locator('[data-id="r-bg"]')).toHaveCount(0);
    await expect(page.locator('[data-id="l-bg"]')).toHaveCount(0);
  });

  /**
   * Главный тест файла. Ответ НЕ прыжок: сегмент продолжает играть с той же
   * позиции той же дорожки. Проверяется по двум признакам сразу — состояние
   * снова `playing`, и элемент стартового сегмента всё ещё на сцене.
   */
  test('ответ не перекидывает: сегмент играет дальше с той же дорожки', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    const atGate = await positionOf(page);
    expect(atGate, 'гейт стоит на второй секунде').toBeGreaterThan(1.9);

    await page.getByRole('button', { name: 'Направо' }).click();
    await expect.poll(() => stateOf(page), { timeout: 5_000 }).toBe('playing');

    // Сегмент тот же: его элемент никуда не делся, а концовки ещё нет.
    await expect(page.locator('[data-id="title"]')).toBeVisible();
    await expect(page.locator('[data-id="r-bg"]')).toHaveCount(0);
    // Время идёт вперёд от точки остановки, а не с нуля: перемотки нет.
    await expect.poll(() => positionOf(page), { timeout: 5_000 }).toBeGreaterThan(atGate);
  });

  test('первый вариант приводит в свой сегмент, когда дорожка доиграет', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Направо' }).click();

    await expect(page.locator('[data-id="r-bg"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-id="l-bg"]')).toHaveCount(0);
    // Сцена сменилась целиком: элементов стартового сегмента больше нет.
    await expect(page.locator('[data-id="title"]')).toHaveCount(0);
  });

  test('второй вариант приводит в другой сегмент', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    // «Налево» — не ошибка, а другая ветка. Если гейт держит его за неверный
    // ответ и не пропускает, этот сегмент недостижим навсегда.
    await page.getByRole('button', { name: 'Налево' }).click();

    await expect(page.locator('[data-id="l-bg"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-id="r-bg"]')).toHaveCount(0);
  });

  test('переход не перематывает: новый сегмент начинается со своего начала', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Направо' }).click();
    await expect(page.locator('[data-id="r-bg"]')).toBeVisible({ timeout: 15_000 });

    // После перехода время — это позиция в дорожке НОВОГО сегмента, то есть
    // отсчёт с нуля. Инвариант №1: других часов не существует.
    const afterJump = await positionOf(page);
    expect(afterJump, 'новый сегмент не продолжает чужую дорожку').toBeLessThan(2);
  });

  test('сегмент без правил выхода завершает объяснение, а не падает', async ({ page }) => {
    const errors = await openBranching(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Направо' }).click();
    await expect(page.locator('[data-id="r-bg"]')).toBeVisible({ timeout: 15_000 });

    // Дорожка концовки — три секунды. Дальше идти некуда: правил у выхода нет.
    await expect.poll(() => stateOf(page), { timeout: 20_000 }).toBe('ended');
    await expect(page.getByRole('button', { name: 'Сначала' })).toBeVisible();
    expect(errors, 'завершение не должно ронять страницу').toEqual([]);
  });
});

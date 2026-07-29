/**
 * Развилка: ответ выбирает, какой узел зритель услышит дальше.
 *
 * Проверка «вызвался ли обработчик» здесь была бы зелена при любом дефекте
 * раскладки, масштаба и порядка эффектов, поэтому тест нажимает по видимому
 * элементу сцены и читает то, что оказалось на экране после перехода.
 *
 * fixtures/projects/branching.json: узел n-start с гейтом на слове «смотришь»
 * (1.175 с) и двумя рёбрами по вариантам; n-yes и n-no — концовки без
 * исходящих рёбер, у каждой своя трёхсекундная дорожка и свой текст.
 */
import { expect, test, type Page } from '@playwright/test';

async function openBranching(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=branching', { waitUntil: 'load' });
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

test.describe('развилка: ответ выбирает узел', () => {
  test('оба варианта нарисованы автором и видны на сцене', async ({ page }) => {
    await openBranching(page);

    expect(await stateOf(page)).toBe('ready');
    await expect(page.locator('[data-id="opt-yes"]')).toBeVisible();
    await expect(page.locator('[data-id="opt-no"]')).toBeVisible();
    // Ни один узел-концовка ещё не показан.
    await expect(page.locator('.player-stage')).not.toContainText('Ты выбрал');
  });

  test('первый вариант ведёт в свой узел', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    // Плашки нет: все варианты — элементы сцены (ADR-011).
    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();

    await page.locator('[data-id="opt-yes"]').click();

    await expect(page.locator('.player-stage')).toContainText('Ты выбрал да', { timeout: 10_000 });
    await expect(page.locator('.player-stage')).not.toContainText('Ты выбрал нет');
    // Сцена сменилась целиком: элементов стартового узла на ней больше нет.
    await expect(page.locator('[data-id="opt-yes"]')).toHaveCount(0);
  });

  test('второй вариант ведёт в другой узел', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    // «Нет» — не ошибка, а другая ветка. Если гейт держит его за неверный
    // ответ и не пропускает, этот узел недостижим навсегда.
    await page.locator('[data-id="opt-no"]').click();

    await expect(page.locator('.player-stage')).toContainText('Ты выбрал нет', { timeout: 10_000 });
    await expect(page.locator('.player-stage')).not.toContainText('Ты выбрал да');
  });

  test('переход не перематывает: новый узел начинается со своего начала', async ({ page }) => {
    await openBranching(page);
    await reachGate(page);

    // На гейте время стоит на 1.175 с дорожки СТАРТОВОГО узла.
    const atGate = await positionOf(page);
    expect(atGate).toBeGreaterThan(1);

    await page.locator('[data-id="opt-yes"]').click();
    await expect(page.locator('.player-stage')).toContainText('Ты выбрал да', { timeout: 10_000 });

    // После перехода время — это позиция в дорожке НОВОГО узла, то есть
    // отсчёт с нуля. Инвариант №1: других часов не существует.
    const afterJump = await positionOf(page);
    expect(afterJump, 'новый узел не продолжает чужую дорожку').toBeLessThan(atGate);
  });

  test('узел без исходящих рёбер завершает объяснение, а не падает', async ({ page }) => {
    const errors = await openBranching(page);
    await reachGate(page);

    await page.locator('[data-id="opt-yes"]').click();
    await expect(page.locator('.player-stage')).toContainText('Ты выбрал да', { timeout: 10_000 });

    // Дорожка концовки — три секунды. Дальше идти некуда: рёбер у узла нет.
    await expect.poll(() => stateOf(page), { timeout: 20_000 }).toBe('ended');
    await expect(page.getByRole('button', { name: 'Сначала' })).toBeVisible();
    expect(errors, 'завершение не должно ронять страницу').toEqual([]);
  });
});

/**
 * Разрезанное повествование: несколько частей делят ОДИН аудиофайл.
 *
 * До схемы v4 такого случая не существовало — часть и файл были склеены
 * один к одному, и разрезать повествование на развилке было нечем. Теперь
 * у дорожки части есть окно (`audio.offset` + `audio.duration`), и решение
 * [Р] «аудио физически не режется» наконец выражено в данных.
 *
 * Проверяется НЕ валидность, а ПРОХОДИМОСТЬ. Схема уже умеет отвечать
 * «ссылки целы, покрытие полное» и при этом пропускать объяснение, у которого
 * ветка недостижима навсегда. Поэтому здесь зритель действительно нажимает
 * по видимой кнопке и действительно доезжает до продолжения — обеими ветками.
 *
 * Отдельно ловится самая дорогая ошибка окна — ПЕРЕПУТАННЫЕ КООРДИНАТЫ.
 * Часы живут в координатах файла, всё остальное — в координатах части. Если
 * плеер забудет перевести одно в другое, он не упадёт: он тихо заиграет
 * не тот кусок дорожки. Признак этого — отрицательная позиция.
 *
 * fixtures/projects/split-track.json: четыре части на demo.mp3 окнами
 * 0…2.5, 4…4.6, 5…5.6 и 6…7.5 секунды.
 */
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=split-track', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
  return errors;
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

async function reachFork(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Играть' }).click();
  await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
}

test.describe('разрезанное повествование: части делят один файл окнами', () => {
  test('проект с окнами открывается и играет', async ({ page }) => {
    const errors = await open(page);
    expect(await stateOf(page)).toBe('ready');
    await expect(page.locator('[data-id="h-title"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('развилка останавливает плеер внутри своего окна', async ({ page }) => {
    await open(page);
    await reachFork(page);

    // Развилка стоит на 1.5 с ВНУТРИ части, а часть звучит с начала файла.
    const at = await positionOf(page);
    expect(at, 'остановка на 1.5 с своей части').toBeGreaterThan(1.4);
    expect(at, 'а не на 1.5 с чужого окна').toBeLessThan(2.5);
  });

  /**
   * Главный тест файла: обе ветки доводят до общего продолжения.
   *
   * Ветка, до которой нельзя доехать, — это дефект, который валидация
   * пропускает: рёбра целы, покрытие полное, а зритель туда не попадает.
   */
  for (const [label, branchElement] of [['Налево', 'l-bg'], ['Направо', 'r-bg']] as const) {
    test(`ветка «${label}» доводит до продолжения`, async ({ page }) => {
      const errors = await open(page);
      await reachFork(page);

      await page.getByRole('button', { name: label }).click();

      // Своя ветка со своим окном того же файла.
      await expect(page.locator(`[data-id="${branchElement}"]`)).toBeVisible({ timeout: 20_000 });
      // И дальше — общее продолжение, куда сходятся обе ветки.
      await expect(page.locator('[data-id="t-bg"]')).toBeVisible({ timeout: 20_000 });
      expect(errors, 'проход по ветке не должен ронять страницу').toEqual([]);
    });
  }

  /**
   * Координаты не перепутаны.
   *
   * Продолжение звучит с шестой секунды файла. Если плеер вычитает окно там,
   * где не надо (или не вычитает там, где надо), позиция уедет на величину
   * смещения — до −6 секунд. Отрицательного времени у части быть не может
   * ни при каких обстоятельствах.
   */
  test('время части отсчитывается от её начала, а не от начала файла', async ({ page }) => {
    await open(page);
    await reachFork(page);
    await page.getByRole('button', { name: 'Направо' }).click();
    await expect(page.locator('[data-id="t-bg"]')).toBeVisible({ timeout: 20_000 });

    const inTail = await positionOf(page);
    expect(inTail, 'позиция внутри части не может быть отрицательной').toBeGreaterThanOrEqual(0);
    // Окно продолжения — полторы секунды. Позиция обязана лежать внутри него,
    // а не показывать абсолютное время файла (6…7.5).
    expect(inTail, 'позиция считается в координатах части, а не файла').toBeLessThan(2);
  });

  test('объяснение доигрывает до конца и завершается', async ({ page }) => {
    const errors = await open(page);
    await reachFork(page);
    await page.getByRole('button', { name: 'Налево' }).click();

    await expect.poll(() => stateOf(page), { timeout: 30_000 }).toBe('ended');
    expect(errors, 'завершение не должно ронять страницу').toEqual([]);
  });
});

/**
 * Счётчик сирот цвета.
 *
 * Предмет — не «функция считает», это проверено юнитами
 * (`packages/editor/test/colorOrphans.test.ts`). Здесь проверяется то, чего
 * юнит проверить не может: что число ДОХОДИТ ДО АВТОРА видимой строкой,
 * и что оно живёт в ТОМ ЖЕ счётчике, где сироты меток, а не во втором.
 *
 * Второй счётчик на ту же болезнь приучил бы смотреть в одно место
 * и пропускать другое (`design/styles.md` §4).
 *
 * Почему это вообще нужно: браузер отбрасывает неразрешённую ссылку МОЛЧА,
 * и элемент чернеет насквозь — базовое оформление сцены его не спасает
 * (замерено S14). Плеер про это не скажет никогда, ему нечем.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('сироты цвета доходят до автора', () => {
  test('счётчик называет ТОЧНОЕ число мест и объясняет причину', async ({ page }) => {
    // В фикстуре ровно две сироты, расставленные нарочно и в РАЗНЫХ местах:
    // одна в стиле проекта («Сломанный»), одна у элемента на слайде.
    // Число «2» тем и ценно, что не совпадает ни с числом стилей (2),
    // ни с числом элементов (3) — совпади оно, тест не отличал бы
    // правильную реализацию от «показать сколько-нибудь».
    await openEditor(page, 'style-orphans');

    const counter = page.getByTestId('orphan-counter');
    await expect(counter).toBeVisible();

    const colors = page.getByTestId('orphan-colors');
    await expect(colors).toBeVisible();
    await expect(colors).toContainText('2');
    await expect(colors).toContainText('ссылка на цвет темы');
  });

  test('счётчик ОДИН: строка про цвет живёт внутри счётчика сирот-меток', async ({ page }) => {
    // Слом, который этот тест ловит: завести для цвета отдельный блок
    // рядом. Тогда `orphan-colors` перестанет быть потомком
    // `orphan-counter`, и тест покраснеет.
    await openEditor(page, 'style-orphans');

    const inside = await page.evaluate(() => {
      const counter = document.querySelector('[data-testid="orphan-counter"]');
      const colors = document.querySelector('[data-testid="orphan-colors"]');
      return counter !== null && colors !== null && counter.contains(colors);
    });

    expect(inside, 'строка про цвет обязана лежать ВНУТРИ общего счётчика').toBe(true);
  });

  test('на здоровом проекте строки про цвет НЕТ вовсе', async ({ page }) => {
    // Без этого теста реализация «показывать всегда» прошла бы предыдущие:
    // пустой блок «0 мест требуют проверки» приучал бы глаз пропускать
    // это место — тот же довод, по которому скрыт счётчик меток.
    await openEditor(page, 'styles');

    await expect(page.getByTestId('orphan-colors')).toHaveCount(0);
  });

  test('сирота ВИДНА на сцене: элемент чернеет, здоровый рядом — нет', async ({ page }) => {
    // Доказательство, что фикстура описывает настоящую беду, а не выдумку.
    // Замерено S14: неудачная подстановка var() вычисляется
    // в «унаследованное», и базовое правило сцены элемент не спасает.
    await page.goto('/preview.html?fixture=style-orphans&t=0', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 30_000,
    });

    const seen = await page.evaluate(() => {
      const color = (id: string) =>
        getComputedStyle(document.querySelector(`[data-id="${id}"]`)!).color;
      return {
        вСтиле: color('orphan-style'),
        уЭлемента: color('orphan-own'),
        здоровый: color('healthy-one'),
      };
    });

    expect(seen.вСтиле, 'сирота в стиле обязана почернеть').toBe('rgb(0, 0, 0)');
    expect(seen.уЭлемента, 'сирота у элемента обязана почернеть').toBe('rgb(0, 0, 0)');
    expect(seen.здоровый, 'ссылка с запасом обязана дать цвет темы').toBe('rgb(76, 141, 255)');
  });
});

/**
 * Срез 3 (заход 2): шаблоны сцены.
 *
 * Нажатие по видимой кнопке — не вызов `applyTemplate` в обход интерфейса:
 * так же, как и остальные e2e этой сессии, тест кликает там, где кликнул бы
 * автор, и проверяет то, что реально появилось на сцене и на дорожке.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('шаблоны сцены', () => {
  test('«Вопрос с вариантами»: элементы и гейт появляются, один Ctrl+Z убирает шаблон целиком', async ({
    page,
  }) => {
    await openEditor(page, 'empty');

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(0);

    await page.getByTestId('template-question').click();

    // Шаблон «question» кладёт три элемента (вопрос + два варианта) и один гейт.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(1);

    await page.keyboard.press('Control+z');

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(0);
  });

  test('каждая кнопка шаблона добавляет хотя бы один элемент на чистой сцене', async ({ page }) => {
    const ids = ['title', 'title-text', 'two-columns', 'bullets', 'question'];

    for (const id of ids) {
      await openEditor(page, 'empty');
      await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
      await page.getByTestId(`template-${id}`).click();
      const count = await page.locator('.ed-stage-host [data-id]').count();
      expect(count, `шаблон «${id}» обязан добавить хотя бы один элемент`).toBeGreaterThan(0);
    }
  });
});

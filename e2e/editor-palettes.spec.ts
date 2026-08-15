/**
 * Палитры в панели темы (Сессия 39, спецификация владельца).
 *
 * Ловушка, названная заданием прямо: «после щелчка тема изменилась» верно
 * и при поломанной палитре, которая красит только ОДНУ роль (например
 * только фон) — поэтому каждый тест читает вычисленный стиль ДВУХ разных
 * узлов сцены, ссылающихся на ДВЕ разные роли темы (`--scene-surface` для
 * фона плашки и `--scene-ink-muted` для цвета текста note, `fixtures/
 * projects/styles.json`). Слом «применяет только фон» покраснел бы здесь
 * и остался бы зелёным на проверке одного узла.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.getByTestId('rail-theme').click();
}

async function computedOf(
  page: Page,
  id: string,
  property: 'backgroundColor' | 'color',
): Promise<string> {
  return page.evaluate(
    ({ elementId, prop }) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      return getComputedStyle(node)[prop];
    },
    { elementId: id, prop: property },
  );
}

test.describe('палитры темы', () => {
  test('щелчок по образцу красит фон плашки И цвет note — ДВЕ разные роли, не одну', async ({
    page,
  }) => {
    await openEditor(page, 'styles');

    // Умолчания схемы (палитра «Ночь») — до всякого щелчка.
    expect(await computedOf(page, 'plate-1', 'backgroundColor'), 'фон плашки до палитры').toBe(
      'rgb(27, 36, 48)',
    );
    expect(await computedOf(page, 'note', 'color'), 'цвет note до палитры').toBe(
      'rgb(147, 164, 184)',
    );

    // «Ночь» обязана быть в ряду — сегодняшние умолчания, первая палитра.
    await expect(page.getByTestId('palette-night')).toBeVisible();

    await page.getByTestId('palette-graphite').click();

    // Обе роли — из PALETTES['graphite']: --scene-surface #212121,
    // --scene-ink-muted #9e9e9e.
    await expect.poll(() => computedOf(page, 'plate-1', 'backgroundColor')).toBe('rgb(33, 33, 33)');
    expect(await computedOf(page, 'note', 'color'), 'вторая роль обязана была уехать тоже').toBe(
      'rgb(158, 158, 158)',
    );
  });

  test('Ctrl+Z возвращает ВСЮ палитру одним шагом, а не по роли', async ({ page }) => {
    await openEditor(page, 'styles');

    const bgBefore = await computedOf(page, 'plate-1', 'backgroundColor');
    const inkBefore = await computedOf(page, 'note', 'color');

    await page.getByTestId('palette-graphite').click();

    // Промежуточная проверка: щелчок обязан был подействовать до отката.
    await expect.poll(() => computedOf(page, 'plate-1', 'backgroundColor')).toBe('rgb(33, 33, 33)');
    expect(await computedOf(page, 'note', 'color')).toBe('rgb(158, 158, 158)');
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeEnabled();

    await page.keyboard.press('Control+z');

    await expect.poll(() => computedOf(page, 'plate-1', 'backgroundColor')).toBe(bgBefore);
    expect(await computedOf(page, 'note', 'color'), 'вторая роль обязана вернуться тем же шагом').toBe(
      inkBefore,
    );

    // Шаг был ровно один: отменять больше нечего.
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  });
});

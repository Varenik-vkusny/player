/**
 * Панель стилей проекта и пометка «отличается от стиля» в секции «Вид»
 * (схема v12, ADR-029).
 *
 * Каждый тест нажимает по ВИДИМОЙ кнопке, а не подставляет патч в состояние
 * в обход интерфейса — тот же довод, что у `e2e/style.spec.ts`: проверка
 * «вызвался ли обработчик» была бы зелёной при неподключённой кнопке.
 *
 * «Применил стиль — вид совпал» тестом здесь не является: такая проверка
 * верна при ЛЮБОЙ реализации применения, в том числе при разовом
 * копировании значений. Различает живую связь и штамп только правка ПОСЛЕ
 * применения — на этом построен первый тест (см. `e2e/styles.spec.ts`,
 * который проверяет ровно это на живом рендере плеера/предпросмотра;
 * здесь — то же самое, но через интерфейс редактора).
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function computedOf(
  page: Page,
  id: string,
  property: 'fontSize' | 'backgroundColor' | 'color',
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

/** Открывает панель «Объект» (полный состав свойств) для уже выделенного элемента. */
async function openObjectPanel(page: Page): Promise<void> {
  await page.getByTestId('propbar-more').click();
  await expect(page.getByTestId('inspector').getByText('Вид', { exact: true })).toBeVisible();
}

test.describe('секция «Вид»: пометка «отличается от стиля»', () => {
  test('у непотревоженного title пометки нет, у отцепленного по кеглю sub — есть', async ({ page }) => {
    await openEditor(page, 'styles');

    await page.getByTestId('element-row-title').click();
    await expect(page.getByTestId('selection-readout')).toContainText('title');
    await openObjectPanel(page);

    await expect(page.getByTestId('style-detached-font-size')).toHaveCount(0);

    await page.getByTestId('element-row-sub').click();
    await expect(page.getByTestId('selection-readout')).toContainText('sub');

    await expect(page.getByTestId('style-detached-font-size')).toBeVisible();
    // Отцепление ПО СВОЙСТВУ: цвет sub не трогал руками, у него пометки нет.
    await expect(page.getByTestId('style-detached-color')).toHaveCount(0);
  });

  test('«Вернуть как в стиле» убирает пометку и подгоняет кегль sub под title', async ({ page }) => {
    await openEditor(page, 'styles');

    await page.getByTestId('element-row-sub').click();
    await expect(page.getByTestId('selection-readout')).toContainText('sub');
    await openObjectPanel(page);

    // Промежуточная проверка: пометка ОБЯЗАНА существовать до отката —
    // иначе тест остался бы зелёным при полностью отключённой панели.
    await expect(page.getByTestId('style-detached-font-size')).toBeVisible();
    expect(await computedOf(page, 'sub', 'fontSize'), 'до возврата кегль свой, ручной').toBe('48px');
    const titleFontSize = await computedOf(page, 'title', 'fontSize');

    await page.getByTestId('style-revert-font-size').click();

    await expect(page.getByTestId('style-detached-font-size')).toHaveCount(0);
    await expect.poll(() => computedOf(page, 'sub', 'fontSize')).toBe(titleFontSize);
  });
});

test.describe('панель стилей проекта', () => {
  test('список стилей виден, применение стиля меняет вид на сцене', async ({ page }) => {
    await openEditor(page, 'styles');

    await page.getByTestId('rail-styles').click();
    await expect(page.getByTestId('style-item-heading')).toBeVisible();
    await expect(page.getByTestId('style-item-quiet')).toBeVisible();
    await expect(page.getByTestId('style-item-plate')).toBeVisible();

    await page.getByTestId('element-row-note').click();
    await expect(page.getByTestId('selection-readout')).toContainText('note');

    // note идёт по «Тихому» на первом слайде — кегль 40px.
    expect(await computedOf(page, 'note', 'fontSize')).toBe('40px');

    // Стиль чужого типа (plate — shape, note — text) неактивен: применить
    // его нельзя, схема такую ссылку отвергла бы.
    const plateApply = page.getByTestId('style-item-plate').getByRole('button').first();
    await expect(plateApply).toBeDisabled();

    const headingApply = page.getByTestId('style-item-heading').getByRole('button').first();
    await headingApply.click();

    await expect.poll(() => computedOf(page, 'note', 'fontSize')).toBe('96px');
  });

  test('«Сохранить вид как стиль» кладёт новый стиль в проект и переводит источник на него', async ({
    page,
  }) => {
    await openEditor(page, 'styles');

    await page.getByTestId('rail-styles').click();
    await page.getByTestId('element-row-sub').click();
    await expect(page.getByTestId('selection-readout')).toContainText('sub');

    await page.getByLabel('Имя нового стиля').fill('Особый');
    await page.getByTestId('style-save').click();

    // Идентификатор машинный (freeId): первый свободный `style-N` при уже
    // занятых heading/quiet/plate — это style-1, число проверено прогоном.
    const created = page.getByTestId('style-item-style-1');
    await expect(created).toBeVisible();
    await expect(created).toContainText('Особый');
  });

  test('удаление стиля: диалог показывает верное число использований, вид не меняется после удаления', async ({
    page,
  }) => {
    await openEditor(page, 'styles');
    await page.getByTestId('rail-styles').click();

    const before = await computedOf(page, 'plate-1', 'backgroundColor');

    await page.getByTestId('style-remove-plate').click();

    // plate используют 2 состояния (plate-1 на обоих слайдах фикстуры)
    // на 1 элементе — число посчитано `styleUsage` (state/styleLink.ts).
    const usage = page.getByTestId('style-delete-usage');
    await expect(usage).toContainText('2 состояний');
    await expect(usage).toContainText('1 элементах');

    await page.getByTestId('style-delete-confirm').click();

    await expect(page.getByTestId('style-item-plate')).toHaveCount(0);
    const after = await computedOf(page, 'plate-1', 'backgroundColor');
    expect(after, 'вид элемента не должен измениться после удаления стиля').toBe(before);
  });

  test('отмена диалога удаления НЕ трогает стиль', async ({ page }) => {
    await openEditor(page, 'styles');
    await page.getByTestId('rail-styles').click();

    await page.getByTestId('style-remove-quiet').click();
    await expect(page.getByTestId('style-delete-usage')).toBeVisible();

    await page.getByTestId('style-delete-cancel').click();

    await expect(page.getByTestId('style-delete-usage')).toHaveCount(0);
    await expect(page.getByTestId('style-item-quiet')).toBeVisible();
  });
});

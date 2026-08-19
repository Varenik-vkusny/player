/**
 * Сессия 53: правая колонка перестаёт быть плоским списком.
 *
 * Два несущих теста:
 *
 * 1. Кнопка «Удалить» элементов переехала из одинокой строки над списком
 *    в заголовок секции «Элементы» (`Section` → `action`) — она обязана
 *    стоять В ОДНОЙ СТРОКЕ с названием списка, на который действует, а не
 *    висеть отдельно сверху. Проверяется геометрией (центр по Y), а не
 *    наличием в DOM: наличие осталось бы зелёным и при отдельной строке.
 *
 * 2. Погашенная кнопка удаления слайда — теперь значок (IconButton), а не
 *    текст. Значок обязан остаться видимым и называть причину гашения
 *    в `title`, иначе автор увидит непонятную серую кнопку без объяснения.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test('кнопка удаления стоит в заголовке того списка, на который действует', async ({ page }) => {
  await openEditor(page, 'demo');

  // Заголовок секции «Элементы» — h2.ed-insp-title внутри .ed-elements.
  const title = page.locator('.ed-elements .ed-insp-title');
  await expect(title).toBeVisible();

  // Кнопка удаления выделенных элементов: та же, что раньше стояла в
  // одинокой div.ed-delete-row. Ищем по имени внутри заголовка секции.
  const deleteButton = title.getByRole('button', { name: 'Удалить', exact: true });
  await expect(deleteButton).toBeVisible();

  const titleBox = await title.boundingBox();
  const buttonBox = await deleteButton.boundingBox();
  if (!titleBox || !buttonBox) throw new Error('заголовок или кнопка не имеют геометрии');

  // Что должно сломаться: вернуть кнопку в отдельную div.ed-delete-row НАД
  // списком — тогда центр кнопки по Y уйдёт далеко вверх от центра строки
  // заголовка, и разница превысит допуск в несколько px.
  const titleCenterY = titleBox.y + titleBox.height / 2;
  const buttonCenterY = buttonBox.y + buttonBox.height / 2;
  expect(Math.abs(titleCenterY - buttonCenterY)).toBeLessThanOrEqual(4);
});

test('погашенная кнопка удаления слайда называет причину', async ({ page }) => {
  await openEditor(page, 'demo');

  // Первый слайд — единственный/первый, поэтому удаление недоступно
  // (state/slides.ts, cutProblem). Кнопка обязана остаться ВИДИМОЙ, а не
  // пропасть или спрятать причину: значок без title — гашение без
  // объяснения.
  const firstSlideId = await page.evaluate(
    () =>
      (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
        .__project.segments[0]!.slides[0]!.id,
  );
  const removeButton = page.getByTestId(`slide-remove-${firstSlideId}`);
  await expect(removeButton).toBeVisible();
  await expect(removeButton).toBeDisabled();

  // Что должно сломаться: перевод на значок без переноса `reason` в
  // IconButton — title остался бы равен label («Удалить слайд») и не
  // называл бы причину гашения вообще.
  await expect(removeButton).toHaveAttribute('title', 'Нельзя удалить первый или единственный слайд');
});

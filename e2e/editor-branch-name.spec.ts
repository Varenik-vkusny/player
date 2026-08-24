/**
 * Имя главы, которого НА ПЛИТКЕ НЕТ, достаётся целиком — подсказкой
 * и карточкой описания.
 *
 * ПЕРЕНАЦЕЛЕН 25.08.2026. Прежде файл охранял ярлык ВЕТКИ: имя ветки было
 * заголовком её первой главы, ярлык шириной 180 px его обрезал, и полное
 * имя нигде не читалось. Обе посылки изменились по слову владельца:
 *
 *   • имя ветки теперь не заголовок главы, а ОТВЕТ, который в неё ведёт;
 *   • на плитке главы текста нет вовсе — только номер.
 *
 * От этого гарантия не ослабла, а стала нужнее: раньше имя было обрезано,
 * теперь его на плитке нет СОВСЕМ. Значит достать его полностью обязано
 * быть где-то ещё, и «где-то ещё» — ровно два места: подсказка плитки
 * и карточка по правой кнопке. Оба и проверяются.
 *
 * Ожидаемое взято ИЗ ДРУГОГО ИСТОЧНИКА, чем полученное: ожидаемое — строка
 * `LONG_NAME`, которую тест сам вписал в поле переименования; полученное —
 * атрибут `title` и текст карточки, прочитанные из DOM.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

const LONG_NAME =
  'Заведомо длинное имя ветки, придуманное для проверки обрезки и подсказки title у ярлыка';

/**
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: убрать `title={row.name}`
 * со `span.ed-branch-title` в `BranchesView.tsx` (или положить туда обрезанный
 * текст вместо полного).
 *
 * Положительный контроль ОБЯЗАТЕЛЕН здесь дважды:
 *  1) переименование действительно доехало (иначе «не обрезано» и «сломано»
 *     неотличимы — если бы правка имени не сработала, `title` остался бы
 *     от старого короткого имени и тоже НЕ был бы обрезан визуально);
 *  2) `scrollWidth > clientWidth` — обрезка на экране РЕАЛЬНО есть, а не
 *     подразумевается по длине строки.
 *
 * Ожидаемое ВЗЯТО ИЗ ДРУГОГО ИСТОЧНИКА, чем полученное: ожидаемое — строка
 * `LONG_NAME`, которую тест сам вписал в поле переименования; полученное —
 * атрибут `title`, прочитанный из DOM. Сравнение `title` с `textContent`
 * того же узла здесь НЕ используется намеренно — оба они выставляет один
 * и тот же код, и такое сравнение было бы зелёным даже при обрезанном
 * `textContent` (React отрисовал бы обрезанный текст И такой же обрезанный
 * `title` одной и той же неисправной строкой).
 */
test('имя главы, скрытое с плитки, читается целиком подсказкой и карточкой', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openEditor(page, 'repeat');
  await page.getByTestId('view-branches').click();
  await expect(page.getByTestId('branches-view')).toBeVisible();

  await expect(page.getByTestId('branch-row-s-end')).toBeVisible();
  await page.getByTestId('chapter-pick-s-end').dblclick();

  const input = page.getByTestId('chapter-rename-s-end');
  await expect(input, 'двойной щелчок обязан открыть правку имени').toBeVisible();
  await input.fill(LONG_NAME);
  await input.press('Enter');

  // Положительный контроль: переименование ДОЕХАЛО до проекта. Без него
  // «имя не показано» и «имя не сохранилось» выглядели бы одинаково.
  const saved = await page.evaluate(
    () => (window as unknown as { __project: { segments: { id: string; title: string }[] } })
      .__project.segments.find((segment) => segment.id === 's-end')?.title,
  );
  expect(saved, 'переименование не доехало до проекта').toBe(LONG_NAME);

  const pick = page.getByTestId('chapter-pick-s-end');

  // 1. На плитке имени НЕТ — только номер. Это и есть та тишина, ради
  // которой имя убрали: длинная строка на узкой плитке давала обломок.
  const shown = (await pick.textContent())!.trim();
  expect(
    shown,
    `на плитке напечатано «${shown}» — там обязан быть только номер главы`,
  ).toMatch(/^\d+$/);

  // 2. Подсказка плитки несёт полное имя.
  const tileTitle = await pick.getAttribute('title');
  expect(tileTitle, 'у плитки нет атрибута title вовсе').not.toBeNull();
  expect(
    tileTitle,
    `подсказка плитки не содержит полного имени: «${tileTitle}»`,
  ).toContain(LONG_NAME);

  // 3. Карточка по правой кнопке показывает имя целиком, а не обрезком.
  await pick.click({ button: 'right' });
  const cardTitle = page.getByTestId('chapter-card-title');
  await expect(cardTitle, 'правая кнопка не открыла карточку главы').toBeVisible();
  await expect(cardTitle, 'в карточке имя главы не полное').toHaveText(LONG_NAME);

  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
});

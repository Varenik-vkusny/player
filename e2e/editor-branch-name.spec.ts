/**
 * Имя ВЕТКИ в виде «Ветки» можно прочитать целиком, даже когда оно обрезано
 * (Сессия 48, задача A).
 *
 * ⚠️ План сессии ошибался: у плиток глав (`.ed-chapter-pick`) атрибут
 * `title` уже стоит с Сессии 43 — там всё в порядке, и этот файл их
 * не трогает. Сломан именно ЯРЛЫК ВЕТКИ: `<span className="ed-branch-title">`
 * в `packages/editor/src/track/BranchesView.tsx`. У него в `styles.ts`
 * `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, ширина
 * ограничена `NAME_WIDTH = 180` px, а атрибута `title` не было ни у него,
 * ни у родителя.
 *
 * Имя ветки — это имя её первой главы (`branchTree.ts`: «"Основная" у
 * корневой; иначе — имя первой главы полосы»), и меняет его автор ТЕМ ЖЕ
 * двойным щелчком по плитке первой главы, каким переименовывает саму главу.
 * То есть путь до дефекта — обычная работа автора, а не редкий случай.
 *
 * Фикстура `repeat`: корневая полоса `s-a` (имя всегда «Основная», не зависит
 * от заголовка) → дочерняя полоса `s-end`, чьё имя — заголовок её единственной
 * главы «Конец объяснения». Переименовываем именно ЭТУ главу — только у
 * дочерней полосы имя вообще меняется от переименования главы.
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
test('обрезанное имя ветки читается целиком через title', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await openEditor(page, 'repeat');
  await page.getByTestId('view-branches').click();
  await expect(page.getByTestId('branches-view')).toBeVisible();

  // Дочерняя полоса `s-end`: её имя — заголовок её же единственной главы.
  await expect(page.getByTestId('branch-row-s-end')).toBeVisible();
  await page.getByTestId('chapter-pick-s-end').dblclick();

  const input = page.getByTestId('chapter-rename-s-end');
  await expect(input, 'двойной щелчок обязан открыть правку имени').toBeVisible();
  await input.fill(LONG_NAME);
  await input.press('Enter');

  // Переименование доехало до плитки главы — положительный контроль (1).
  // Имя — из своего узла: впереди него на плитке стоит номер главы
  // (`ed-chapter-order`, правка 24.08.2026), и текст кнопки целиком
  // начинался бы с цифры.
  await expect(page.getByTestId('chapter-pick-s-end').locator('.ed-chapter-name'))
    .toHaveText(LONG_NAME);

  const titleSpan = page.getByTestId('branch-title-s-end');
  await expect(titleSpan).toBeVisible();

  const box = await titleSpan.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
  }));
  // Положительный контроль (2): обрезка на экране действительно есть.
  expect(
    box.scrollWidth,
    `имя не обрезано на экране: scrollWidth ${box.scrollWidth} <= clientWidth ${box.clientWidth} — `
      + 'проверять читаемость обрезанного текста не на чем',
  ).toBeGreaterThan(box.clientWidth);

  const domTitle = await titleSpan.getAttribute('title');
  expect(domTitle, 'у ярлыка ветки нет атрибута title вовсе').not.toBeNull();
  expect(domTitle, 'title содержит не то полное имя, которое было вписано').toBe(LONG_NAME);

  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
});

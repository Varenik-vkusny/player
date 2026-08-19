/**
 * Свой облик закрытого состояния у списка выбора (`ChoiceField`).
 *
 * Родной `<select>` рисует стрелку средствами системы — самый заметный
 * дефолтный html на экране. Своё выпадающее меню целиком отвергнуто по цене
 * поведения: родной `<select>` бесплатно даёт ход по списку с клавиатуры,
 * закрытие по щелчку мимо, чтение с экрана и поведение на телефоне, а своё
 * меню обязано было бы всё это ВОСПРОИЗВЕСТИ — забытая мелочь молча отняла
 * бы орган у тех, кто не пользуется мышью. Поэтому решение: закрытое
 * состояние своё (`.ed-select-wrap` + `Icon` поверх), список остаётся
 * узлом `<select>`.
 *
 * Мишень — «Метка привязана» в панели гейта (`MarkPanel.tsx`): это
 * `ChoiceField` без собственного `testId`, но обёрнутый узнаваемым
 * `data-testid="mark-time"`, и он не зависит от веток/переменных проекта —
 * достаточно выделить существующий гейт демо-фикстуры.
 */
import { expect, test, type Page } from '@playwright/test';

async function openMarkPanel(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.getByTestId('mark-gate-gate-choice').click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();

  // Правая колонка прокручивается (2252 px содержимого при видимых 383,
  // измерено в editor-chrome-shot.spec.ts), а «Метка привязана» стоит
  // не в самом верху панели гейта. Без прокрутки координаты стрелки
  // достаются далеко за нижним краем окна, и elementFromPoint честно
  // возвращает null — это гонка теста с версткой, а не находка о продукте.
  await page.getByTestId('mark-time').scrollIntoViewIfNeeded();
}

function markTimeSelect(page: Page) {
  return page.getByTestId('mark-time').locator('select');
}

/**
 * Что должно сломаться, чтобы покраснел: обёртка `.ed-select-wrap` (или её
 * CSS-правило `appearance: none`) пропадает — вычисленный `appearance`
 * возвращается к системному, а своей стрелки в дереве нет вовсе.
 *
 * Сравниваю НЕ величину саму с собой: ожидаемое значение — литерал `'none'`,
 * а не что-то, снятое с того же узла.
 */
test('у списка снята родная стрелка', async ({ page }) => {
  await openMarkPanel(page);
  const select = markTimeSelect(page);
  await expect(select).toBeVisible();

  const computed = await select.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      appearance: style.getPropertyValue('appearance'),
      webkitAppearance: style.getPropertyValue('-webkit-appearance'),
    };
  });
  expect(computed.appearance, `родная стрелка не снята: appearance = «${computed.appearance}»`).toBe(
    'none',
  );
  expect(
    computed.webkitAppearance,
    `родная стрелка не снята: -webkit-appearance = «${computed.webkitAppearance}»`,
  ).toBe('none');

  const chevronSvg = page.locator('[data-testid="mark-time"] .ed-select-wrap svg');
  await expect(chevronSvg, 'своей стрелки нет в обёртке списка').toHaveCount(1);
});

/**
 * НЕСУЩИЙ тест: проверяет достижимость узла в точке стрелки, а не факт
 * вызова обработчика. Проект уже обжигался ровно этим классом дефекта —
 * захват указателя переадресовывал клик, кнопки внутри холста не работали,
 * и ни ошибки, ни предупреждения не было (`pointer-events` у стрелки — та же
 * защита от повторения).
 *
 * Что должно сломаться, чтобы покраснел: `pointer-events: none` у
 * `.ed-select-chevron` пропадает — `elementFromPoint` в её центре вернёт
 * саму стрелку (её `svg`/`span`), а не `<select>` под ней.
 *
 * Ожидаемое значение — литерал `'SELECT'`, полученное — то, что реально
 * отдала точка на экране; это два разных источника, а не один и тот же узел.
 */
test('щелчок в правой части поля открывает список, а не съедается стрелкой', async ({ page }) => {
  await openMarkPanel(page);
  const chevron = page.locator('[data-testid="mark-time"] .ed-select-chevron');
  await expect(chevron).toBeVisible();

  const point = await chevron.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });

  const hit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return { tag: el?.tagName ?? null, cls: el instanceof HTMLElement ? el.className : null };
  }, point);

  expect(
    hit.tag,
    `в точке стрелки достижим «${hit.tag}» (класс «${hit.cls}»), а не <select> — стрелка съедает щелчок`,
  ).toBe('SELECT');
});

/**
 * Список остаётся управляемым только клавиатурой: фокус ставится вызовом
 * `focus()` (не щелчком мыши), значение меняется клавишей, и проверяется
 * НАБЛЮДАЕМОЕ СЛЕДСТВИЕ смены значения — соседнее поле панели переключается
 * с «Слово» на «Секунда» (`MarkTimeBlock` в `MarkPanel.tsx`), а не только
 * `select.value`. Источник ожидаемого — текст подписи другого поля панели,
 * не сам список: сравнение не с самим собой.
 *
 * Что должно сломаться, чтобы покраснел: обёртка/стрелка перехватывают
 * клавиатурный фокус или события списка (например, стрелка без
 * `pointer-events: none` и с ненулевым размером могла бы встать в порядок
 * табуляции и заслонить `<select>` от `focus()`), либо onChange списка
 * перестаёт доходить до `onCommit`.
 */
test('список остаётся управляемым с клавиатуры', async ({ page }) => {
  await openMarkPanel(page);
  const select = markTimeSelect(page);

  // Гейт «gate-choice» демо-фикстуры привязан к слову — стартовое состояние.
  await expect(select).toHaveValue('word');
  await expect(page.getByLabel('Слово', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Секунда', { exact: true })).toHaveCount(0);

  await select.evaluate((node) => node.focus());
  await expect(select).toBeFocused();

  // Choices идут в порядке [seconds, word] (MarkTimeBlock) — «вверх» от
  // текущего word уводит к seconds чисто клавиатурой, без единого клика.
  await select.press('ArrowUp');

  await expect(select).toHaveValue('seconds');
  await expect(
    page.getByLabel('Секунда', { exact: true }),
    'значение сменилось в органе, но наблюдаемое следствие в панели не применилось',
  ).toBeVisible();
  await expect(page.getByLabel('Слово', { exact: true })).toHaveCount(0);
});

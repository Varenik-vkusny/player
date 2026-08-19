/**
 * Полоса свойств сгруппирована (Задача 3 переноса облика).
 *
 * Сессия 48 увела 13 органов за дверь «Ещё…». Оставшиеся стояли одним
 * ровным рядом: шрифт, кегль, начертание, цвет и выравнивание читались
 * как один список без внутреннего смысла. Владелец 18.08.2026 утвердил
 * группировку разделителями: что за буквы · как расставлены · где лежит.
 *
 * ПОЧЕМУ ТЕСТ СМОТРИТ НА ГЕОМЕТРИЮ, А НЕ НА НАЛИЧИЕ УЗЛА: разделитель,
 * добавленный в DOM и не оформленный, — это ноль пикселей на экране,
 * и проверка «узел есть» осталась бы зелёной при полностью не изменившейся
 * на вид полосе. Сессия 49 уже покупала этот класс дважды (подписи полей
 * с scrollWidth 73 при clientWidth 1). Поэтому здесь меряются ширина,
 * видимость и ПОЛОЖЕНИЕ разделителя между конкретными полями.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: убрать разделители из
 * PropBar; поставить их между не теми полями; оставить в DOM, но обнулить
 * ширину или сделать фон прозрачным.
 */
import { test, expect, type Page } from '@playwright/test';

async function openWithTextSelected(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();
  await page.getByTestId('element-row-title').click();
  await expect(page.getByTestId('propbar')).toBeVisible();
}

/** Содержимое полосы в порядке DOM: поля с их подписями и разделители. */
async function readStrip(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector('[data-testid="propbar"]');
    if (!strip) throw new Error('полосы свойств нет');
    return Array.from(strip.children).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const isSep = el.classList.contains('ed-propbar-sep');
      const label = el.querySelector('label');
      return {
        kind: isSep ? 'sep' : el.classList.contains('ed-propbar-field') ? 'field' : 'other',
        label: (label?.textContent ?? '').trim(),
        width: r.width,
        height: r.height,
        bg: cs.backgroundColor,
        visibility: cs.visibility,
      };
    });
  });
}

test.describe('полоса свойств сгруппирована', () => {
  test('между группами стоит ВИДИМЫЙ разделитель', async ({ page }) => {
    await openWithTextSelected(page);
    const items = await readStrip(page);

    const seps = items.filter((i) => i.kind === 'sep');
    expect(
      seps.length,
      `разделителей на полосе нет вовсе; состав: ${items.map((i) => i.kind + (i.label ? `(${i.label})` : '')).join(', ')}`,
    ).toBeGreaterThan(0);

    // Разделитель, невидимый на экране, — не разделитель.
    for (const s of seps) {
      expect(s.width, 'разделитель нулевой ширины').toBeGreaterThan(0);
      expect(s.height, 'разделитель нулевой высоты').toBeGreaterThan(0);
      expect(s.visibility, 'разделитель скрыт').toBe('visible');
      expect(s.bg, 'разделитель прозрачен — на экране его нет').not.toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('разделитель стоит МЕЖДУ группами, а не где попало', async ({ page }) => {
    await openWithTextSelected(page);
    const items = await readStrip(page);

    // У текста полоса несёт пять полей: гарнитура, кегль, начертание, цвет
    // (группа «буквы») и выравнивание (группа «расстановка»). Значит
    // разделитель обязан стоять ровно перед выравниванием.
    const order = items.map((i) => i.kind);
    const labels = items.map((i) => i.label);

    const alignIndex = labels.findIndex((l) => /выравнивание/i.test(l));
    expect(alignIndex, `поля выравнивания на полосе нет; подписи: ${labels.join(' | ')}`).toBeGreaterThan(0);
    expect(
      order[alignIndex - 1],
      `перед «${labels[alignIndex]}» стоит ${order[alignIndex - 1]}, а не разделитель; порядок: ${order.join(', ')}`,
    ).toBe('sep');

    // И НЕ стоит между двумя полями одной группы — иначе «сгруппировано»
    // выполняется формально, разделителями через каждое поле.
    const colorIndex = labels.findIndex((l) => /цвет/i.test(l));
    expect(colorIndex, `поля цвета нет; подписи: ${labels.join(' | ')}`).toBeGreaterThan(-1);
    expect(
      order[colorIndex - 1],
      `внутри группы «буквы» стоит разделитель перед «${labels[colorIndex]}»`,
    ).not.toBe('sep');
  });

  /**
   * Пустая полоса говорит, что делать (Сессия 53).
   *
   * До этой задачи пустое выделение рисовало голый `span.ed-propbar-hint`
   * с текстом «Выделите элементы, чтобы выровнять и разложить» — он называл
   * только органы расположения, уехавшие за дверь в Сессии 48, и молчал
   * про то, что теперь на полосе (поля стиля). Задача заменяет его на общий
   * `EmptyState` (`ui/EmptyState.tsx`) с заголовком и подсказкой.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: вернуть голый
   * `span.ed-propbar-hint` вместо `EmptyState` — тогда `.ed-empty` в строке
   * пропадёт вовсе.
   */
  test('пустая полоса говорит, что делать', async ({ page }) => {
    await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
    await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();

    const empty = page.locator('.ed-propbar-row .ed-empty');
    await expect(empty, 'пустого состояния полосы нет в DOM').toBeVisible();

    const texts = await empty.evaluate((el) =>
      Array.from(el.querySelectorAll('span')).map((s) => (s.textContent ?? '').trim()),
    );
    const [title, hint] = texts;
    expect(title, `заголовок пуст: ${JSON.stringify(texts)}`).toBeTruthy();
    expect(hint, `подсказка пуста: ${JSON.stringify(texts)}`).toBeTruthy();
  });

  /**
   * Дверь названа так же, как панель, в которую ведёт (Сессия 53).
   *
   * Кнопка «Ещё…» переименована в «Объект»: дверь ведёт в панель, чей
   * заголовок по умолчанию — «Объект» (`Editor.tsx`,
   * `title={currentCatalogCategory?.label ?? 'Объект'}`, категория 'object'
   * не входит в `CATALOG_CATEGORIES`). Назвать дверь «Расположение» значило
   * бы соврать: за ней лежит не только блок «Расположение», а полный список
   * свойств объекта.
   *
   * ЭТО НЕСУЩИЙ ТЕСТ — построен на ДВУХ РАЗНЫХ ИСТОЧНИКАХ: подпись кнопки
   * берётся с самой кнопки, заголовок панели — из открытой ПОСЛЕ нажатия
   * панели каталога (`.ed-catalog-title` внутри `[data-testid="catalog"]`).
   * Ни один текст не вписан в тест литералом для сравнения с самим собой —
   * оба взяты из реального DOM.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: вернуть подпись «Ещё…»
   * кнопке (или любую другую, отличную от заголовка открытой панели).
   */
  test('дверь названа так же, как панель, в которую ведёт', async ({ page }) => {
    await openWithTextSelected(page);

    const door = page.getByTestId('propbar-more');
    const doorLabel = (await door.textContent())?.trim() ?? '';
    expect(doorLabel, 'у двери нет подписи').toBeTruthy();

    await door.click();
    const panelTitle = page.locator('[data-testid="catalog"] .ed-catalog-title');
    await expect(panelTitle, 'открытая дверью панель не найдена').toBeVisible();
    const openedTitle = (await panelTitle.textContent())?.trim() ?? '';
    expect(openedTitle, 'у открытой панели нет заголовка').toBeTruthy();

    expect(
      doorLabel,
      `подпись двери «${doorLabel}» не совпадает с заголовком открытой панели «${openedTitle}»`,
    ).toBe(openedTitle);
  });
});

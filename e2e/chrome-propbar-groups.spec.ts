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
   * ПУСТАЯ ПОЛОСА МОЛЧИТ, а пилюля появляется только при выделении.
   *
   * Правило сменилось 20.08.2026 по прямому слову владельца, и прежнее
   * («пустая полоса говорит, что делать») было ЕГО ЖЕ решением сессией
   * раньше — поэтому тест не подгоняется, а переписывается под новое.
   *
   * Замер натуры 19.08.2026: у Канвы при пустом выделении полосы свойств
   * НЕТ ВООБЩЕ — ноль узлов; она всплывает пилюлей над выделенным.
   * Владелец сказал о том же своими словами: непонятная штука наверху,
   * «то ли квадратная, то ли круглая», напрягает.
   *
   * ЧТО ОСТАЁТСЯ И ПОЧЕМУ: сама строка. Её высота постоянна, иначе
   * появление полосы вместе с выделением сдвигало бы холст между двумя
   * кликами двойного щелчка, и второй клик промахивался бы мимо элемента
   * (настоящий дефект, Сессия 29). Строка есть — содержимого в ней нет.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ:
   *   1) вернуть подсказку или заголовок в пустое состояние;
   *   2) начать рисовать пилюлю без выделения;
   *   3) убрать саму строку — тогда высота холста поедет при выделении.
   */
  test('пустая полоса молчит, а пилюля приходит с выделением', async ({ page }) => {
    await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
    await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();

    const row = page.locator('.ed-propbar-row');
    await expect(row, 'строки полосы нет — высота холста поедет при выделении').toHaveCount(1);

    // Пилюли нет, пока ничего не выделено.
    await expect(page.getByTestId('propbar'), 'пилюля показана без выделения').toHaveCount(0);

    // И никакого текста, кроме показаний состояния.
    const words = await row.evaluate((el) => {
      const parts: string[] = [];
      for (const child of Array.from(el.children)) {
        const text = (child.textContent ?? '').trim();
        if (text) parts.push(text);
      }
      return parts;
    });
    expect(
      words.filter((t) => !t.includes('выделено')),
      `пустая полоса что-то говорит: ${JSON.stringify(words)}`,
    ).toEqual([]);

    // Выделяем — пилюля обязана прийти.
    await page.getByTestId('element-row-title').click();
    await expect(page.getByTestId('propbar'), 'пилюля не пришла с выделением').toBeVisible();

    const pill = await page.getByTestId('propbar').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { radius: Number.parseFloat(cs.borderTopLeftRadius), shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    // Пилюля — именно пилюля: скруглённая и приподнятая, а не форма в строке.
    expect(pill.radius, 'у пилюли нет скругления').toBeGreaterThan(8);
    expect(pill.shadow, 'у пилюли нет тени — она сливается со строкой').not.toBe('none');
    expect(pill.bg, 'у пилюли нет своего фона').not.toBe('rgba(0, 0, 0, 0)');
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

/**
 * Буфер обмена элементов: перенос объекта ИЗ ЧАСТИ В ЧАСТЬ (Сессия 33).
 *
 * Юнит-тесты проверяют редьюсер и чистые функции. Здесь проверяется то,
 * чего они увидеть не могут: что сочетание клавиш доходит до редьюсера
 * сквозь таблицу намерений и обработчик окна, что переключение части
 * не роняет буфер, и что автор видит вставленное на сцене.
 *
 * Фикстура `branching` — три части. Перенос внутри одной части ничего
 * не доказал бы: до Сессии 33 копия внутри части уже была (Ctrl+D).
 */
import { expect, test, type Page } from '@playwright/test';
import { openChapters } from './panels.js';

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SegmentView {
  id: string;
  elementIds: string[];
  /** Состояния ПЕРВОГО слайда: id → координаты. */
  states: Record<string, Geometry>;
}

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

/**
 * Части проекта такими, какими их видит сохранение.
 *
 * Фикстуры на диске лежат в СТАРЫХ версиях схемы и мигрируются при загрузке
 * (у `branching.json` `segments` — вовсе не массив). Поэтому геометрия
 * читается из живого `__project`, а не из файла: файл сказал бы неправду
 * правдоподобными числами.
 */
async function segments(page: Page): Promise<SegmentView[]> {
  return page.evaluate(() => {
    const project = (window as unknown as {
      __project: {
        segments: {
          id: string;
          elements: { id: string }[];
          slides: { states: Record<string, { x: number; y: number; width: number; height: number }> }[];
        }[];
      };
    }).__project;
    return project.segments.map((segment) => ({
      id: segment.id,
      elementIds: segment.elements.map((element) => element.id),
      states: segment.slides[0]!.states,
    }));
  });
}

/** Элемент, который ВИДЕН на сцене: по нему можно щёлкнуть мышью. */
async function visibleElementId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const nodes = document.querySelectorAll<HTMLElement>('[data-testid="stage-scene"] [data-id]');
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 2 && rect.height > 2) return node.dataset['id'] ?? null;
    }
    return null;
  });
  if (!id) throw new Error('на сцене нет ни одного видимого элемента — копировать нечего');
  return id;
}

async function clickElement(page: Page, id: string): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(
      `[data-testid="stage-scene"] [data-id="${elementId}"]`,
    );
    if (!node) throw new Error(`нет узла ${elementId} внутри сцены`);
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }, id);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('selection-frame')).toBeVisible();
}

/**
 * Точка внутри сцены, где НЕТ ни одного элемента.
 *
 * Ищется перебором, а не берётся углом сцены: угол на иной фикстуре
 * оказался бы накрыт фоновой плашкой, и тест «меню по пустому месту»
 * молча проверял бы меню по элементу — то есть ничего.
 */
async function emptyStagePoint(page: Page): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(() => {
    const scene = document.querySelector<HTMLElement>('[data-testid="stage-scene"]');
    if (!scene) throw new Error('нет контейнера сцены');
    const area = scene.getBoundingClientRect();
    const boxes = [...document.querySelectorAll<HTMLElement>('[data-testid="stage-scene"] [data-id]')]
      .map((node) => node.getBoundingClientRect());
    for (let x = Math.ceil(area.left) + 1; x < area.right - 1; x += 2) {
      for (let y = Math.ceil(area.top) + 1; y < area.bottom - 1; y += 2) {
        const covered = boxes.some(
          (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
        );
        if (!covered) return { x, y };
      }
    }
    return null;
  });
  if (!point) throw new Error('на сцене нет свободного места: элементы накрыли её целиком');
  return point;
}

test.describe('редактор: буфер обмена элементов', () => {
  test('копия из одной части встаёт в другую на те же координаты', async ({ page }) => {
    const errors = await openEditor(page, 'branching');

    const sourceId = await visibleElementId(page);
    const before = await segments(page);
    const source = before[0]!;
    const sourceState = source.states[sourceId]!;

    await clickElement(page, sourceId);
    await page.keyboard.press('Control+c');

    // Переход во ВТОРУЮ часть — то, чего не умеет Ctrl+D.
    const targetId = before[1]!.id;
    await openChapters(page);
    await page.getByTestId(`segment-${targetId}`).click();
    const targetBefore = (await segments(page)).find((item) => item.id === targetId)!;

    await page.keyboard.press('Control+v');

    const targetAfter = (await segments(page)).find((item) => item.id === targetId)!;
    expect(
      targetAfter.elementIds.length,
      'во второй части не прибавилось объекта — вставка не дошла до редьюсера',
    ).toBe(targetBefore.elementIds.length + 1);

    const addedId = targetAfter.elementIds.find((id) => !targetBefore.elementIds.includes(id))!;
    const placed = targetAfter.states[addedId]!;

    /*
     * Точное равенство координат — несущее свойство. Слом: применить сдвиг
     * `DUPLICATE_OFFSET` безусловно; заголовок встал бы на 40 единиц ниже
     * и правее, и автор доводил бы его руками — то есть ровно так же, как
     * до появления буфера.
     */
    expect(placed.x, 'координата X не совпала: перенос сместил объект').toBe(sourceState.x);
    expect(placed.y, 'координата Y не совпала: перенос сместил объект').toBe(sourceState.y);

    // Объект ВИДЕН на сцене, а не только в модели: зелёная модель при
    // пустом экране — отдельный класс дефекта (грабли С32).
    await expect(page.getByTestId('stage-scene').locator(`[data-id="${addedId}"]`)).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('Ctrl+Z убирает вставленное ОДНИМ нажатием', async ({ page }) => {
    await openEditor(page, 'branching');

    const sourceId = await visibleElementId(page);
    await clickElement(page, sourceId);
    await page.keyboard.press('Control+c');

    const targetId = (await segments(page))[1]!.id;
    await openChapters(page);
    await page.getByTestId(`segment-${targetId}`).click();
    const countBefore = (await segments(page)).find((item) => item.id === targetId)!.elementIds.length;

    await page.keyboard.press('Control+v');

    /*
     * Промежуточная проверка обязательна, и это не перестраховка.
     * Без неё тест ЗЕЛЁН при полностью сломанной вставке: не вставилось
     * ничего, отменять нечего, число совпало с исходным — и он молчит.
     * Поймано сломом 11.08.2026 (журнал §9): убрал ветку `case 'paste'`
     * из обработчика клавиатуры, четыре теста покраснели, а этот нет.
     */
    const countPasted = (await segments(page)).find((item) => item.id === targetId)!.elementIds.length;
    expect(countPasted, 'вставка не сработала — отменять нечего, тест бессмыслен').toBe(countBefore + 1);

    await page.keyboard.press('Control+z');

    const countAfter = (await segments(page)).find((item) => item.id === targetId)!.elementIds.length;
    expect(countAfter, 'одна отмена не убрала вставленное целиком').toBe(countBefore);
  });

  test('Ctrl+X убирает объект из части, а Ctrl+V возвращает его в другой — это перенос', async ({ page }) => {
    await openEditor(page, 'branching');

    const sourceId = await visibleElementId(page);
    await clickElement(page, sourceId);
    await page.keyboard.press('Control+x');

    const afterCut = await segments(page);
    expect(afterCut[0]!.elementIds, 'вырезанный объект остался в исходной части').not.toContain(sourceId);

    const targetId = afterCut[1]!.id;
    await openChapters(page);
    await page.getByTestId(`segment-${targetId}`).click();
    const countBefore = (await segments(page)).find((item) => item.id === targetId)!.elementIds.length;

    await page.keyboard.press('Control+v');

    const countAfter = (await segments(page)).find((item) => item.id === targetId)!.elementIds.length;
    expect(countAfter).toBe(countBefore + 1);
  });

  test('меню правой кнопки по ПУСТОМУ месту холста открывается и предлагает «Вставить»', async ({ page }) => {
    /*
     * До Сессии 33 меню там не открывалось вовсе — предложить было нечего.
     * Слом: вернуть в `handleContextMenu` ранний выход по промаху — меню
     * не появится, и тест покраснеет на первой же строке.
     *
     * Фикстура `two-gates`, а не `branching`: у второй сцену накрывает
     * фоновая плашка во весь холст, и пустого места на ней нет вовсе
     * (проверено прогоном 11.08.2026 — перебор точек не нашёл ни одной).
     * Частей здесь одна, но этому тесту они и не нужны.
     */
    await openEditor(page, 'two-gates');

    const sourceId = await visibleElementId(page);
    await clickElement(page, sourceId);
    await page.keyboard.press('Control+c');

    const empty = await emptyStagePoint(page);
    await page.mouse.click(empty.x, empty.y, { button: 'right' });

    const paste = page.getByRole('menuitem', { name: 'Вставить' });
    await expect(paste).toBeVisible();
    await expect(paste, '«Вставить» погашено, хотя в буфере лежит объект').toBeEnabled();

    // Ходы над объектом там ГАСНУТ, но остаются: выделения нет.
    await expect(page.getByRole('menuitem', { name: 'Дублировать' })).toBeDisabled();
  });

  test('при пустом буфере «Вставить» в меню погашено, а не спрятано', async ({ page }) => {
    // Спрятать значило бы отобрать действие молча: автор решит, что вставки
    // не существует вовсе (грабли С30 §20б).
    await openEditor(page, 'branching');

    // Ctrl+C намеренно НЕ нажимаем: буфер обязан остаться пустым.
    const sourceId = await visibleElementId(page);
    await clickElement(page, sourceId);

    const center = await page.evaluate((id) => {
      const node = document.querySelector<HTMLElement>(`[data-testid="stage-scene"] [data-id="${id}"]`);
      const rect = node!.getBoundingClientRect();
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    }, sourceId);
    await page.mouse.click(center.x, center.y, { button: 'right' });

    await expect(page.getByRole('menuitem', { name: 'Вставить' })).toBeDisabled();
  });
});

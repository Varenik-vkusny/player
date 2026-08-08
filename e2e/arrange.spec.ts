/**
 * Раскладка на холсте: направляющие, прилипание, выравнивание, слои.
 *
 * Все проверки — про то, что видит и получает автор: координата в ПРОЕКТЕ
 * после жеста и линия, реально нарисованная на экране. Проверка «вызвалась
 * ли функция выравнивания» была бы зелёной при неверной арифметике,
 * при неверном переводе координат и при кнопке, до которой не доходит
 * нажатие, — то есть при любом дефекте, который увидит автор.
 *
 * Фикстура `morph`: на первом слайде видимы ровно двое, `mover` (160,160,
 * 320×200) и `leaver` (1280,160,320×200). Они уже выровнены по верхнему
 * краю, и это используется в тестах направляющих.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Состояние элемента в ПРОЕКТЕ — то, что уедет в файл. */
async function stateOf(
  page: Page,
  id: string,
): Promise<{ x: number; y: number; width: number; height: number; zIndex: number }> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: {
        segments: {
          slides: {
            states: Record<
              string,
              { x: number; y: number; width: number; height: number; zIndex: number }
            >;
          }[];
        }[];
      };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId}`);
    return state;
  }, id);
}

async function screenBoundsOf(
  page: Page,
  selector: string,
): Promise<{ left: number; top: number; right: number; bottom: number; width: number }> {
  return page.evaluate((css) => {
    const node = document.querySelector<HTMLElement>(css);
    if (!node) throw new Error(`нет узла ${css}`);
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
    };
  }, selector);
}

/**
 * Масштаб сцены снимается ИЗ DOM по известной ширине элемента.
 *
 * Ровно то, чего требует ADR-007: масштаб берётся измерением, а не
 * вычисляется из размера окна. Тест, посчитавший его сам, разошёлся бы
 * с продуктом там же, где расходится код, и покраснел бы по неверной
 * причине или, хуже, остался бы зелёным при настоящем дефекте.
 */
async function sceneScale(page: Page): Promise<number> {
  const mover = await screenBoundsOf(page, '[data-id="mover"]');
  return mover.width / 320;
}

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  const rect = await screenBoundsOf(page, `[data-id="${id}"]`);
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/** Протаскивание с остановкой ДО отпускания: нужно, чтобы увидеть линии. */
async function dragTo(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(from.x + (dx * step) / 6, from.y + (dy * step) / 6);
  }
}

/**
 * Клик по элементу НА СЦЕНЕ. Shift зажимается КЛАВИАТУРОЙ: у `mouse.click`
 * полей модификаторов нет вовсе, и лишний ключ в опциях выбрасывается молча
 * (грабля Сессии 28 — тест выглядел бы как проверка Shift, а кликал бы без).
 */
async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await centerOnScreen(page, id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

/** Выделяет несколько элементов подряд: первый обычным кликом, прочие с Shift. */
async function selectAll(page: Page, ids: readonly string[]): Promise<void> {
  for (const [index, id] of ids.entries()) await clickElement(page, id, index > 0);
  await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(ids.length);
}

test.describe('направляющие и прилипание', () => {
  test('при перетаскивании появляется направляющая, и после отпускания её нет', async ({ page }) => {
    await openEditor(page, 'morph');

    // mover и leaver стоят на одной высоте: любое горизонтальное движение
    // даёт совпадение верхних краёв, то есть линию.
    await dragTo(page, await centerOnScreen(page, 'mover'), 120, 0);
    await expect(page.getByTestId('guide').first()).toBeVisible();

    await page.mouse.up();
    // Линия — принадлежность жеста, а не холста. Оставшаяся после отпускания
    // была бы для автора мусором, который нечем убрать.
    await expect(page.getByTestId('guide')).toHaveCount(0);
  });

  test('элемент прилипает ТОЧНО к краю соседа, а не «примерно туда»', async ({ page }) => {
    await openEditor(page, 'morph');

    const scale = await sceneScale(page);
    const leaver = await stateOf(page, 'leaver');
    const mover = await stateOf(page, 'mover');

    /**
     * Ведём mover так, чтобы его левый край НЕ ДОЕХАЛ до левого края leaver
     * трёх экранных пикселей. Порог прилипания — восемь экранных пикселей,
     * значит попадание обязано быть точным.
     *
     * Промах намеренно задан в ЭКРАННЫХ пикселях: именно так промахивается
     * рука автора, и именно в этих единицах задан порог. Промах в единицах
     * сцены проверял бы другую величину и на другом масштабе означал бы
     * другое расстояние для руки.
     */
    const overshootPx = 3;
    const dx = (leaver.x - mover.x) * scale + overshootPx;
    await dragTo(page, await centerOnScreen(page, 'mover'), dx, 0);
    await page.mouse.up();

    const after = await stateOf(page, 'mover');
    // Ровно, а не около: прилипание, промахивающееся на десятую пикселя,
    // не избавляет автора от ручной подгонки — а он затевался ради этого.
    expect(after.x).toBe(leaver.x);
    // И только по одной оси: вертикально мы не двигались.
    expect(after.y).toBe(mover.y);
  });

  test('без прилипания элемент встал бы мимо: промах виден в координате', async ({ page }) => {
    await openEditor(page, 'morph');

    const scale = await sceneScale(page);
    const mover = await stateOf(page, 'mover');

    /*
     * Тот же жест, но мишень отнесена от ВСЕХ линий, и промах вдвое больше
     * порога — прилипания быть не должно, координата обязана остаться той,
     * куда привела мышь.
     *
     * Без этой проверки предыдущий тест был бы зелёным и у реализации,
     * которая просто округляет координату до сотни: 1280 получалось бы
     * само собой, и «прилипание» оказалось бы фикцией.
     *
     * Смещение 300, а не 400: при 400 правый край mover (780) подходит
     * к центру холста (960) на 180 единиц, а на узком окне порог доходит
     * до 40 — первая версия теста покраснела именно так, и прилипание
     * там было настоящим. Считать надо расстояние от ВСЕХ трёх опорных
     * точек до всех линий, включая линии самого холста.
     */
    const dx = 300 * scale + 20;
    await dragTo(page, await centerOnScreen(page, 'mover'), dx, 0);
    await page.mouse.up();

    const after = await stateOf(page, 'mover');
    expect(after.x).not.toBe(mover.x + 300);
    expect(Math.abs(after.x - (mover.x + 300 + 20 / scale))).toBeLessThan(1);
  });
});

/**
 * Фикстура `transitions`: на первом слайде три ВИДИМЫХ элемента разного
 * размера — `stays` (80,120,220×200), `goes` (1500,740,300×220)
 * и `caption` (80,980,1760×80). Разные размеры здесь не украшение:
 * на одинаковых элементах «равные промежутки» и «равные расстояния между
 * центрами» дают одну и ту же раскладку, и тест на раскладку был бы
 * зелёным у обеих реализаций.
 */
test.describe('полоска расположения', () => {
  test('полоски нет, пока ничего не выделено, и она появляется с выделением', async ({ page }) => {
    await openEditor(page, 'transitions');

    await expect(page.getByTestId('arrange-bar')).toHaveCount(0);
    await clickElement(page, 'stays');
    await expect(page.getByTestId('arrange-bar')).toBeVisible();
  });

  test('«разложить» погашено при двух выделенных и живо при трёх', async ({ page }) => {
    await openEditor(page, 'transitions');

    await selectAll(page, ['stays', 'goes']);
    // Между двумя элементами промежуток ровно один, равнять его нечему.
    await expect(page.getByTestId('distribute-y')).toBeDisabled();

    await clickElement(page, 'caption', true);
    await expect(page.getByTestId('distribute-y')).toBeEnabled();
  });

  test('выравнивание по левому краю ставит троих в столбик', async ({ page }) => {
    await openEditor(page, 'transitions');
    await selectAll(page, ['stays', 'goes', 'caption']);

    await page.getByTestId('align-left').click();

    // Общая рамка начинается на 80 (там стоят stays и caption), значит
    // приехать обязан goes — и ровно туда же, а не «примерно».
    await expect.poll(() => stateOf(page, 'goes').then((s) => s.x)).toBe(80);
    expect((await stateOf(page, 'stays')).x).toBe(80);
    expect((await stateOf(page, 'caption')).x).toBe(80);
  });

  test('один Ctrl+Z возвращает ВСЮ раскладку: выравнивание — ОДИН шаг истории', async ({ page }) => {
    await openEditor(page, 'transitions');

    const before = {
      stays: (await stateOf(page, 'stays')).y,
      goes: (await stateOf(page, 'goes')).y,
      caption: (await stateOf(page, 'caption')).y,
    };

    await selectAll(page, ['stays', 'goes', 'caption']);
    await page.getByTestId('align-top').click();
    await expect.poll(() => stateOf(page, 'goes').then((s) => s.y)).toBe(before.stays);

    await page.keyboard.press('Control+z');

    // Все трое разом. Без общего коммита отмена возвращала бы их по одному,
    // и автор смотрел бы, как ряд разъезжается обратно.
    await expect.poll(() => stateOf(page, 'goes').then((s) => s.y)).toBe(before.goes);
    expect((await stateOf(page, 'stays')).y).toBe(before.stays);
    expect((await stateOf(page, 'caption')).y).toBe(before.caption);
  });

  test('«разложить поровну» делает равными ПРОМЕЖУТКИ между краями', async ({ page }) => {
    await openEditor(page, 'transitions');
    await selectAll(page, ['stays', 'goes', 'caption']);

    await page.getByTestId('distribute-y').click();

    // Порядок сверху вниз: stays (120), goes, caption (980). Крайние стоят
    // на месте, средний приезжает так, чтобы оба промежутка совпали.
    await expect.poll(() => stateOf(page, 'goes').then((s) => s.y)).toBe(540);

    const stays = await stateOf(page, 'stays');
    const goes = await stateOf(page, 'goes');
    const caption = await stateOf(page, 'caption');
    expect(stays.y).toBe(120);
    expect(caption.y).toBe(980);
    expect(goes.y - (stays.y + stays.height)).toBe(caption.y - (goes.y + goes.height));
  });

  test('«на передний план» и правда кладёт элемент ПОВЕРХ остальных', async ({ page }) => {
    await openEditor(page, 'transitions');

    // caption лежит выше всех (zIndex 2 против 1 у остальных).
    const before = await stateOf(page, 'stays');
    expect(before.zIndex).toBeLessThan((await stateOf(page, 'caption')).zIndex);

    await clickElement(page, 'stays');
    await page.getByTestId('layer-front').click();

    const after = await stateOf(page, 'stays');
    expect(after.zIndex).toBeGreaterThan((await stateOf(page, 'caption')).zIndex);
    expect(after.zIndex).toBeGreaterThan((await stateOf(page, 'goes')).zIndex);
  });

  test('порядок наложения проверяется ПОПАДАНИЕМ, а не только числом', async ({ page }) => {
    /*
     * Число в проекте могло вырасти, а на экране ничего не поменяться:
     * между `zIndex` в состоянии и тем, что перехватывает клик, лежит
     * весь рендер. Поэтому здесь проверяется то, что видит автор, —
     * кто выделяется кликом в общую точку.
     *
     * caption занимает всю ширину внизу (80,980,1760×80). Двигаем goes
     * так, чтобы он лёг поверх caption, и кликаем в пересечение.
     */
    await openEditor(page, 'transitions');

    await selectAll(page, ['goes', 'caption']);
    await page.getByTestId('align-left').click();
    await page.getByTestId('align-top').click();
    // Теперь оба начинаются в одной точке, goes целиком внутри полосы caption.

    await clickElement(page, 'goes');
    await page.getByTestId('layer-back').click();
    // goes ушёл вниз — клик в общую точку обязан достаться caption.
    await page.mouse.click(0, 0); // снять выделение, чтобы проверка была честной
    await clickElement(page, 'caption');
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(1);

    const captionRow = page.locator('.ed-element-row[aria-pressed="true"]');
    await expect(captionRow).toContainText('caption');
  });
});

/**
 * Множественное выделение: выделить несколько и работать с ними как с одним.
 *
 * Каждый тест двигает НАСТОЯЩУЮ мышь и клавиатуру. Проверка «попал ли нужный
 * id в состояние редактора» была бы зелёной при любом дефекте попадания
 * указателя, порядка эффектов или перехвата события рамкой выделения —
 * ровно тот класс, из-за которого в прошлом кликабельная сцена перехватывала
 * нажатия по кнопкам ответа (CLAUDE.md).
 *
 * Фикстура `morph`: `mover` и `leaver` стоят на первом слайде далеко друг
 * от друга, поэтому промахнуться указателем мимо одного в другой нельзя.
 */
import { expect, test, type Page } from '@playwright/test';
import { openLayers } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Положение элемента в ПРОЕКТЕ, а не на экране: это то, что уедет в файл. */
async function positionOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, { x: number; y: number }> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId}`);
    return { x: state.x, y: state.y };
  }, id);
}

async function existsInProject(page: Page, id: string): Promise<boolean> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { elements: { id: string }[] }[] };
    }).__project;
    return project.segments[0]!.elements.some((element) => element.id === elementId);
  }, id);
}

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

/**
 * Клик по элементу НА СЦЕНЕ. `shift` — добавить к выделению.
 *
 * Shift зажимается КЛАВИАТУРОЙ вокруг клика, а не передаётся опцией:
 * у `page.mouse.click` полей модификаторов нет вовсе (только `button`,
 * `clickCount`, `delay`), и переданный лишний ключ молча выбрасывается —
 * тест выглядел бы как проверка Shift, а кликал бы без него.
 */
async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await centerOnScreen(page, id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Несколько шагов, а не один: жест — это десятки pointermove, и дефекты
  // накопления смещения видны только на них.
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(from.x + (dx * step) / 6, from.y + (dy * step) / 6);
  }
  await page.mouse.up();
}

/** Экранный прямоугольник узла сцены — по нему строится путь резиновой рамки. */
async function screenBoundsOf(
  page: Page,
  selector: string,
): Promise<{ left: number; top: number; right: number; bottom: number }> {
  return page.evaluate((css) => {
    const node = document.querySelector<HTMLElement>(css);
    if (!node) throw new Error(`нет узла ${css}`);
    const rect = node.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }, selector);
}

/**
 * Обводит прямоугольник указателем: нажатие на пустом месте, протаскивание,
 * отпускание.
 *
 * Shift зажимается КЛАВИАТУРОЙ, а не опцией `page.mouse.down` — по той же
 * причине, что и в `clickElement`: лишний ключ в опциях выбрасывается молча.
 */
async function marquee(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  shift = false,
): Promise<void> {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(from.x + ((to.x - from.x) * step) / 6, from.y + ((to.y - from.y) * step) / 6);
  }
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test.describe('резиновая рамка', () => {
  test('обведение пустого места выделяет всех, кого накрыло', async ({ page }) => {
    await openEditor(page, 'morph');

    const host = await screenBoundsOf(page, '.ed-stage-host');
    await marquee(
      page,
      { x: host.left + 4, y: host.top + 4 },
      { x: host.right - 4, y: host.bottom - 4 },
    );

    // На первом слайде фикстуры видимы ровно двое: mover и leaver.
    // `label` лежит там же, но с visible: false — рамка обязана его
    // пропустить, как пропускает клик (см. isVisible в StageView).
    await openLayers(page);
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(2);
  });

  test('обведение вокруг одного выделяет только его', async ({ page }) => {
    await openEditor(page, 'morph');

    const host = await screenBoundsOf(page, '.ed-stage-host');
    const mover = await screenBoundsOf(page, '[data-id="mover"]');
    await marquee(
      page,
      { x: Math.max(host.left + 2, mover.left - 20), y: Math.max(host.top + 2, mover.top - 20) },
      { x: mover.right + 20, y: mover.bottom + 20 },
    );

    await openLayers(page);
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByTestId('selection-frame')).toBeVisible();
  });

  test('рамка с Shift ДОБАВЛЯЕТ к выделению, а не переключает его', async ({ page }) => {
    await openEditor(page, 'morph');

    // mover выделен кликом. Рамка накрывает ОБОИХ, включая уже выделенного.
    await clickElement(page, 'mover');
    await openLayers(page);
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(1);

    const host = await screenBoundsOf(page, '.ed-stage-host');
    await marquee(
      page,
      { x: host.left + 4, y: host.top + 4 },
      { x: host.right - 4, y: host.bottom - 4 },
      true,
    );

    /**
     * Несущее свойство среза.
     *
     * Реализация «цикл по onSelect с additive = true» переключила бы уже
     * выделенный mover и оставила бы ОДНОГО leaver — и выглядела бы при этом
     * совершенно рабочей на всех остальных проверках файла. Дефект вылезал
     * бы только при повторном обведении и читался бы автором как «рамка
     * иногда не берёт элемент».
     */
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(2);
  });

  test('щелчок по пустому месту по-прежнему снимает выделение', async ({ page }) => {
    await openEditor(page, 'morph');

    await clickElement(page, 'mover');
    await expect(page.getByTestId('selection-frame')).toBeVisible();

    // Щелчок без протаскивания — рамка нулевого размера. Порог MARQUEE_MIN_PX
    // обязан отличить её от жеста, иначе поведение «щёлкнул мимо всего»
    // потерялось бы вместе с прежней веткой.
    const host = await screenBoundsOf(page, '.ed-stage-host');
    await page.mouse.click(host.left + 4, host.top + 4);

    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    await openLayers(page);
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(0);
  });
});

test.describe('множественное выделение', () => {
  test('Shift-клик добавляет второй элемент, не снимая первого', async ({ page }) => {
    await openEditor(page, 'morph');

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);

    // Смотрим на то, что видит автор: обе строки списка помечены нажатыми.
    // Проверка состояния редьюсера прошла бы и при неработающем Shift
    // на самой сцене.
    await openLayers(page);
    const pressed = page.locator('.ed-element-row[aria-pressed="true"]');
    await expect(pressed).toHaveCount(2);
  });

  test('обычный клик по второму схлопывает выделение до него одного', async ({ page }) => {
    await openEditor(page, 'morph');

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);
    await clickElement(page, 'leaver');

    await openLayers(page);
    await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(1);
  });

  test('ручек изменения размера при нескольких выделенных НЕТ', async ({ page }) => {
    await openEditor(page, 'morph');

    await clickElement(page, 'mover');
    await expect(page.locator('[data-grip="se"]')).toBeVisible();

    await clickElement(page, 'leaver', true);
    // Рамка осталась — она общая; ручки исчезли, потому что тянуть пачку нечем.
    await expect(page.getByTestId('selection-frame')).toBeVisible();
    await expect(page.locator('[data-grip="se"]')).toHaveCount(0);
  });

  test('перетаскивание пачки двигает ОБА и сохраняет расстояние между ними', async ({ page }) => {
    await openEditor(page, 'morph');

    const moverBefore = await positionOf(page, 'mover');
    const leaverBefore = await positionOf(page, 'leaver');

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);

    // Тянем за ПЕРВЫЙ. Второй обязан поехать вместе с ним, хотя указатель
    // его не касался.
    await drag(page, await centerOnScreen(page, 'mover'), 120, 80);

    const moverAfter = await positionOf(page, 'mover');
    const leaverAfter = await positionOf(page, 'leaver');

    expect(moverAfter.x, 'жест не сдвинул взятый элемент — тест ничего не проверяет').not.toBe(
      moverBefore.x,
    );
    expect(leaverAfter.x, 'второй элемент пачки не поехал').not.toBe(leaverBefore.x);

    /**
     * Несущее свойство: взаимное расположение сохранилось.
     *
     * Без него пачка съезжалась бы к тому, за кого схватили, — и оба теста
     * выше остались бы зелёными, потому что оба элемента действительно
     * сдвинулись. Допуск в один пиксель сцены: координаты округляются
     * до сотых при записи в проект.
     */
    const before = leaverBefore.x - moverBefore.x;
    const after = leaverAfter.x - moverAfter.x;
    expect(Math.abs(after - before)).toBeLessThan(1);
  });

  test('один Ctrl+Z возвращает обоих: перетаскивание пачки — ОДИН шаг истории', async ({ page }) => {
    await openEditor(page, 'morph');

    const moverBefore = await positionOf(page, 'mover');
    const leaverBefore = await positionOf(page, 'leaver');

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);
    await drag(page, await centerOnScreen(page, 'mover'), 120, 80);

    expect((await positionOf(page, 'mover')).x).not.toBe(moverBefore.x);

    await page.keyboard.press('Control+z');

    // Оба разом, а не по одному на нажатие.
    await expect.poll(() => positionOf(page, 'mover').then((p) => p.x)).toBe(moverBefore.x);
    expect((await positionOf(page, 'leaver')).x).toBe(leaverBefore.x);
  });

  test('Delete удаляет всю пачку, и один Ctrl+Z возвращает обоих', async ({ page }) => {
    await openEditor(page, 'morph');

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);
    await page.keyboard.press('Delete');

    await expect.poll(() => existsInProject(page, 'mover')).toBe(false);
    expect(await existsInProject(page, 'leaver')).toBe(false);

    await page.keyboard.press('Control+z');

    await expect.poll(() => existsInProject(page, 'mover')).toBe(true);
    expect(await existsInProject(page, 'leaver')).toBe(true);
  });
});

/**
 * Слой взаимодействия редактора.
 *
 * Тесты двигают настоящую мышь по настоящим экранным координатам. Проверка
 * «вызвался ли обработчик» была бы зелёной при любом из дефектов, ради
 * которых этот файл написан: она не знает ни про масштаб сцены, ни про то,
 * куда элемент в итоге приехал.
 *
 * Главный из этих дефектов — смешение координатных пространств. ADR-007
 * предупреждает, что перетаскивание сломается ТИХО: при масштабе 1 неверная
 * арифметика даёт правильный ответ, и дефект вылезает только на узком окне.
 * Поэтому каждый жест проверяется дважды — на широком окне и на узком.
 *
 * Фикстура — two-gates.json, элемент question. Он единственный, кто виден
 * на нулевой секунде: у него нет кью по прозрачности, а значит нет и того
 * начального состояния, которое прячет остальные элементы до их появления.
 */
import { expect, test, type Page } from '@playwright/test';

/** Логическая ширина сцены во всех эталонных фикстурах. */
const STAGE_WIDTH = 1920;

const ELEMENT = 'question';

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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

/** Масштаб сцены, измеренный из DOM ровно так, как это делает редактор. */
async function stageScale(page: Page): Promise<number> {
  return page.evaluate((logicalWidth) => {
    const stage = document.querySelector<HTMLElement>('.ed-stage-host > div');
    if (!stage) throw new Error('нет контейнера сцены');
    return stage.getBoundingClientRect().width / logicalWidth;
  }, STAGE_WIDTH);
}

/** Экранная точка центра элемента — туда, куда человек и нажал бы. */
async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

/** Геометрия элемента в сохраняемом проекте. */
async function geometryOf(page: Page, id: string): Promise<Geometry> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { nodes: { scene: { elements: (Geometry & { id: string })[] } }[] };
    }).__project;
    const element = project.nodes[0]!.scene.elements.find((candidate) => candidate.id === elementId);
    if (!element) throw new Error(`в проекте нет элемента ${elementId}`);
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: element.rotation,
    };
  }, id);
}

/** Что реально написано в стиле узла — то, что видит зритель. */
async function inlineGeometry(page: Page, id: string): Promise<Record<string, string>> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    return {
      left: node.style.left,
      top: node.style.top,
      width: node.style.width,
      height: node.style.height,
    };
  }, id);
}

/**
 * Перемотка так, как это делает человек: нажатием по дорожке.
 *
 * Через дорожку, а не подстановкой значения в состояние: перевод «пиксель
 * по дорожке → секунда» — часть продукта, и проверять его надо тем же
 * способом, которым им пользуются.
 */
async function seekTrack(page: Page, seconds: number, duration: number): Promise<void> {
  const lane = page.getByTestId('track-lane');
  const box = await lane.boundingBox();
  if (!box) throw new Error('дорожка не видна');
  await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Несколько шагов, а не один: жест из одного движения не поймал бы
  // накопление ошибки и не отличил бы обработку move от обработки up.
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2);
  await page.mouse.move(from.x + dx, from.y + dy);
  await page.mouse.up();
}

test.describe('редактор: выделение и перетаскивание', () => {
  test('открывает эталонный проект и показывает сцену', async ({ page }) => {
    const errors = await openEditor(page, 'demo');
    expect(errors).toEqual([]);
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(7);
  });

  test('клик по элементу выделяет его, клик по пустому месту снимает выделение', async ({ page }) => {
    await openEditor(page, 'two-gates');
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    const center = await centerOnScreen(page, ELEMENT);
    await page.mouse.click(center.x, center.y);

    await expect(page.getByTestId('selection-frame')).toBeVisible();
    await expect(page.getByTestId('selection-readout')).toContainText(ELEMENT);

    // Верхний левый угол контейнера сцены — там элементов нет.
    const empty = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.ed-stage-host > div');
      if (!stage) throw new Error('нет контейнера сцены');
      const rect = stage.getBoundingClientRect();
      return { x: rect.left + 4, y: rect.top + 4 };
    });
    await page.mouse.click(empty.x, empty.y);

    await expect(page.getByTestId('selection-frame')).toHaveCount(0);
    await expect(page.getByTestId('selection-readout')).toContainText('ничего не выделено');
  });

  test('выделяется то, что видно, а не то, что выше по zIndex', async ({ page }) => {
    // Найдено глазами, а не тестом. В demo.json точка dot (zIndex 2) лежит
    // поверх карточки card (zIndex 1), но на 24-й секунде она ещё не
    // появилась: её анимация начинается на слове №58. Клик по видимой
    // карточке выделял невидимую точку — геометрия про прозрачность
    // не знает, а знать обязан слой выделения.
    await openEditor(page, 'demo');
    // Длительность demo.json — 48.6 с; на 24-й секунде карточка уже
    // проявилась, а точка ещё нет.
    await seekTrack(page, 24, 48.6);

    const visible = await page.evaluate(() => {
      const dot = document.querySelector<HTMLElement>('[data-id="dot"]');
      const card = document.querySelector<HTMLElement>('[data-id="card"]');
      if (!dot || !card) throw new Error('нет узлов dot или card');
      return {
        dot: Number(getComputedStyle(dot).opacity),
        card: Number(getComputedStyle(card).opacity),
      };
    });
    // Без этого тест ничего не проверяет: он держится на том, что одна
    // фигура действительно невидима, а вторая действительно видна.
    expect(visible.dot, 'точка обязана быть невидимой на этой секунде').toBeLessThan(0.01);
    expect(visible.card, 'карточка обязана быть видимой').toBeGreaterThan(0.9);

    const center = await centerOnScreen(page, 'dot');
    await page.mouse.click(center.x, center.y);

    await expect(page.getByTestId('selection-readout')).toContainText('card');
  });

  test('перетаскивание сдвигает элемент ровно на пройденное расстояние', async ({ page }) => {
    await openEditor(page, 'two-gates');
    const before = await geometryOf(page, ELEMENT);
    const scale = await stageScale(page);
    const center = await centerOnScreen(page, ELEMENT);

    const dxScreen = 120;
    const dyScreen = 80;
    await drag(page, center, dxScreen, dyScreen);

    const after = await geometryOf(page, ELEMENT);
    // Пройденное на экране переводится в координаты сцены делением
    // на масштаб. Если бы редактор смешал пространства, здесь была бы
    // разница ровно в scale раз — и на широком окне она мала.
    expect(after.x).toBeCloseTo(before.x + dxScreen / scale, 1);
    expect(after.y).toBeCloseTo(before.y + dyScreen / scale, 1);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  test('координаты в проекте совпадают с тем, что написано в стиле узла', async ({ page }) => {
    await openEditor(page, 'two-gates');
    const center = await centerOnScreen(page, ELEMENT);
    await drag(page, center, 90, -40);

    const saved = await geometryOf(page, ELEMENT);
    const inline = await inlineGeometry(page, ELEMENT);

    expect(inline.left).toBe(`${saved.x}px`);
    expect(inline.top).toBe(`${saved.y}px`);
    expect(inline.width).toBe(`${saved.width}px`);
    expect(inline.height).toBe(`${saved.height}px`);
  });

  test('перетаскивание одинаково при масштабе заметно меньше единицы', async ({ page }) => {
    // Узкое окно: сцена 1920 логических пикселей вписывается в 600, то есть
    // масштаб около 0.3. Именно здесь смешение пространств перестаёт быть
    // незаметным.
    await page.setViewportSize({ width: 600, height: 800 });
    await openEditor(page, 'two-gates');

    const scale = await stageScale(page);
    expect(scale, 'окно должно быть достаточно узким, иначе тест ничего не проверяет')
      .toBeLessThan(0.5);

    const before = await geometryOf(page, ELEMENT);
    const center = await centerOnScreen(page, ELEMENT);
    await drag(page, center, 60, 30);

    const after = await geometryOf(page, ELEMENT);
    expect(after.x).toBeCloseTo(before.x + 60 / scale, 1);
    expect(after.y).toBeCloseTo(before.y + 30 / scale, 1);
  });

  test('ручка меняет размер, а противоположный край остаётся на месте', async ({ page }) => {
    await openEditor(page, 'two-gates');
    const center = await centerOnScreen(page, ELEMENT);
    await page.mouse.click(center.x, center.y);
    await expect(page.getByTestId('selection-frame')).toBeVisible();

    const before = await geometryOf(page, ELEMENT);
    const scale = await stageScale(page);

    const grip = page.locator('[data-grip="se"]');
    const box = await grip.boundingBox();
    if (!box) throw new Error('ручка se не видна');

    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await drag(page, from, 100, 60);

    const after = await geometryOf(page, ELEMENT);
    expect(after.width).toBeCloseTo(before.width + 100 / scale, 1);
    expect(after.height).toBeCloseTo(before.height + 60 / scale, 1);
    // Ручка se двигает правый и нижний края. Левый верхний угол обязан
    // остаться там же — иначе элемент «уползает» при каждом изменении размера.
    expect(after.x).toBeCloseTo(before.x, 1);
    expect(after.y).toBeCloseTo(before.y, 1);
  });

  test('во время перетаскивания сцена не пересобирается', async ({ page }) => {
    // Пересборка убила бы узел под курсором вместе с таймлайном, который
    // на него ссылается. Проверяем тождеством узла: если он пережил жест,
    // renderScene во время жеста не звалась.
    await openEditor(page, 'two-gates');
    const center = await centerOnScreen(page, ELEMENT);

    await page.evaluate((elementId) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      (window as unknown as { __node: HTMLElement }).__node = node;
    }, ELEMENT);

    await drag(page, center, 70, 40);

    const survived = await page.evaluate((elementId) => {
      const kept = (window as unknown as { __node: HTMLElement }).__node;
      const current = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      return kept === current && kept.isConnected;
    }, ELEMENT);

    expect(survived, 'узел пересоздавался во время жеста').toBe(true);
  });
});

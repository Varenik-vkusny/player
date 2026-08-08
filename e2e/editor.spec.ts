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

/**
 * Геометрия элемента в сохраняемом проекте.
 *
 * Схема v3 разнесла элемент (кто это) и его состояние (где он и как
 * выглядит, `ElementStateSchema`) по разным местам: геометрия живёт
 * в `segments[0].slides[i].states[id]`, а не на самом элементе. Все тесты
 * этого файла открывают сегмент и не переключают слайд, поэтому текущий —
 * всегда первый (`state.currentSlideId` по умолчанию — `firstSlideId`,
 * `state/editorHistory.ts`), то есть `slides[0]`.
 */
async function geometryOf(page: Page, id: string): Promise<Geometry> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, Geometry> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId} на первом слайде`);
    return {
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      rotation: state.rotation,
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
    //
    // Схема v3 разносит «где элемент» (слайд, `state.currentSlideId`) и
    // «звучит ли сейчас дорожка» (`transport.positionSeconds`) — редактор
    // не перематывает сцену кликом по дорожке (StageView строит превью
    // ровно одного `currentSlide`, TrackView.seekToPointer трогает только
    // `transport`, см. `packages/editor/src/track/TrackView.tsx`). Слайд,
    // на котором карточка уже проявилась (`visible: true`), а точка ещё
    // нет, выбирается через панель слайдов — `node-1-slide-8` на 9.2 с,
    // это первый после начала анимации карточки (слово №20) и до начала
    // анимации точки (слово №58, ≈27.7 с). Id устойчив: он выведен из
    // структуры demo.json (кью и их порядка), а не подобран на глаз.
    await openEditor(page, 'demo');
    await page.getByTestId('slide-node-1-slide-8').click();

    // «Видно» на этом слайде значит `visibility`, а не `opacity`: миграция
    // v1→v3 превращает кью «opacity 0→1» в `visible: false→true`
    // (`packages/core/src/migrations.ts`, applyProperty) и оставляет
    // `opacity: 1` — само по себе число ничего не говорит о появлении.
    const visible = await page.evaluate(() => {
      const dot = document.querySelector<HTMLElement>('[data-id="dot"]');
      const card = document.querySelector<HTMLElement>('[data-id="card"]');
      if (!dot || !card) throw new Error('нет узлов dot или card');
      return {
        dot: getComputedStyle(dot).visibility,
        card: getComputedStyle(card).visibility,
      };
    });
    // Без этого тест ничего не проверяет: он держится на том, что одна
    // фигура действительно невидима, а вторая действительно видна.
    expect(visible.dot, 'точка обязана быть невидимой на этом слайде').toBe('hidden');
    expect(visible.card, 'карточка обязана быть видимой').toBe('visible');

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
    /*
     * Пройденное на экране переводится в координаты сцены делением
     * на масштаб. Если бы редактор смешал пространства, здесь была бы
     * разница ровно в scale раз.
     *
     * Допуск — порог прилипания (Сессия 29): жест доводит элемент
     * до ближайшей направляющей, если она ближе восьми экранных пикселей.
     * Точное равенство требовало бы, чтобы прилипания не было вовсе.
     * Дефект, ради которого тест написан, промахивается в разы, а не
     * на восемь пикселей, — так что проверка своё ловит.
     */
    const SNAP_PX = 8;
    const tolerance = SNAP_PX / scale;
    expect(Math.abs(after.x - (before.x + dxScreen / scale))).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(after.y - (before.y + dyScreen / scale))).toBeLessThanOrEqual(tolerance);
    // Размер перетаскивание не трогает вовсе — здесь допуска нет и быть не может.
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

    /**
     * Допуск — РОВНО порог прилипания, переведённый в единицы сцены.
     *
     * С Сессии 29 перетаскивание доводит элемент до ближайшей направляющей,
     * поэтому «дельта ровно 60 / scale» больше не выполняется никогда, когда
     * рядом есть линия. Проверять точное равенство значило бы требовать
     * от продукта отсутствия того, что в нём есть.
     *
     * Смысл теста при этом не ослаб, а усилился, и вот почему. Он охраняет
     * ADR-007 — смешение координатных пространств. Тот дефект выглядит как
     * сдвиг на 60 единиц вместо 1920, то есть промах в ТРИДЦАТЬ раз; допуск
     * в 8 экранных пикселей его не прячет. Зато теперь тест заодно
     * утверждает, что прилипание НЕ двигает элемент дальше своего порога, —
     * этого прежняя проверка не говорила вовсе.
     *
     * Окно 600 px даёт масштаб около 0.03, и восемь экранных пикселей
     * превращаются в сотни единиц сцены. Отсюда допуск и считается через
     * масштаб, а не задаётся числом: числом он был бы верен ровно
     * для одного размера окна.
     */
    const SNAP_PX = 8;
    const tolerance = SNAP_PX / scale;
    const after = await geometryOf(page, ELEMENT);
    expect(
      Math.abs(after.x - (before.x + 60 / scale)),
      'сдвиг по X разошёлся с жестом больше, чем на порог прилипания',
    ).toBeLessThanOrEqual(tolerance);
    expect(
      Math.abs(after.y - (before.y + 30 / scale)),
      'сдвиг по Y разошёлся с жестом больше, чем на порог прилипания',
    ).toBeLessThanOrEqual(tolerance);
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

    // Целые экранные координаты обязательны, а не желательны.
    //
    // `clientX/clientY` у мыши целочисленны всегда, поэтому дробная стартовая
    // точка молча округляется браузером, и жест смещается не ровно на 100 px.
    // В сценические единицы эта ошибка входит делением на масштаб: пока сцена
    // правки занимала всю ширину, масштаб был крупным и ошибка тонула
    // в допуске. С появлением второй сцены (долг §12.5) масштаб стал ≈0.208,
    // и та же ошибка выросла почти впятеро — 0.08 при допуске 0.05.
    //
    // Это артефакт ИЗМЕРЕНИЯ, а не продукта: перевод экранных координат
    // в сценические берёт масштаб из DOM и остаётся точным. Поэтому
    // округляется точка захвата, а не ослабляется утверждение теста.
    const from = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
    await drag(page, from, 100, 60);

    const after = await geometryOf(page, ELEMENT);

    // Допуск считается ОТ МАСШТАБА, а не числом, и это продолжение той же
    // мысли, что абзацем выше: мышь умеет выражать только целый экранный
    // пиксель, а края элемента на экране дробные. Разница между захватом
    // и краем — доли пикселя, и в сценические единицы она входит делением
    // на масштаб: чем мельче сцена, тем крупнее артефакт ИЗМЕРЕНИЯ.
    //
    // В Сессии 18 лента слайдов получила панель действий (+44 px по высоте),
    // и сцена редактора перестала быть ограниченной шириной: масштаб упал
    // с 400/1920 = 0.2083 до 219/1080 = 0.2028. При первом 100 экранных px
    // давали РОВНО 480 сценических единиц, при втором — 493.151, и тот же
    // самый подпиксельный остаток вырос до 1.64 единицы при жёстком
    // допуске 0.05.
    //
    // Поэтому граница — один экранный пиксель, переведённый в сценические
    // единицы. Утверждение при этом НЕ ослаблено: ошибка масштабирования
    // (потерянный делитель, двойной перевод) промахнулась бы на сотни
    // единиц, а не на единицы. Правится то, чем меряют, а не то, что
    // утверждают, — ровно как с округлением точки захвата выше.
    const onePixel = 1 / scale;
    expect(
      Math.abs(after.width - (before.width + 100 / scale)),
      `ширина разошлась больше чем на экранный пиксель: ${after.width} против ${before.width + 100 / scale}`,
    ).toBeLessThan(onePixel);
    expect(
      Math.abs(after.height - (before.height + 60 / scale)),
      `высота разошлась больше чем на экранный пиксель: ${after.height} против ${before.height + 60 / scale}`,
    ).toBeLessThan(onePixel);
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

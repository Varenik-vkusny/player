/**
 * Прилипание при ИЗМЕНЕНИИ РАЗМЕРА (Сессия 33).
 *
 * Юнит-тесты `snapResize` считают чистую арифметику и получают порог готовым
 * числом. Здесь проверяется то, чего они увидеть не могут: что вызывающий
 * переводит порог из ЭКРАННЫХ пикселей в единицы сцены свежим замером
 * масштаба (ADR-007), что жест доходит до модели и что автор видит линию.
 *
 * Главный тест намеренно поставлен на масштабе «Вписать» (около 0.2), и это
 * единственный масштаб, на котором ошибка «забыли поделить на масштаб»
 * ОТЛИЧИМА. На масштабе 1 восемь экранных пикселей и восемь единиц сцены —
 * одно и то же число, то есть неверный код дал бы там верный ответ.
 *
 * Направляющая проверяется ВО ВРЕМЯ жеста, а не после: линия живёт ровно
 * столько, сколько нажата кнопка мыши (`endGesture` гасит её), и проверка
 * после `mouse.up` была бы зелёной при любом поведении.
 *
 * ЧЕГО ЗДЕСЬ НЕТ, и это названо, а не забыто.
 *
 * Проверки на масштабе 300 % нет. Замер 11.08.2026: на первом слайде обеих
 * эталонных фикстур виден РОВНО ОДИН элемент (`two-gates` — `question`,
 * `demo` — `bg`), поэтому единственные линии на слайде — края и середина
 * холста. Ближайшая к правому краю `question` (1560) линия — середина
 * холста (960), до неё 600 единиц сцены; на 300 % это 1800 экранных
 * пикселей при видимом окне холста в 586. Жест физически не помещается
 * в окно. Масштаб 300 % проверен РУКАМИ в браузере, числа — в журнале §7.
 *
 * Проверки повёрнутого элемента нет: задать поворот жестом в тесте нельзя,
 * потому что ручка поворота недостижима (найденный дефект, журнал §6).
 * Ограничение закреплено юнит-тестом со сломом.
 */
import { expect, test, type Page } from '@playwright/test';

const STAGE_WIDTH = 1920;
const ELEMENT = 'question';

/** Тот же порог, что в `StageView`. Держится тестом ниже, не догадкой. */
const SNAP_PX = 8;

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
    const stage = document.querySelector<HTMLElement>('[data-testid="stage-scene"]');
    if (!stage) throw new Error('нет контейнера сцены');
    return stage.getBoundingClientRect().width / logicalWidth;
  }, STAGE_WIDTH);
}

async function geometryOf(page: Page, id: string): Promise<Geometry> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, Geometry> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId} на первом слайде`);
    return { x: state.x, y: state.y, width: state.width, height: state.height, rotation: state.rotation };
  }, id);
}

/**
 * Все опорные точки по оси X, которые видит прилипание: начало, середина
 * и конец каждого ПРОЧЕГО элемента слайда плюс края и середина холста.
 *
 * Список строится по проекту, а не по картинке: цель теста — найти линию,
 * рядом с которой НЕТ других линий, иначе жест прилипнет не к той, и тест
 * покраснеет по причине, не имеющей отношения к продукту.
 */
async function verticalAnchors(page: Page, exceptId: string): Promise<number[]> {
  return page.evaluate(
    ({ elementId, stageWidth }) => {
      const project = (window as unknown as {
        __project: {
          segments: {
            slides: { states: Record<string, { x: number; width: number; visible?: boolean }> }[];
          }[];
        };
      }).__project;
      const states = project.segments[0]!.slides[0]!.states;
      const result: number[] = [0, stageWidth / 2, stageWidth];
      for (const [id, state] of Object.entries(states)) {
        if (id === elementId || state.visible === false) continue;
        result.push(state.x, state.x + state.width / 2, state.x + state.width);
      }
      return result;
    },
    { elementId: exceptId, stageWidth: STAGE_WIDTH },
  );
}

/**
 * Линия, к которой можно тянуть правый край: внутри холста, достаточно
 * далеко от текущего края и одинокая — ближайшая соседняя линия не ближе
 * трёх порогов.
 *
 * Сторона не задана намеренно. На первом слайде `two-gates` виден РОВНО
 * ОДИН элемент (проверено прогоном 11.08.2026: линий всего три — 0, 960
 * и 1920, то есть только холст), и правее правого края элемента одинокой
 * линии не существует вовсе. Сжатие к середине холста — такой же жест
 * изменения размера, как растяжение.
 *
 * Не находится — тест ПАДАЕТ с перечислением всех линий, а не пропускается.
 * Пропущенный тест выглядит в отчёте так же, как пройденный.
 */
function isolatedTarget(anchors: readonly number[], rightEdge: number, thresholdScene: number): number {
  const sorted = [...anchors].sort((a, b) => a - b);
  const candidates = sorted.filter(
    (at) =>
      Math.abs(at - rightEdge) > 4 * thresholdScene
      && at > thresholdScene
      && at < STAGE_WIDTH - thresholdScene,
  );
  for (const candidate of candidates) {
    const crowded = sorted.some(
      (other) => other !== candidate && Math.abs(other - candidate) < 3 * thresholdScene,
    );
    if (!crowded) return candidate;
  }
  throw new Error(
    `Одинокой линии рядом с ${rightEdge} не нашлось. Все линии: ${sorted.join(', ')}; `
      + `порог в единицах сцены ${thresholdScene}`,
  );
}

async function gripCenter(page: Page, grip: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(`[data-grip="${grip}"]`).boundingBox();
  if (!box) throw new Error(`ручка ${grip} не видна`);
  // Целые экранные координаты: `clientX` у мыши целочисленны всегда,
  // и дробная точка захвата молча округляется браузером.
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/**
 * Узел ищется ВНУТРИ сцены, а не по всей странице. Тот же `data-id` несут
 * плитки ленты слайдов: на `two-gates` их пять, и `querySelector` без
 * уточнения вернул бы первый попавшийся. Строгий режим Playwright это
 * поймал (прогон 11.08.2026, «resolved to 6 elements»), а `querySelector`
 * молчал бы и однажды кликнул бы по плитке.
 */
async function selectElement(page: Page): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(
      `[data-testid="stage-scene"] [data-id="${elementId}"]`,
    );
    if (!node) throw new Error(`нет узла ${elementId} внутри сцены`);
    const rect = node.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  }, ELEMENT);
  await page.mouse.click(center.x, center.y);
  await expect(page.getByTestId('selection-frame')).toBeVisible();
}

test.describe('редактор: прилипание при изменении размера', () => {
  test('правый край встаёт РОВНО на линию, левый не двигается, линия видна', async ({ page }) => {
    const errors = await openEditor(page, 'two-gates');
    await selectElement(page);

    const before = await geometryOf(page, ELEMENT);
    const scale = await stageScale(page);
    const thresholdScene = SNAP_PX / scale;

    const anchors = await verticalAnchors(page, ELEMENT);
    const target = isolatedTarget(anchors, before.x + before.width, thresholdScene);

    /*
     * Указатель не доводится до линии на 5 ЭКРАННЫХ пикселей.
     *
     * Это и есть разделяющее число. Порог, переведённый в сцену, равен
     * 8/scale — при «Вписать» это десятки единиц, и недолёт в 5 экранных
     * пикселей (тоже десятки единиц) внутрь порога попадает. Код, забывший
     * поделить на масштаб, считал бы порогом 8 ЕДИНИЦ СЦЕНЫ — то есть
     * примерно полтора экранных пикселя, — и не прилип бы вовсе.
     */
    const shortfallPx = 5;
    expect(shortfallPx, 'недолёт обязан быть внутри порога').toBeLessThan(SNAP_PX);

    const from = await gripCenter(page, 'e');
    const dx = Math.round((target - (before.x + before.width)) * scale) - shortfallPx;

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y);
    await page.mouse.move(from.x + dx, from.y);

    // Линия — ВО ВРЕМЯ жеста: после отпускания её не будет ни при каком коде.
    await expect(page.getByTestId('guide')).toHaveCount(1);

    await page.mouse.up();

    const after = await geometryOf(page, ELEMENT);

    /*
     * Допуск в половину единицы сцены — не слабость проверки, а цена
     * измерения: мышь умеет выразить только целый экранный пиксель, и точка
     * захвата отличается от края на доли пикселя, которые входят в сцену
     * делением на масштаб. Дефект, ради которого тест написан, выглядит
     * иначе: без прилипания край остался бы в 5 экранных пикселях от линии,
     * то есть в 5/scale ≈ 25 единиц.
     */
    expect(
      Math.abs(after.x + after.width - target),
      `правый край не сел на линию ${target}`,
    ).toBeLessThanOrEqual(0.5);

    // Противоположный край — ТОЧНОЕ равенство. Допуска здесь быть не может:
    // край, за который не тянули, обязан остаться там, где стоял.
    expect(after.x, 'левый край сдвинулся, хотя тянули за правый').toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.height).toBe(before.height);

    expect(errors).toEqual([]);
  });

});

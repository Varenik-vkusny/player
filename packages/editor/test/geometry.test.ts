import { describe, expect, it } from 'vitest';

import { boxToScreen, hitTest, stageScale, toScene, toScreen, topmostAt } from '../src/stage/geometry.js';
import type { Box, Layer, Rect } from '../src/stage/geometry.js';

const LOGICAL_WIDTH = 1920;
const LOGICAL_HEIGHT = 1080;

/**
 * Масштабы взяты из спайка S6: ровно на них измерено, что раскладка сцены
 * не едет (docs/research/spikes.md). 0.198 — сцена 1920 на экране 380 px.
 */
const SCALES = [1, 0.5, 0.25, 0.198] as const;

/** Прямоугольник контейнера при заданном масштабе, без летербокса и прокрутки. */
function stageRect(scale: number, left = 0, top = 0): Rect {
  return { left, top, width: LOGICAL_WIDTH * scale, height: LOGICAL_HEIGHT * scale };
}

const SCENE_POINTS = [
  { x: 0, y: 0 },
  { x: 1920, y: 1080 },
  { x: 960, y: 540 },
  { x: 37, y: 911 },
  { x: 1234.5, y: 67.25 },
];

describe('масштаб сцены', () => {
  it.each(SCALES)('на масштабе %s берётся из измеренной ширины', (scale) => {
    expect(stageScale(stageRect(scale), LOGICAL_WIDTH)).toBeCloseTo(scale, 12);
  });

  it('высота прямоугольника на масштаб не влияет: он одинаков по обеим осям', () => {
    const wide = { left: 0, top: 0, width: 960, height: 540 };
    const letterboxed = { left: 0, top: 0, width: 960, height: 10 };
    expect(stageScale(letterboxed, LOGICAL_WIDTH)).toBe(stageScale(wide, LOGICAL_WIDTH));
  });
});

describe('перевод между пространствами', () => {
  it.each(SCALES)('на масштабе %s обратный перевод возвращает ту же точку', (scale) => {
    const rect = stageRect(scale);
    for (const point of SCENE_POINTS) {
      const screen = toScreen(rect, LOGICAL_WIDTH, point);
      const back = toScene(rect, LOGICAL_WIDTH, screen.x, screen.y);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it.each(SCALES)('на масштабе %s экранная точка считается по масштабу, а не по единице', (scale) => {
    const rect = stageRect(scale);
    const screen = toScreen(rect, LOGICAL_WIDTH, { x: 1920, y: 1080 });
    expect(screen.x).toBeCloseTo(1920 * scale, 9);
    expect(screen.y).toBeCloseTo(1080 * scale, 9);
  });

  it('смещение контейнера учитывается: летербокс и прокрутка страницы', () => {
    // Сцена 960×540 внутри окна: сдвинута вправо летербоксом и вниз прокруткой.
    const rect: Rect = { left: 137.5, top: 42.25, width: 960, height: 540 };

    expect(toScene(rect, LOGICAL_WIDTH, 137.5, 42.25)).toEqual({ x: 0, y: 0 });
    expect(toScene(rect, LOGICAL_WIDTH, 137.5 + 480, 42.25 + 270)).toEqual({ x: 960, y: 540 });

    const screen = toScreen(rect, LOGICAL_WIDTH, { x: 1920, y: 1080 });
    expect(screen.x).toBeCloseTo(1097.5, 9);
    expect(screen.y).toBeCloseTo(582.25, 9);
  });

  it('без учёта смещения ответ был бы другим — смещение действительно работает', () => {
    const shifted: Rect = { left: 200, top: 100, width: 960, height: 540 };
    const origin: Rect = { left: 0, top: 0, width: 960, height: 540 };
    expect(toScene(shifted, LOGICAL_WIDTH, 500, 400)).not.toEqual(
      toScene(origin, LOGICAL_WIDTH, 500, 400),
    );
  });

  it('круговой перевод на нецелом масштабе не накапливает ошибку', () => {
    const rect = stageRect(0.198, 13.7, 91.3);
    const start = { x: 1234.5, y: 67.25 };
    let point = start;
    for (let i = 0; i < 1000; i += 1) {
      const screen = toScreen(rect, LOGICAL_WIDTH, point);
      point = toScene(rect, LOGICAL_WIDTH, screen.x, screen.y);
    }
    expect(point.x).toBeCloseTo(start.x, 8);
    expect(point.y).toBeCloseTo(start.y, 8);
  });

  it.each(SCALES)('на масштабе %s экранный прямоугольник бокса совпадает с переводом углов', (scale) => {
    const rect = stageRect(scale, 24, 12);
    const box: Box = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };

    const screen = boxToScreen(rect, LOGICAL_WIDTH, box);
    const topLeft = toScreen(rect, LOGICAL_WIDTH, { x: box.x, y: box.y });
    const bottomRight = toScreen(rect, LOGICAL_WIDTH, {
      x: box.x + box.width,
      y: box.y + box.height,
    });

    expect(screen.left).toBeCloseTo(topLeft.x, 9);
    expect(screen.top).toBeCloseTo(topLeft.y, 9);
    expect(screen.width).toBeCloseTo(bottomRight.x - topLeft.x, 9);
    expect(screen.height).toBeCloseTo(bottomRight.y - topLeft.y, 9);
  });

  it('экранный прямоугольник не закладывает поворот: оверлей крутится сам', () => {
    const rect = stageRect(0.5);
    const base: Box = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };
    const turned: Box = { ...base, rotation: 45 };
    expect(boxToScreen(rect, LOGICAL_WIDTH, turned)).toEqual(boxToScreen(rect, LOGICAL_WIDTH, base));
  });
});

describe('попадание в бокс без поворота', () => {
  const box: Box = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };

  it('точка внутри попадает', () => {
    expect(hitTest(box, { x: 150, y: 80 })).toBe(true);
  });

  it('точка снаружи не попадает', () => {
    expect(hitTest(box, { x: 99, y: 80 })).toBe(false);
    expect(hitTest(box, { x: 150, y: 200 })).toBe(false);
    expect(hitTest(box, { x: 400, y: 80 })).toBe(false);
    expect(hitTest(box, { x: 150, y: 49 })).toBe(false);
  });

  it('точка ровно на границе попадает', () => {
    expect(hitTest(box, { x: 100, y: 50 })).toBe(true);
    expect(hitTest(box, { x: 300, y: 150 })).toBe(true);
    expect(hitTest(box, { x: 100, y: 150 })).toBe(true);
    expect(hitTest(box, { x: 300, y: 50 })).toBe(true);
  });

  it('чуть за границей уже не попадает', () => {
    expect(hitTest(box, { x: 300.001, y: 150 })).toBe(false);
    expect(hitTest(box, { x: 100, y: 150.001 })).toBe(false);
  });
});

describe('попадание в повёрнутый бокс', () => {
  // Бокс 200×100 с центром в (100, 50). На 45° его ограничивающий
  // прямоугольник растягивается до x ∈ [-6.07, 206.07], y ∈ [-56.07, 156.07] —
  // то есть заметно шире самого бокса. Именно в этой разнице аппроксимация
  // и врала бы правдоподобно.
  const box: Box = { x: 0, y: 0, width: 200, height: 100, rotation: 45 };

  it('центр попадает при любом угле', () => {
    expect(hitTest(box, { x: 100, y: 50 })).toBe(true);
    expect(hitTest({ ...box, rotation: 17.5 }, { x: 100, y: 50 })).toBe(true);
    expect(hitTest({ ...box, rotation: -73 }, { x: 100, y: 50 })).toBe(true);
  });

  it('точка внутри ограничивающего прямоугольника, но вне самого бокса, не попадает', () => {
    // (5, 40) лежит внутри НЕповёрнутого прямоугольника и внутри
    // ограничивающего — и всё равно мимо повёрнутого бокса.
    expect(hitTest(box, { x: 5, y: 40 })).toBe(false);
    // (-5, 50) — внутри ограничивающего прямоугольника повёрнутого бокса.
    expect(hitTest(box, { x: -5, y: 50 })).toBe(false);
    // Зеркальный угол.
    expect(hitTest(box, { x: 195, y: 60 })).toBe(false);
    expect(hitTest(box, { x: 205, y: 50 })).toBe(false);
  });

  it('точка вне неповёрнутого прямоугольника, но внутри повёрнутого бокса, попадает', () => {
    expect(hitTest(box, { x: 64, y: -20 })).toBe(true);
    expect(hitTest(box, { x: 136, y: 120 })).toBe(true);
  });

  it('поворот на 360° равносилен отсутствию поворота', () => {
    const straight: Box = { ...box, rotation: 0 };
    const full: Box = { ...box, rotation: 360 };
    for (const point of [
      { x: 5, y: 40 },
      { x: 100, y: 50 },
      { x: 199, y: 99 },
      { x: 201, y: 50 },
    ]) {
      expect(hitTest(full, point)).toBe(hitTest(straight, point));
    }
  });

  it('поворот на 90° переставляет стороны местами', () => {
    // Бокс 200×100 на 90° занимает x ∈ [50, 150], y ∈ [-50, 150].
    const turned: Box = { ...box, rotation: 90 };
    expect(hitTest(turned, { x: 100, y: 140 })).toBe(true);
    expect(hitTest(turned, { x: 160, y: 50 })).toBe(false);
    expect(hitTest(turned, { x: 60, y: -40 })).toBe(true);
  });
});

describe('верхний бокс под точкой', () => {
  const layers: Layer[] = [
    { x: 0, y: 0, width: 200, height: 200, rotation: 0, zIndex: 0 },
    { x: 50, y: 50, width: 100, height: 100, rotation: 0, zIndex: 5 },
    { x: 400, y: 400, width: 50, height: 50, rotation: 0, zIndex: 99 },
  ];

  it('побеждает больший zIndex, а не порядок в массиве', () => {
    expect(topmostAt(layers, { x: 100, y: 100 })).toBe(layers[1]);
  });

  it('вне перекрытия выделяется нижний', () => {
    expect(topmostAt(layers, { x: 10, y: 10 })).toBe(layers[0]);
  });

  it('при равном zIndex побеждает поздний — он и нарисован сверху', () => {
    const first: Layer = { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 3 };
    const second: Layer = { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 3 };
    expect(topmostAt([first, second], { x: 50, y: 50 })).toBe(second);
  });

  it('под точкой пусто — ничего не выделяется', () => {
    expect(topmostAt(layers, { x: 300, y: 300 })).toBeUndefined();
    expect(topmostAt([], { x: 0, y: 0 })).toBeUndefined();
  });

  it('поворот учитывается и здесь', () => {
    const turned: Layer[] = [{ x: 0, y: 0, width: 200, height: 100, rotation: 45, zIndex: 0 }];
    expect(topmostAt(turned, { x: 5, y: 40 })).toBeUndefined();
    expect(topmostAt(turned, { x: 100, y: 50 })).toBe(turned[0]);
  });
});

describe('вырожденные входы падают громко', () => {
  const point = { x: 10, y: 10 };
  const box: Box = { x: 0, y: 0, width: 10, height: 10, rotation: 0 };

  it.each([0, -960, Number.NaN, Number.POSITIVE_INFINITY])(
    'ширина контейнера %s недопустима',
    (width) => {
      const rect: Rect = { left: 0, top: 0, width, height: 540 };
      expect(() => stageScale(rect, LOGICAL_WIDTH)).toThrow(RangeError);
      expect(() => stageScale(rect, LOGICAL_WIDTH)).toThrow(/Измеренная ширина/);
    },
  );

  it.each([0, -1920, Number.NaN, Number.POSITIVE_INFINITY])(
    'логическая ширина %s недопустима',
    (logicalWidth) => {
      expect(() => stageScale(stageRect(1), logicalWidth)).toThrow(RangeError);
      expect(() => stageScale(stageRect(1), logicalWidth)).toThrow(/Логическая ширина/);
    },
  );

  it('вырожденный масштаб не подменяется единицей и не возвращает ноль', () => {
    const rect: Rect = { left: 0, top: 0, width: Number.MIN_VALUE, height: 1 };
    expect(() => stageScale(rect, 1e308)).toThrow(/Нелогичный масштаб/);
  });

  it('переводы не глушат вырожденный вход, а падают на нём', () => {
    const broken: Rect = { left: 0, top: 0, width: 0, height: 0 };
    expect(() => toScene(broken, LOGICAL_WIDTH, 0, 0)).toThrow(RangeError);
    expect(() => toScreen(broken, LOGICAL_WIDTH, point)).toThrow(RangeError);
    expect(() => boxToScreen(broken, LOGICAL_WIDTH, box)).toThrow(RangeError);
    expect(() => toScene(stageRect(1), 0, 0, 0)).toThrow(RangeError);
    expect(() => toScreen(stageRect(1), -1, point)).toThrow(RangeError);
    expect(() => boxToScreen(stageRect(1), Number.NaN, box)).toThrow(RangeError);
  });
});

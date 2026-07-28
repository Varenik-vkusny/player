import { describe, expect, it } from 'vitest';

import { angleTo, centerOf, MIN_SIZE, moveBox, resizeBox, rotateBox } from '../src/stage/transform.js';
import type { ResizeHandle } from '../src/stage/transform.js';
import type { Box, Point } from '../src/stage/geometry.js';

/** Бокс, на котором считаются все ожидания: края 100 / 50 / 300 / 150, центр (200, 100). */
const BASE: Box = { x: 100, y: 50, width: 200, height: 100, rotation: 0 };

const HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Углы для проверки повёрнутого ресайза: прямой, диагональный, отрицательный и нецелый. */
const ROTATIONS = [0, 30, 45, -60, 137.5] as const;

/**
 * Поворот точки вокруг центра — намеренная копия формулы.
 *
 * Тест обязан считать ожидаемое положение независимо от проверяемого кода:
 * позови он `geometry.rotate`, ошибка в знаке угла сошлась бы сама с собой
 * и тест остался бы зелёным.
 */
function spin(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/**
 * Экранное положение угла бокса: центр плюс полуразмеры, повёрнутые вокруг
 * центра. Ровно так браузер и рисует элемент — `applyElement` ставит
 * `transform: rotate()` и не переопределяет `transform-origin`.
 *
 * `sx`/`sy`: −1 — левый/верхний край, +1 — правый/нижний.
 */
function corner(box: Box, sx: -1 | 1, sy: -1 | 1): Point {
  const center: Point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return spin(
    { x: center.x + (sx * box.width) / 2, y: center.y + (sy * box.height) / 2 },
    center,
    box.rotation,
  );
}

/** Углы, которые обязаны остаться на месте при перетаскивании данной ручки. */
const FIXED_CORNERS: Record<ResizeHandle, readonly (readonly [-1 | 1, -1 | 1])[]> = {
  nw: [[1, 1]],
  ne: [[-1, 1]],
  se: [[-1, -1]],
  sw: [[1, -1]],
  // Односторонняя ручка не двигает вторую ось, поэтому неподвижны оба
  // угла противоположной стороны.
  n: [
    [-1, 1],
    [1, 1],
  ],
  s: [
    [-1, -1],
    [1, -1],
  ],
  e: [
    [-1, -1],
    [-1, 1],
  ],
  w: [
    [1, -1],
    [1, 1],
  ],
};

describe('перенос', () => {
  it('двигает на дельту и не трогает размер с поворотом', () => {
    const box: Box = { ...BASE, rotation: 30 };
    expect(moveBox(box, 17, -3)).toEqual({
      x: 117,
      y: 47,
      width: 200,
      height: 100,
      rotation: 30,
    });
  });

  it('отрицательная и дробная дельта работают так же', () => {
    expect(moveBox(BASE, -0.5, 2.25)).toEqual({
      x: 99.5,
      y: 52.25,
      width: 200,
      height: 100,
      rotation: 0,
    });
  });
});

describe('чистота: вход не мутируется, наружу идёт новый объект', () => {
  const box: Box = { ...BASE, rotation: 30 };
  const pointer: Point = { x: 260, y: 120 };

  it('moveBox не трогает исходный бокс', () => {
    const before = { ...box };
    moveBox(box, 17, -3);
    expect(box).toEqual(before);
  });

  it('resizeBox не трогает ни бокс, ни точку указателя', () => {
    const boxBefore = { ...box };
    const pointerBefore = { ...pointer };
    resizeBox(box, 'nw', pointer);
    expect(box).toEqual(boxBefore);
    expect(pointer).toEqual(pointerBefore);
  });

  it('rotateBox не трогает исходный бокс', () => {
    const before = { ...box };
    rotateBox(box, pointer, 15);
    expect(box).toEqual(before);
  });

  it('нулевое движение всё равно даёт новый объект', () => {
    const moved = moveBox(box, 0, 0);
    expect(moved).toEqual(box);
    expect(moved).not.toBe(box);
  });
});

describe('изменение размера без поворота', () => {
  // Точка внутри бокса: любая ручка от неё сжимает, ни одна не упирается
  // в предел, и видно, какие края поехали, а какие остались.
  const pointer: Point = { x: 260, y: 120 };

  const CASES: readonly (readonly [ResizeHandle, Box])[] = [
    ['nw', { x: 260, y: 120, width: 40, height: 30, rotation: 0 }],
    ['n', { x: 100, y: 120, width: 200, height: 30, rotation: 0 }],
    ['ne', { x: 100, y: 120, width: 160, height: 30, rotation: 0 }],
    ['e', { x: 100, y: 50, width: 160, height: 100, rotation: 0 }],
    ['se', { x: 100, y: 50, width: 160, height: 70, rotation: 0 }],
    ['s', { x: 100, y: 50, width: 200, height: 70, rotation: 0 }],
    ['sw', { x: 260, y: 50, width: 40, height: 70, rotation: 0 }],
    ['w', { x: 260, y: 50, width: 40, height: 100, rotation: 0 }],
  ];

  it.each(CASES)('ручка %s двигает ровно свои края', (handle, expected) => {
    expect(resizeBox(BASE, handle, pointer)).toEqual(expected);
  });

  it('односторонняя ручка игнорирует вторую координату указателя', () => {
    // Если бы «e» трогала верх или низ, увод y на тысячи это показал бы.
    expect(resizeBox(BASE, 'e', { x: 260, y: -9999 })).toEqual(resizeBox(BASE, 'e', pointer));
    expect(resizeBox(BASE, 'w', { x: 260, y: 9999 })).toEqual(resizeBox(BASE, 'w', pointer));
    expect(resizeBox(BASE, 'n', { x: -9999, y: 120 })).toEqual(resizeBox(BASE, 'n', pointer));
    expect(resizeBox(BASE, 's', { x: 9999, y: 120 })).toEqual(resizeBox(BASE, 's', pointer));
  });

  it('поворот при изменении размера не меняется', () => {
    for (const rotation of ROTATIONS) {
      expect(resizeBox({ ...BASE, rotation }, 'se', pointer).rotation).toBe(rotation);
    }
  });
});

describe('изменение размера повёрнутого бокса', () => {
  // Произвольные точки сцены: внутри бокса, слева-снизу и справа-сверху
  // далеко за краем. Свойство обязано держаться на любой из них.
  const POINTERS: readonly Point[] = [
    { x: 260, y: 120 },
    { x: 40, y: 300 },
    { x: 500, y: -20 },
  ];

  it.each(ROTATIONS)('на %s° противоположный ручке угол остаётся на месте', (rotation) => {
    const box: Box = { ...BASE, rotation };
    for (const handle of HANDLES) {
      for (const pointer of POINTERS) {
        const next = resizeBox(box, handle, pointer);
        for (const [sx, sy] of FIXED_CORNERS[handle]) {
          const before = corner(box, sx, sy);
          const after = corner(next, sx, sy);
          expect(after.x).toBeCloseTo(before.x, 9);
          expect(after.y).toBeCloseTo(before.y, 9);
        }
      }
    }
  });

  it.each(ROTATIONS)('на %s° перетаскиваемый угол приходит ровно в точку указателя', (rotation) => {
    const box: Box = { ...BASE, rotation };
    const center: Point = { x: 200, y: 100 };
    // Точки заданы в локальной системе бокса и вынесены наружу от него —
    // так ресайз всегда растягивающий и не упирается в предел.
    const cases: readonly (readonly [ResizeHandle, Point, readonly [-1 | 1, -1 | 1]])[] = [
      ['nw', { x: 60, y: 20 }, [-1, -1]],
      ['ne', { x: 340, y: 20 }, [1, -1]],
      ['se', { x: 340, y: 180 }, [1, 1]],
      ['sw', { x: 60, y: 180 }, [-1, 1]],
    ];

    for (const [handle, local, [sx, sy]] of cases) {
      const pointer = spin(local, center, rotation);
      const dragged = corner(resizeBox(box, handle, pointer), sx, sy);
      expect(dragged.x).toBeCloseTo(pointer.x, 9);
      expect(dragged.y).toBeCloseTo(pointer.y, 9);
    }
  });

  it('свойство не бесплатное: наивная правка x/y/width/height угол бы сдвинула', () => {
    const box: Box = { ...BASE, rotation: 45 };
    const pointer: Point = { x: 260, y: 120 };
    const fixed = corner(box, 1, 1);

    // Ровно то, что написал бы человек, не подумавший про центр вращения:
    // левый верхний угол в точку указателя, правый нижний край на месте.
    const naive: Box = {
      ...box,
      x: pointer.x,
      y: pointer.y,
      width: 300 - pointer.x,
      height: 150 - pointer.y,
    };
    const naiveCorner = corner(naive, 1, 1);
    expect(Math.hypot(naiveCorner.x - fixed.x, naiveCorner.y - fixed.y)).toBeGreaterThan(10);

    const properCorner = corner(resizeBox(box, 'nw', pointer), 1, 1);
    expect(properCorner.x).toBeCloseTo(fixed.x, 9);
    expect(properCorner.y).toBeCloseTo(fixed.y, 9);
  });
});

describe('предел сжатия', () => {
  it('протаскивание ручки за противоположный край упирается в предел', () => {
    const next = resizeBox(BASE, 'w', { x: 10_000, y: 100 });
    expect(next.width).toBe(MIN_SIZE);
    // Восточный край неподвижен: западная ручка его не двигает даже тогда,
    // когда её протащили мимо.
    expect(next.x + next.width).toBeCloseTo(300, 9);
    // Вторая ось не тронута вовсе.
    expect(next.y).toBe(50);
    expect(next.height).toBe(100);
  });

  it('переданный предел уважается', () => {
    const next = resizeBox(BASE, 'w', { x: 10_000, y: 100 }, 40);
    expect(next.width).toBe(40);
    expect(next.x).toBeCloseTo(260, 9);
  });

  it('на повёрнутом боксе предел не ломает неподвижный край', () => {
    const box: Box = { ...BASE, rotation: 45 };
    // Далеко за правым краем в ЛОКАЛЬНОЙ системе бокса.
    const pointer = spin({ x: 3000, y: 100 }, { x: 200, y: 100 }, 45);
    const next = resizeBox(box, 'w', pointer);

    expect(next.width).toBeCloseTo(MIN_SIZE, 9);
    for (const [sx, sy] of FIXED_CORNERS.w) {
      expect(corner(next, sx, sy).x).toBeCloseTo(corner(box, sx, sy).x, 9);
      expect(corner(next, sx, sy).y).toBeCloseTo(corner(box, sx, sy).y, 9);
    }
  });

  it('ни одна ручка ни при каком повороте не даёт неположительный размер', () => {
    // Схема (ElementSchema) объявляет width и height как positive():
    // ноль и минус здесь означали бы проект, который больше не загрузится.
    const extremes: readonly Point[] = [
      { x: -5000, y: -5000 },
      { x: 10_000, y: 10_000 },
      { x: -5000, y: 10_000 },
      { x: 200, y: 100 },
    ];
    for (const rotation of ROTATIONS) {
      for (const handle of HANDLES) {
        for (const pointer of extremes) {
          const next = resizeBox({ ...BASE, rotation }, handle, pointer);
          expect(next.width).toBeGreaterThan(0);
          expect(next.height).toBeGreaterThan(0);
          expect(next.width).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
          expect(next.height).toBeGreaterThanOrEqual(MIN_SIZE - 1e-9);
        }
      }
    }
  });
});

describe('центр бокса', () => {
  it('считается из левого верхнего угла и полуразмеров', () => {
    expect(centerOf(BASE)).toEqual({ x: 200, y: 100 });
  });

  it('от поворота не зависит: браузер крутит элемент вокруг его же центра', () => {
    expect(centerOf({ ...BASE, rotation: 137.5 })).toEqual(centerOf(BASE));
  });
});

describe('угол от центра к точке', () => {
  const center: Point = { x: 100, y: 100 };

  it('ноль — направо, дальше по часовой стрелке, как в CSS rotate()', () => {
    expect(angleTo(center, { x: 200, y: 100 })).toBeCloseTo(0, 9);
    expect(angleTo(center, { x: 100, y: 200 })).toBeCloseTo(90, 9);
    expect(angleTo(center, { x: 0, y: 100 })).toBeCloseTo(180, 9);
    expect(angleTo(center, { x: 100, y: 0 })).toBeCloseTo(270, 9);
  });

  it('диагонали', () => {
    expect(angleTo(center, { x: 200, y: 200 })).toBeCloseTo(45, 9);
    expect(angleTo(center, { x: 0, y: 200 })).toBeCloseTo(135, 9);
    expect(angleTo(center, { x: 200, y: 0 })).toBeCloseTo(315, 9);
  });

  it('нормализация в [0, 360): вверх это 270, а не −90', () => {
    for (let deg = -720; deg <= 720; deg += 7) {
      const radians = (deg * Math.PI) / 180;
      const point: Point = {
        x: center.x + 250 * Math.cos(radians),
        y: center.y + 250 * Math.sin(radians),
      };
      const angle = angleTo(center, point);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThan(360);
    }
  });

  it('расстояние до точки на угол не влияет', () => {
    expect(angleTo(center, { x: 101, y: 101 })).toBeCloseTo(angleTo(center, { x: 900, y: 900 }), 9);
  });
});

describe('поворот', () => {
  it('без смещения захвата угол равен направлению на указатель', () => {
    expect(rotateBox(BASE, { x: 400, y: 100 }, 0).rotation).toBeCloseTo(0, 9);
    expect(rotateBox(BASE, { x: 200, y: 300 }, 0).rotation).toBeCloseTo(90, 9);
    expect(rotateBox(BASE, { x: 0, y: 100 }, 0).rotation).toBeCloseTo(180, 9);
  });

  it('поворот не двигает бокс и не меняет его размер', () => {
    const next = rotateBox(BASE, { x: 200, y: 300 }, 0);
    expect(next.x).toBe(BASE.x);
    expect(next.y).toBe(BASE.y);
    expect(next.width).toBe(BASE.width);
    expect(next.height).toBe(BASE.height);
  });

  it('захват не даёт скачка: в первый кадр жеста угол остаётся прежним', () => {
    for (const rotation of [0, 30, 137.5, 200]) {
      const box: Box = { ...BASE, rotation };
      const center = centerOf(box);
      // Курсор в момент захвата смотрит куда угодно, только не туда же,
      // куда повёрнут элемент — в этом и весь смысл grabOffset.
      const grab: Point = { x: center.x + 137, y: center.y - 42 };
      const grabOffset = angleTo(center, grab) - rotation;
      expect(rotateBox(box, grab, grabOffset).rotation).toBeCloseTo(rotation, 9);
    }
  });

  it('без смещения захвата тот же жест дал бы скачок — значит оно работает', () => {
    const box: Box = { ...BASE, rotation: 30 };
    const center = centerOf(box);
    const grab: Point = { x: center.x + 137, y: center.y - 42 };
    expect(rotateBox(box, grab, 0).rotation).not.toBeCloseTo(30, 3);
  });

  it('после захвата угол следует за указателем на ту же дельту', () => {
    const box: Box = { ...BASE, rotation: 30 };
    const center = centerOf(box);
    const grab: Point = { x: center.x + 200, y: center.y };
    const grabOffset = angleTo(center, grab) - box.rotation;

    // Указатель уехал на четверть оборота по часовой стрелке.
    const moved: Point = { x: center.x, y: center.y + 200 };
    expect(rotateBox(box, moved, grabOffset).rotation).toBeCloseTo(120, 9);
  });

  it('угол приводится к [0, 360): −30 и 330 — один и тот же поворот для CSS', () => {
    const box: Box = { ...BASE, rotation: -30 };
    const center = centerOf(box);
    const grab: Point = { x: center.x + 100, y: center.y + 50 };
    const grabOffset = angleTo(center, grab) - box.rotation;
    expect(rotateBox(box, grab, grabOffset).rotation).toBeCloseTo(330, 9);
  });

  it('за полный оборот указателя угол не выходит из [0, 360)', () => {
    const center = centerOf(BASE);
    for (let deg = -720; deg <= 720; deg += 7) {
      const radians = (deg * Math.PI) / 180;
      const pointer: Point = {
        x: center.x + 250 * Math.cos(radians),
        y: center.y + 250 * Math.sin(radians),
      };
      const rotation = rotateBox(BASE, pointer, 123.5).rotation;
      expect(rotation).toBeGreaterThanOrEqual(0);
      expect(rotation).toBeLessThan(360);
    }
  });

  it('указатель ровно в центре не меняет угол: направления нет — нет и новых сведений', () => {
    const box: Box = { ...BASE, rotation: 30 };
    const next = rotateBox(box, centerOf(box), 15);
    expect(next).toEqual(box);
    expect(next).not.toBe(box);
  });
});

describe('вырожденные входы падают громко', () => {
  const pointer: Point = { x: 260, y: 120 };
  const broken = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const;

  it.each(broken)('дельта переноса %s недопустима', (bad) => {
    expect(() => moveBox(BASE, bad, 0)).toThrow(RangeError);
    expect(() => moveBox(BASE, bad, 0)).toThrow(/Сдвиг по x/);
    expect(() => moveBox(BASE, 0, bad)).toThrow(/Сдвиг по y/);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'ширина бокса %s недопустима: схема принимает только positive()',
    (width) => {
      const box: Box = { ...BASE, width };
      expect(() => moveBox(box, 1, 1)).toThrow(RangeError);
      expect(() => moveBox(box, 1, 1)).toThrow(/Ширина бокса/);
      expect(() => resizeBox(box, 'e', pointer)).toThrow(RangeError);
      expect(() => centerOf(box)).toThrow(RangeError);
      expect(() => rotateBox(box, pointer, 0)).toThrow(RangeError);
    },
  );

  it.each([0, -5, Number.NaN, Number.NEGATIVE_INFINITY])('высота бокса %s недопустима', (height) => {
    expect(() => resizeBox({ ...BASE, height }, 'n', pointer)).toThrow(/Высота бокса/);
  });

  it('нефинитные координаты и поворот бокса недопустимы', () => {
    expect(() => moveBox({ ...BASE, x: Number.NaN }, 1, 1)).toThrow(/Координата x бокса/);
    expect(() => moveBox({ ...BASE, y: Number.POSITIVE_INFINITY }, 1, 1)).toThrow(
      /Координата y бокса/,
    );
    expect(() => resizeBox({ ...BASE, rotation: Number.NaN }, 'nw', pointer)).toThrow(
      /Поворот бокса/,
    );
  });

  it('нефинитная точка указателя недопустима', () => {
    expect(() => resizeBox(BASE, 'nw', { x: Number.NaN, y: 0 })).toThrow(/Координата x указателя/);
    expect(() => resizeBox(BASE, 'nw', { x: 0, y: Number.POSITIVE_INFINITY })).toThrow(
      /Координата y указателя/,
    );
    expect(() => rotateBox(BASE, { x: Number.NaN, y: 0 }, 0)).toThrow(RangeError);
    expect(() => angleTo({ x: 0, y: 0 }, { x: 0, y: Number.NaN })).toThrow(/Координата y точки/);
    expect(() => angleTo({ x: Number.NaN, y: 0 }, { x: 0, y: 0 })).toThrow(/Координата x центра/);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'минимальный размер %s недопустим',
    (minSize) => {
      expect(() => resizeBox(BASE, 'nw', pointer, minSize)).toThrow(/Минимальный размер/);
    },
  );

  it('направление от центра к нему самому не определено', () => {
    expect(() => angleTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toThrow(RangeError);
    expect(() => angleTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toThrow(/не определено/);
  });

  it.each(broken)('смещение захвата %s недопустимо', (bad) => {
    expect(() => rotateBox(BASE, pointer, bad)).toThrow(/Смещение захвата/);
  });
});

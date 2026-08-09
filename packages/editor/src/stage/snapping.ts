/**
 * Направляющие и прилипание при перетаскивании.
 *
 * Чистый модуль: ни DOM, ни React, ни состояния. На входе — где сейчас
 * тащат и что ещё лежит на слайде, на выходе — поправка к смещению и линии,
 * которые надо нарисовать. Проверяется в node без jsdom, как и `geometry.ts`.
 *
 * **Направляющие нигде не сохраняются.** Их нет ни в схеме, ни в проекте,
 * ни в состоянии редактора между жестами: линия живёт ровно столько,
 * сколько автор держит кнопку мыши. Это не упрощение — сохранённая
 * направляющая была бы новым понятием модели со своей миграцией
 * (инвариант №7), а нужна она только глазу и только во время жеста.
 *
 * **Прилипание правит ОБЩЕЕ смещение пачки, а не каждый элемент.** Если
 * позволить каждому выделенному прилипнуть к своей линии, три выделенных
 * элемента разъедутся за одно перетаскивание: у каждого своя поправка.
 * Поэтому сюда приходит охватывающий прямоугольник всей пачки
 * (`unionBox`), а поправка возвращается одна на всех — тем же доводом,
 * по которому дельта в `StageView` считается один раз от точки захвата.
 */
import { unionBox, type Box } from './geometry.js';

/** Ось, ВДОЛЬ которой линия не тянется: 'x' — вертикальная линия. */
export type Axis = 'x' | 'y';

export interface Guide {
  readonly axis: Axis;
  /** Координата линии в пространстве сцены. */
  readonly at: number;
  /** Отрезок по другой оси, в пределах которого линию рисовать. */
  readonly from: number;
  readonly to: number;
}

export interface SnapResult {
  /** Поправка к смещению, которую надо ДОБАВИТЬ к сырой дельте жеста. */
  readonly dx: number;
  readonly dy: number;
  readonly guides: readonly Guide[];
}

/**
 * Совпадением считается расхождение меньше этого — в единицах сцены.
 *
 * Не ноль: после прилипания координата получается арифметикой над числами
 * с плавающей точкой, и строгое равенство иногда не выполнялось бы у линии,
 * к которой элемент только что прилип. Тогда автор видел бы прилипание
 * без линии — то есть решил бы, что элемент дёрнулся сам по себе.
 */
const EPSILON = 0.001;

/** Куда можно прилипнуть: координата плюс протяжённость источника по другой оси. */
interface Target {
  readonly at: number;
  readonly min: number;
  readonly max: number;
}

/** Три опорные точки бокса по оси: начало, середина, конец. */
function anchors(box: { x: number; y: number; width: number; height: number }, axis: Axis): readonly number[] {
  return axis === 'x'
    ? [box.x, box.x + box.width / 2, box.x + box.width]
    : [box.y, box.y + box.height / 2, box.y + box.height];
}

function targetsOf(
  boxes: readonly Box[],
  stage: { width: number; height: number },
  axis: Axis,
): readonly Target[] {
  const result: Target[] = [];

  for (const box of boxes) {
    /**
     * Опорные точки берутся у ОХВАТЫВАЮЩЕГО прямоугольника, а не у полей
     * `x`/`y`/`width`/`height`.
     *
     * Повёрнутый элемент выходит за свой неповёрнутый бокс, и автор видит
     * именно эти внешние края. Линия, проведённая по `box.x` повёрнутого
     * элемента, не совпала бы ни с чем видимым — прилипание выглядело бы
     * как промах, причём только на повёрнутых.
     */
    const bounds = unionBox([box])!;
    const across =
      axis === 'x'
        ? { min: bounds.y, max: bounds.y + bounds.height }
        : { min: bounds.x, max: bounds.x + bounds.width };
    for (const at of anchors(bounds, axis)) result.push({ at, ...across });
  }

  // Холст: края и середина. Протяжённость — весь холст, поэтому линия
  // к центру сцены рисуется во всю её высоту (или ширину), как в Канве.
  const full = axis === 'x' ? { min: 0, max: stage.height } : { min: 0, max: stage.width };
  const size = axis === 'x' ? stage.width : stage.height;
  for (const at of [0, size / 2, size]) result.push({ at, ...full });

  return result;
}

/** Поправка по одной оси: ближайшая линия в пределах порога. */
function snapAxis(
  moving: Box,
  targets: readonly Target[],
  threshold: number,
  axis: Axis,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchors(moving, axis)) {
    for (const target of targets) {
      const delta = target.at - anchor;
      const distance = Math.abs(delta);
      // Строгое сравнение: при равных расстояниях побеждает найденный
      // РАНЬШЕ, то есть порядок опорных точек и целей задаёт исход
      // однозначно. Иначе одинаковый жест давал бы разный результат
      // в зависимости от порядка элементов в списке.
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        best = delta;
      }
    }
  }

  return best;
}

/** Все линии, с которыми бокс совпал ПОСЛЕ прилипания. */
function guidesFor(
  moved: Box,
  targets: readonly Target[],
  axis: Axis,
): readonly Guide[] {
  const bounds = unionBox([moved])!;
  const across =
    axis === 'x'
      ? { min: bounds.y, max: bounds.y + bounds.height }
      : { min: bounds.x, max: bounds.x + bounds.width };

  const result: Guide[] = [];
  for (const anchor of anchors(bounds, axis)) {
    for (const target of targets) {
      if (Math.abs(target.at - anchor) > EPSILON) continue;
      // Линия тянется от дальнего края источника до дальнего края того,
      // кого тащат: так видно, ЧТО с чем выровнялось, а не просто «где-то
      // тут линия». Совпавших целей может быть несколько — рисуются все.
      const guide: Guide = {
        axis,
        at: target.at,
        from: Math.min(target.min, across.min),
        to: Math.max(target.max, across.max),
      };
      // Одна и та же линия приходит от разных источников (два элемента,
      // выровненных между собой). Второй раз её рисовать незачем.
      if (!result.some((existing) => Math.abs(existing.at - guide.at) <= EPSILON
        && existing.from === guide.from && existing.to === guide.to)) {
        result.push(guide);
      }
    }
  }
  return result;
}

/**
 * Куда довести пачку и что при этом показать.
 *
 * @param moving   охватывающий прямоугольник пачки в ПРЕДПОЛАГАЕМОМ месте,
 *                 то есть уже сдвинутый сырой дельтой жеста
 * @param others   боксы тех, кто на слайде и НЕ тащится
 * @param stage    размеры холста
 * @param threshold порог в единицах СЦЕНЫ; вызывающий получает его делением
 *                 экранного порога на масштаб сцены — иначе прилипание
 *                 становится вязким на мелком масштабе и незаметным
 *                 на крупном (ADR-007, два координатных пространства)
 */
export function snap(
  moving: Box,
  others: readonly Box[],
  stage: { width: number; height: number },
  threshold: number,
): SnapResult {
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError(`Порог прилипания должен быть неотрицательным числом, получено ${threshold}`);
  }

  const verticalTargets = targetsOf(others, stage, 'x');
  const horizontalTargets = targetsOf(others, stage, 'y');

  // Оси считаются НЕЗАВИСИМО: элемент может прилипнуть по горизонтали
  // и остаться свободным по вертикали. Общая «ближайшая точка» связала бы
  // оси и мешала бы выровнять что-то одно.
  const dx = snapAxis(moving, verticalTargets, threshold, 'x');
  const dy = snapAxis(moving, horizontalTargets, threshold, 'y');

  const moved: Box = { ...moving, x: moving.x + dx, y: moving.y + dy };

  return {
    dx,
    dy,
    guides: [
      ...guidesFor(moved, verticalTargets, 'x'),
      ...guidesFor(moved, horizontalTargets, 'y'),
    ],
  };
}

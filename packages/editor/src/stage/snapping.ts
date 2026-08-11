/**
 * Направляющие и прилипание: при перетаскивании (`snap`) и при изменении
 * размера (`snapResize`).
 *
 * Чистый модуль: ни DOM, ни React, ни состояния. На входе — где сейчас
 * тащат и что ещё лежит на слайде, на выходе — поправка к смещению и линии,
 * которые надо нарисовать. Проверяется в node без jsdom, как и `geometry.ts`.
 *
 * Цели прилипания у обоих жестов ОДНИ (`targetsOf`), а вот опорные точки
 * разные, и поиск ближайшей линии поэтому вынесен в `nearestDelta` — общий
 * на двоих. Второй такой поиск означал бы, что порог однажды начнёт
 * считаться в двух местах по-разному, и заметить это было бы нечем.
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
import { unionBox, type Box, type Point } from './geometry.js';
import { resizeBox, type ResizeHandle } from './transform.js';

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

/**
 * Поправка для набора опорных точек: ближайшая линия в пределах порога.
 *
 * Точки приходят списком, а не боксом, потому что потребителей два и опорные
 * точки у них РАЗНЫЕ. Перетаскивание берёт все три (начало, середина, конец),
 * растягивание — ровно одну, тот край, за который тянут. Свести их к одному
 * боксу нельзя, а завести второй поиск ближайшего значило бы, что порог
 * однажды начнёт считаться в двух местах по-разному.
 */
function nearestDelta(
  anchorValues: readonly number[],
  targets: readonly Target[],
  threshold: number,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchorValues) {
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

/** Поправка по одной оси при перетаскивании: в игре все три опорные точки. */
function snapAxis(
  moving: Box,
  targets: readonly Target[],
  threshold: number,
  axis: Axis,
): number {
  return nearestDelta(anchors(moving, axis), targets, threshold);
}

/** Линии, с которыми совпала хоть одна из переданных опорных точек. */
function guidesAt(
  anchorValues: readonly number[],
  across: { min: number; max: number },
  targets: readonly Target[],
  axis: Axis,
): readonly Guide[] {
  const result: Guide[] = [];
  for (const anchor of anchorValues) {
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

/** Все линии, с которыми бокс совпал ПОСЛЕ прилипания при перетаскивании. */
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

  return guidesAt(anchors(bounds, axis), across, targets, axis);
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

export interface ResizeSnapResult {
  /** Готовый бокс: прилипание уже учтено, `resizeBox` уже применён. */
  readonly box: Box;
  readonly guides: readonly Guide[];
}

/**
 * Куда довести растягиваемый бокс и что при этом показать.
 *
 * **Прилипает УКАЗАТЕЛЬ, а не бокс, и в этом всё устройство функции.**
 * Соблазн взять поправку `snap`, посчитанную для перемещения, и прибавить её
 * к боксу — ошибка, которую не видно в модели: такая поправка двигает бокс
 * целиком, то есть уводит и противоположный ручке край. Автор тянул бы за
 * правый край, а элемент ехал бы вправо неизменной ширины — «изменение
 * размера», которое размер не меняет.
 *
 * `resizeBox` уже устроен так, что противоположный ручке угол неподвижен
 * ПО ПОСТРОЕНИЮ (шаги 2–5 в `transform.ts`). Значит достаточно подвинуть
 * точку указателя до вызова — и неподвижность дальнего края остаётся
 * свойством самой функции, а не ещё одной проверкой, которую можно забыть.
 *
 * **Опорная точка ровно одна на ось — тот край, который тянут.** Ручка `e`
 * двигает правый край, `nw` — левый и верхний. Середину бокса в кандидаты
 * не берём намеренно: при тяге за край она едет вполовину, и её прилипание
 * автор увидел бы как промах мимо линии.
 *
 * **Готовый бокс возвращается отсюда, а не считается вызывающим заново.**
 * `resizeBox` упирает бокс в `minSize`: протащив ручку за противоположный
 * край, автор получает край НЕ там, где указатель. Линии рисуются по
 * фактическому результату — иначе они висели бы там, куда край не доехал.
 * Второй вызов `resizeBox` на стороне вызывающего однажды разошёлся бы
 * с этим по `minSize`, и разошёлся бы молча.
 *
 * @param threshold порог в единицах СЦЕНЫ — как и у `snap`, вызывающий
 *                  получает его делением экранного порога на масштаб
 */
export function snapResize(
  box: Box,
  handle: ResizeHandle,
  pointer: Point,
  others: readonly Box[],
  stage: { width: number; height: number },
  threshold: number,
): ResizeSnapResult {
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError(`Порог прилипания должен быть неотрицательным числом, получено ${threshold}`);
  }

  /**
   * У ПОВЁРНУТОГО элемента прилипания нет, и это физика, а не упрощение.
   *
   * Направляющая вертикальна, а край повёрнутого элемента — нет. Подвинув
   * `pointer.x` к вертикальной линии, мы подвинули бы край, который с этой
   * линией не параллелен: край упёрся бы в неё одним концом и разошёлся
   * другим. Автор увидел бы «прилипло мимо» — хуже, чем не прилипло вовсе.
   * (Внутри `resizeBox` точка ещё и поворачивается в собственную систему
   * бокса, так что поправка, посчитанная в координатах сцены, там означала
   * бы уже не то расстояние, которое мы мерили.)
   */
  if (box.rotation !== 0) {
    return { box: resizeBox(box, handle, pointer), guides: [] };
  }

  const movesLeft = handle.includes('w');
  const movesRight = handle.includes('e');
  const movesTop = handle.includes('n');
  const movesBottom = handle.includes('s');

  const verticalTargets = targetsOf(others, stage, 'x');
  const horizontalTargets = targetsOf(others, stage, 'y');

  // Оси независимы ровно так же, как при перетаскивании: ручка `se` вправе
  // прилипнуть правым краем и остаться свободной по низу.
  const snapped: Point = {
    x: movesLeft || movesRight ? pointer.x + nearestDelta([pointer.x], verticalTargets, threshold) : pointer.x,
    y: movesTop || movesBottom ? pointer.y + nearestDelta([pointer.y], horizontalTargets, threshold) : pointer.y,
  };

  const moved = resizeBox(box, handle, snapped);

  // Линии — по КРАЯМ РЕЗУЛЬТАТА, а не по прилипшей точке (см. шапку про minSize).
  const acrossX = { min: moved.y, max: moved.y + moved.height };
  const acrossY = { min: moved.x, max: moved.x + moved.width };

  const guides: Guide[] = [];
  if (movesLeft || movesRight) {
    const edge = movesLeft ? moved.x : moved.x + moved.width;
    guides.push(...guidesAt([edge], acrossX, verticalTargets, 'x'));
  }
  if (movesTop || movesBottom) {
    const edge = movesTop ? moved.y : moved.y + moved.height;
    guides.push(...guidesAt([edge], acrossY, horizontalTargets, 'y'));
  }

  return { box: moved, guides };
}

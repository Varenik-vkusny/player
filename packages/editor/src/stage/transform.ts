/**
 * Преобразования элемента на сцене редактора: перетаскивание, изменение
 * размера, поворот.
 *
 * Только числа. Ни DOM, ни React, ни состояния жеста здесь нет: вызывающий
 * приносит точку, уже переведённую в координаты сцены (`geometry.toScene`),
 * и получает новый бокс. Смешивать пространства нельзя — это ADR-007 и
 * отдельный закон в CLAUDE.md.
 *
 * Модуль отделён от `geometry.ts` не ради объёма. `geometry` переводит между
 * пространствами сцены и экрана; здесь пространство ровно одно — сцена, — но
 * у повёрнутого бокса есть ещё и собственная, повёрнутая вместе с ним система
 * координат, и вся сложность в переходах между ней и сценой.
 *
 * Почему изменение размера повёрнутого бокса — это не «поправить
 * x/y/width/height». `applyElement` (player/src/render.ts) ставит элементу
 * `transform: rotate(Ndeg)` и не переопределяет `transform-origin`, то есть
 * браузер крутит элемент вокруг его ЦЕНТРА. А центр вычисляется из тех же
 * x/y/width/height. Стоит поменять ширину прямо в координатах сцены — центр
 * уезжает, и вместе с ним уезжает и подкручивается вся картинка: автор тянет
 * за один угол, а ползёт весь элемент. Поэтому границы считаются в локальной
 * системе бокса, а наружу отдаётся повёрнутый обратно центр.
 *
 * Функции чистые: вход не мутируется, наружу всегда новый объект.
 */
import { rotate } from './geometry.js';
import type { Box, Point } from './geometry.js';

/**
 * Ручка изменения размера. Имя перечисляет края, которые она двигает:
 * `nw` — левый и верхний, `e` — только правый. Противоположные края стоят.
 */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/**
 * Предел, ниже которого бокс не сжимается, в координатах сцены.
 *
 * Один логический пиксель. Обоснование снизу: `ElementSchema` объявляет
 * `width` и `height` как `positive()`, значит ноль и отрицательные значения
 * не загрузятся вовсе, и порог обязан быть строго больше нуля. Обоснование
 * сверху: порог «чтобы за ручку было удобно ухватить» зависит от масштаба
 * сцены на экране (на 0.198 пятьдесят пикселей сцены — это десять пикселей
 * под курсором), а масштаб знает вызывающий, не этот модуль. Поэтому по
 * умолчанию здесь стоит минимум допустимого, а не удобство: удобство
 * передаётся аргументом.
 */
export const MIN_SIZE = 1;

/** Сдвиг элемента на дельту в координатах сцены. */
export function moveBox(box: Box, dx: number, dy: number): Box {
  assertBox(box);
  assertFinite(dx, 'Сдвиг по x');
  assertFinite(dy, 'Сдвиг по y');

  // Поворот и размер не участвуют: перенос центра на дельту и перенос левого
  // верхнего угла на ту же дельту — одно и то же движение.
  return { ...box, x: box.x + dx, y: box.y + dy };
}

/**
 * Новый бокс при перетаскивании ручки в точку (координаты сцены).
 *
 * `minSize` — предел, ниже которого бокс не сжимается; протаскивание ручки
 * за противоположный край упирается в него, а не выворачивает бокс наизнанку.
 *
 * Порядок действий продиктован тем, что браузер крутит элемент вокруг центра
 * (см. шапку модуля):
 *
 * 1. точка указателя переводится в локальную систему бокса — поворотом вокруг
 *    текущего центра на `-rotation`;
 * 2. в локальной системе двигаются те края, которые названы ручкой;
 * 3. из краёв получаются новые размеры и новый центр — всё ещё локальный;
 * 4. новый центр поворачивается обратно вокруг СТАРОГО центра на `+rotation`;
 * 5. x и y выводятся из центра и полуразмеров.
 *
 * Отсюда бесплатно следует свойство, ради которого всё это и делается:
 * противоположный ручке угол не сдвигается на экране ни при каком угле
 * поворота. Наивная реализация его нарушает — причём только на повёрнутых
 * элементах, то есть тихо.
 */
export function resizeBox(
  box: Box,
  handle: ResizeHandle,
  pointer: Point,
  minSize: number = MIN_SIZE,
): Box {
  assertBox(box);
  assertPoint(pointer, 'указателя');
  assertPositive(minSize, 'Минимальный размер');

  const center = centerOf(box);

  // Шаг 1. При нулевом повороте локальная система совпадает со сценой —
  // лишний синус здесь только добавил бы дрожь в последних разрядах.
  const local = box.rotation === 0 ? pointer : rotate(pointer, center, -box.rotation);

  // Шаг 2. Каждый край либо приходит из указателя, либо остаётся на месте.
  const movesLeft = handle.includes('w');
  const movesRight = handle.includes('e');
  const movesTop = handle.includes('n');
  const movesBottom = handle.includes('s');

  let left = movesLeft ? local.x : box.x;
  let right = movesRight ? local.x : box.x + box.width;
  let top = movesTop ? local.y : box.y;
  let bottom = movesBottom ? local.y : box.y + box.height;

  // Шаг 3. Упор в minSize двигает только тот край, за который тянут:
  // неподвижный край обязан остаться неподвижным даже когда ручку протащили
  // мимо него. Ось, которой ручка не касается, не трогается вовсе — иначе
  // бокс уже, чем minSize, вырос бы сам по себе при перетаскивании за
  // соседнюю сторону.
  if ((movesLeft || movesRight) && right - left < minSize) {
    if (movesLeft) left = right - minSize;
    else right = left + minSize;
  }
  if ((movesTop || movesBottom) && bottom - top < minSize) {
    if (movesTop) top = bottom - minSize;
    else bottom = top + minSize;
  }

  // Шаг 4. Поворот именно вокруг старого центра: локальная система построена
  // на нём, он и есть неподвижная точка всего преобразования.
  const width = right - left;
  const height = bottom - top;
  const localCenter: Point = { x: (left + right) / 2, y: (top + bottom) / 2 };
  const moved = box.rotation === 0 ? localCenter : rotate(localCenter, center, box.rotation);

  // Шаг 5.
  return { ...box, x: moved.x - width / 2, y: moved.y - height / 2, width, height };
}

/**
 * Угол от центра бокса до точки, градусы.
 *
 * Считается через `Math.atan2(dy, dx)`. Ось Y на экране направлена вниз,
 * поэтому положительное направление обхода — по часовой стрелке, ровно как
 * у CSS `rotate()`: результат кладётся в `rotation` без пересчёта знака.
 *
 * Отсчёт от направления «вправо» (+X) и нормализация в **[0, 360)**:
 * 0° — точка справа от центра, 90° — снизу, 180° — слева, 270° — сверху.
 * Канонический диапазон выбран потому, что угол всё равно берётся по модулю
 * 360 при отрисовке, а без нормализации значение росло бы от жеста к жесту
 * и прыгало бы на 360 при каждом пересечении оси +X.
 *
 * У точки, совпадающей с центром, направления нет. `Math.atan2(0, 0)` вернул
 * бы 0 — правдоподобное число, из-за которого элемент дёрнулся бы в
 * произвольную сторону. Здесь это RangeError.
 */
export function angleTo(center: Point, point: Point): number {
  assertPoint(center, 'центра');
  assertPoint(point, 'точки');

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (dx === 0 && dy === 0) {
    throw new RangeError('Направление от центра к нему самому не определено');
  }
  return normalizeDegrees((Math.atan2(dy, dx) * 180) / Math.PI);
}

/** Центр бокса в координатах сцены. */
export function centerOf(box: Box): Point {
  assertBox(box);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Новый поворот при перетаскивании ручки вращения.
 *
 * `grabOffset` фиксируется один раз, в момент захвата:
 *
 * ```ts
 * const grabOffset = angleTo(centerOf(box), startPointer) - box.rotation;
 * ```
 *
 * и дальше по жесту не пересчитывается. Без него элемент прыгал бы на разницу
 * между собственным углом и направлением на курсор в первый же кадр —
 * курсор почти никогда не оказывается ровно там, куда смотрит элемент.
 */
export function rotateBox(box: Box, pointer: Point, grabOffset: number): Box {
  assertBox(box);
  assertPoint(pointer, 'указателя');
  assertFinite(grabOffset, 'Смещение захвата');

  const center = centerOf(box);

  // Указатель ровно в центре достижим: при масштабе 1 центр элемента попадает
  // в целую экранную координату. Направления в этой точке нет, а значит нет
  // и новых сведений об угле — оставляем прежний. Это не заглушка вместо
  // ошибки: любое другое значение здесь было бы рывком, то есть ровно тем
  // дефектом, против которого существует grabOffset.
  if (pointer.x === center.x && pointer.y === center.y) return { ...box };

  return { ...box, rotation: normalizeDegrees(angleTo(center, pointer) - grabOffset) };
}

/** Приведение градусов к [0, 360). */
function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function assertFinite(value: number, what: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${what}: ожидалось конечное число, получено ${value}`);
  }
}

function assertPositive(value: number, what: string): void {
  assertFinite(value, what);
  if (value <= 0) {
    throw new RangeError(`${what}: ожидалось положительное число, получено ${value}`);
  }
}

function assertPoint(point: Point, what: string): void {
  assertFinite(point.x, `Координата x ${what}`);
  assertFinite(point.y, `Координата y ${what}`);
}

/**
 * Размеры проверяются на положительность, а не просто на конечность:
 * `ElementSchema` объявляет их `positive()`, то есть бокс с нулевой шириной
 * невозможно ни загрузить, ни сохранить. Пропустить такой бокс дальше значит
 * увести падение от места, где значение появилось, в загрузку следующей
 * сессии.
 */
function assertBox(box: Box): void {
  assertFinite(box.x, 'Координата x бокса');
  assertFinite(box.y, 'Координата y бокса');
  assertPositive(box.width, 'Ширина бокса');
  assertPositive(box.height, 'Высота бокса');
  assertFinite(box.rotation, 'Поворот бокса');
}

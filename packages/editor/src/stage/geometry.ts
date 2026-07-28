/**
 * Геометрия сцены редактора: единственное место, где происходит перевод между
 * координатными пространствами.
 *
 * Пространств ровно два, и они не совпадают:
 *
 * 1. **Логическое (сцена).** Автор кладёт элементы в координатах сцены —
 *    обычно 1920×1080. Это `element.x/y/width/height`, `offsetLeft`,
 *    `clientWidth`. Трансформация контейнера сюда НЕ входит.
 * 2. **Экранное (клиент).** То, что видит браузер после
 *    `transform: translate(offsetX, offsetY) scale(k)` на контейнере сцены.
 *    Это `clientX/clientY` события указателя и `getBoundingClientRect()`.
 *    Трансформация сюда входит.
 *
 * ADR-007 говорит об этом прямо: «`getBoundingClientRect` и `clientX`
 * учитывают трансформацию, `offsetLeft` и `clientWidth` — нет. Перетаскивание
 * в редакторе сломается **тихо**». Тихо — потому что при масштабе 1 (обычный
 * десктоп во весь экран) смешение пространств даёт правильный ответ, и дефект
 * проявится только у зрителя на узком экране или при летербоксе.
 * См. docs/adr/ADR-007-scene-scaling.md.
 *
 * Отсюда конструкция модуля: функции чистые, DOM внутри не трогается вовсе.
 * Измеренный прямоугольник контейнера приходит аргументом — вызывающий обязан
 * взять его из DOM свежим на каждый жест, а не из сохранённого состояния
 * (тоже требование ADR-007). Заодно модуль проверяется в node без jsdom.
 */

/** Измеренный прямоугольник контейнера сцены — то, что вернул `getBoundingClientRect()`. */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Прямоугольник элемента в координатах сцены. `rotation` — градусы, как в CSS `rotate()`. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Бокс, у которого есть место в стопке. `Element` из core подходит структурно. */
export interface Layer extends Box {
  zIndex: number;
}

/**
 * Масштаб сцены: измеренная ширина, делённая на логическую.
 *
 * Только по ширине и только из переданного прямоугольника. Второй оси здесь
 * нет не по недосмотру: `fitStage` берёт `scale = Math.min(hostW / stageW,
 * hostH / stageH)` и применяет результат одним `scale(k)`, значит масштаб
 * по обеим осям одинаков, а `height` прямоугольника при летербоксе несёт
 * высоту сцены, а не контейнера, и для расчёта бесполезен.
 */
export function stageScale(rect: Rect, logicalWidth: number): number {
  if (!Number.isFinite(rect.width) || rect.width <= 0) {
    throw new RangeError(
      `Измеренная ширина сцены должна быть конечным положительным числом, получено ${rect.width}`,
    );
  }
  if (!Number.isFinite(logicalWidth) || logicalWidth <= 0) {
    throw new RangeError(
      `Логическая ширина сцены должна быть конечным положительным числом, получено ${logicalWidth}`,
    );
  }
  const scale = rect.width / logicalWidth;
  // Оба числа конечны и положительны, а частное всё равно может выродиться
  // на краях диапазона double. Молча вернуть ноль здесь — значит поделить
  // на него у вызывающего и получить Infinity вместо координаты.
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`Нелогичный масштаб сцены: ${rect.width} / ${logicalWidth} = ${scale}`);
  }
  return scale;
}

/**
 * Экранная точка (`clientX`/`clientY`) → координаты сцены.
 *
 * Координаты принимаются двумя числами, а не точкой, намеренно: на входе
 * всегда событие указателя, и лишняя сборка объекта на каждый `pointermove`
 * только маскировала бы источник данных.
 */
export function toScene(rect: Rect, logicalWidth: number, clientX: number, clientY: number): Point {
  const scale = stageScale(rect, logicalWidth);
  // `rect.left/top` уже включают летербокс-отступ и прокрутку страницы:
  // это края трансформированного контейнера, а не окна.
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale,
  };
}

/** Координаты сцены → экранная точка. */
export function toScreen(rect: Rect, logicalWidth: number, point: Point): Point {
  const scale = stageScale(rect, logicalWidth);
  return {
    x: rect.left + point.x * scale,
    y: rect.top + point.y * scale,
  };
}

/**
 * Попадает ли точка внутрь бокса с учётом его поворота.
 *
 * Точка обязана быть уже в координатах сцены — то есть пропущена через
 * `toScene`. Сравнивать `clientX` с `box.x` нельзя, это ровно та ошибка,
 * ради которой существует модуль.
 *
 * Поворот учитывается обратным преобразованием: точка поворачивается на минус
 * угол вокруг центра бокса, после чего сравнивается с невращённым
 * прямоугольником. Аппроксимация ограничивающим прямоугольником здесь была бы
 * не приближением, а враньём: у бокса 200×100, повёрнутого на 45°, угол
 * ограничивающего прямоугольника отстоит от самого бокса на десятки пикселей,
 * и выделение хватало бы пустоту.
 *
 * Границы включены: клик ровно в край элемента — попадание.
 */
export function hitTest(box: Box, point: Point): boolean {
  const local =
    box.rotation === 0
      ? point
      : rotate(point, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -box.rotation);

  return (
    local.x >= box.x &&
    local.x <= box.x + box.width &&
    local.y >= box.y &&
    local.y <= box.y + box.height
  );
}

/**
 * Экранный прямоугольник бокса — для позиционирования ручек в оверлее.
 *
 * Поворот сюда НЕ закладывается, и это осознанно. Оверлей воспроизводит ту же
 * конструкцию, что и сам элемент: прямоугольник по `left/top/width/height`
 * плюс отдельный `rotate(rotation)` вокруг собственного центра (`applyElement`
 * в player/src/render.ts делает именно так). Верни мы здесь ограничивающий
 * прямоугольник повёрнутого бокса, ручки разъехались бы с элементом тем
 * сильнее, чем больше угол.
 */
export function boxToScreen(
  rect: Rect,
  logicalWidth: number,
  box: Box,
): { left: number; top: number; width: number; height: number } {
  const scale = stageScale(rect, logicalWidth);
  return {
    left: rect.left + box.x * scale,
    top: rect.top + box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
  };
}

/**
 * Верхний по стопке бокс под точкой — то, что должно выделиться по клику.
 *
 * Порядок повторяет порядок отрисовки: сначала `zIndex`, при равенстве
 * побеждает тот, кто позже в массиве, потому что `renderScene` вставляет узлы
 * в порядке массива и поздний перекрывает раннего.
 */
export function topmostAt<T extends Layer>(layers: readonly T[], point: Point): T | undefined {
  let top: T | undefined;
  for (const layer of layers) {
    if (!hitTest(layer, point)) continue;
    if (top === undefined || layer.zIndex >= top.zIndex) top = layer;
  }
  return top;
}

/**
 * Поворот точки вокруг центра на угол в градусах.
 *
 * Знак совпадает с CSS: ось Y направлена вниз, поэтому положительный угол —
 * это поворот по часовой стрелке на экране.
 *
 * Публичная ради `transform.ts`: изменение размера повёрнутого бокса — тот же
 * поворот вокруг центра, что и попадание в него. Вторая копия этой формулы
 * разошлась бы по знаку молча — оба варианта выглядят одинаково правдоподобно,
 * а расходятся только на повёрнутых элементах.
 */
export function rotate(point: Point, center: Point, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

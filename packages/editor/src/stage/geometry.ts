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

/**
 * Центр бокса. Он же — точка, вокруг которой бокс поворачивается.
 *
 * Экспортирована ради `reflowGroup` (`state/groupElements.ts`, Сессия 36):
 * пересчёт охвата поворачивает центр НОВОГО охвата вокруг центра СТАРОГО
 * бокса группы той же формулой, что здесь, — второе описание разошлось бы
 * молча, как и остальные формулы этого модуля.
 */
export function centerOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Ребёнок группы из ЛОКАЛЬНЫХ координат в координаты сцены.
 *
 * `x`/`y` ребёнка отсчитываются от левого верхнего угла группы, `rotation`
 * у него собственный (решение владельца 08.08.2026). Всё остальное в
 * редакторе — попадание указателя, прилипание, рамка выделения, обе
 * арифметики жеста — считает в координатах сцены. Эта функция и обратная
 * к ней `childBoxInGroup` — единственный переход между двумя системами.
 *
 * **Поворот применяется к ЦЕНТРУ, а не к левому верхнему углу.** Поворот
 * группы гонит содержимое по окружности вокруг центра группы, а не сдвигает
 * его бокс параллельно. Взять угол — значит получить правдоподобно неверный
 * ответ, расходящийся тем сильнее, чем дальше ребёнок от центра.
 *
 * **Углы складываются.** То, что зритель видит под наклоном группы плюс
 * собственный наклон ребёнка, — это один угол, и он обязан выйти суммой.
 *
 * Пара функций заменяет собой «поворот сдвига мыши на минус угол группы»:
 * тот поворот из неё ВЫВОДИТСЯ (`childBoxInGroup` от сдвинутого бокса даёт
 * ровно повёрнутый сдвиг) и заодно достаётся ресайзу и повороту, которым
 * одного сдвига было бы мало.
 */
export function childBoxInScene(group: Box, child: Box): Box {
  const center = rotate(
    {
      x: group.x + child.x + child.width / 2,
      y: group.y + child.y + child.height / 2,
    },
    centerOf(group),
    group.rotation,
  );
  return {
    x: center.x - child.width / 2,
    y: center.y - child.height / 2,
    width: child.width,
    height: child.height,
    rotation: group.rotation + child.rotation,
  };
}

/**
 * Обратно: бокс на сцене → локальные координаты ребёнка группы.
 *
 * Разбор — у `childBoxInScene`. Здесь важно только то, что это её точная
 * обратная, а не «похожая формула в другую сторону»: круговой тест
 * (`groupCoords.test.ts`) охраняет именно это, и в Сессии 35 круговой тест
 * оказался единственным, кто поймал потерю углового слагаемого.
 */
export function childBoxInGroup(group: Box, scene: Box): Box {
  const center = rotate(centerOf(scene), centerOf(group), -group.rotation);
  return {
    x: center.x - group.x - scene.width / 2,
    y: center.y - group.y - scene.height / 2,
    width: scene.width,
    height: scene.height,
    rotation: scene.rotation - group.rotation,
  };
}

/**
 * Четыре угла бокса в координатах сцены, с учётом поворота.
 *
 * Вынесено в общую функцию не ради краткости: формула угла повёрнутого бокса
 * нужна и `unionBox`, и `intersectsRect`, а вторая её копия разошлась бы
 * МОЛЧА — оба варианта выглядят одинаково правдоподобно, а расходятся только
 * там, где автор что-то повернул. Тот же довод, по которому публична `rotate`.
 *
 * Порядок углов — по часовой стрелке от левого верхнего. Он важен только
 * для читателя: обе вызывающие функции углы перебирают, а не индексируют.
 */
function corners(box: Box): readonly Point[] {
  const points: readonly Point[] = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
  if (!box.rotation) return points;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return points.map((point) => rotate(point, center, box.rotation));
}

/** Отрезок, в который проецируется многоугольник на ось. */
function project(points: readonly Point[], axis: Point): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

/**
 * Пересекается ли бокс с прямоугольной областью — попал ли элемент
 * в резиновую рамку выделения.
 *
 * Область приходит НЕПОВЁРНУТОЙ (`x`/`y`/`width`/`height` в координатах
 * сцены): рамку автор тянет по осям экрана, своего наклона у неё нет.
 * А вот бокс повёрнут быть может, и в этом вся сложность.
 *
 * Считается теоремой о разделяющей оси: два выпуклых многоугольника НЕ
 * пересекаются тогда и только тогда, когда найдётся ось, на которую они
 * проецируются без перекрытия. Для прямоугольников достаточно перебрать
 * нормали их сторон — две у области (оси координат) и две у бокса
 * (повёрнутые на его угол). Всего четыре оси.
 *
 * Соблазнительная замена — сравнить область с ОПИСАННЫМ прямоугольником
 * бокса (`unionBox([box])`) — здесь была бы не приближением, а враньём,
 * причём в сторону лишнего: у бокса 200×100 под 45° угол описанного
 * прямоугольника отстоит от самого бокса на десятки пикселей, и рамка,
 * прошедшая рядом, хватала бы элемент, которого не касалась. Дефект
 * правдоподобный: на неповёрнутых элементах обе формулы дают одно и то же.
 *
 * Касание считается попаданием (сравнение нестрогое) — как и в `hitTest`.
 * Автор, обводящий пачку, обычно промахивается ВНУТРЬ, и прощающее
 * правило здесь честнее строгого.
 */
export function intersectsRect(
  box: Box,
  area: { x: number; y: number; width: number; height: number },
): boolean {
  const boxPoints = corners(box);
  const areaPoints = corners({ ...area, rotation: 0 });

  const radians = (box.rotation * Math.PI) / 180;
  const axes: readonly Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: Math.cos(radians), y: Math.sin(radians) },
    { x: -Math.sin(radians), y: Math.cos(radians) },
  ];

  for (const axis of axes) {
    const a = project(boxPoints, axis);
    const b = project(areaPoints, axis);
    // Зазор хотя бы по одной оси — пересечения нет, дальше можно не смотреть.
    if (a.max < b.min || b.max < a.min) return false;
  }
  return true;
}

/**
 * Охватывающий прямоугольник нескольких боксов — рамка множественного
 * выделения.
 *
 * Считается ПО УГЛАМ, а не по полям `x/y/width/height`, и это не педантизм:
 * повёрнутый элемент выходит за свой неповёрнутый бокс, и рамка, посчитанная
 * без углов, обрезала бы его — тем сильнее, чем больше угол. Ошибка
 * правдоподобная: на неповёрнутых элементах обе формулы дают одно и то же,
 * а расходятся только там, где автор что-то повернул.
 *
 * Результат всегда `rotation: 0`. У множественного выделения своего угла нет:
 * два элемента, повёрнутых по-разному, не имеют общего наклона, а выбрать
 * чей-то один значило бы соврать про остальных.
 *
 * `undefined` на пустом списке: «рамки нет» — это отсутствие рамки,
 * а не рамка нулевого размера в начале координат.
 */
export function unionBox(boxes: readonly Box[]): Box | undefined {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const box of boxes) {
    for (const point of corners(box)) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  }

  if (!Number.isFinite(left)) return undefined;
  return { x: left, y: top, width: right - left, height: bottom - top, rotation: 0 };
}

/**
 * Расположение: выравнивание, раскладка поровну и порядок наложения.
 *
 * Чистая арифметика над боксами. Ни DOM, ни React, ни состояния редактора:
 * на входе — что где лежит, на выходе — куда это подвинуть. Применением
 * занимается Editor.tsx, и он же делает из пачки правок ОДИН шаг истории.
 *
 * **Схему модуль не трогает.** Выравнивание — это правка `x`/`y`, слои —
 * правка `zIndex`; оба поля в `ElementState` есть с давних версий.
 *
 * Все три операции работают с ОХВАТЫВАЮЩИМ прямоугольником элемента
 * (`unionBox`), а не с полями `x`/`y`/`width`/`height`. Повёрнутый элемент
 * выходит за свой неповёрнутый бокс, и автор выравнивает именно видимые
 * края. Выравнивание по полям поставило бы повёрнутые элементы в столбик,
 * который выглядит кривым, — и только повёрнутые, то есть читалось бы как
 * случайный глюк.
 */
import { unionBox, type Box } from '../stage/geometry.js';

/** Элемент на слайде: кто и где. */
export interface Placed {
  readonly id: string;
  readonly box: Box;
}

/** Куда его подвинуть. `x`/`y` — новые значения полей, а не смещение. */
export interface Move {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'x' | 'y';
export type LayerMove = 'front' | 'back' | 'forward' | 'backward';

const AXIS_OF: Readonly<Record<AlignKind, 'x' | 'y'>> = {
  left: 'x',
  centerX: 'x',
  right: 'x',
  top: 'y',
  centerY: 'y',
  bottom: 'y',
};

/** Начало, середина и конец охватывающего прямоугольника по оси. */
function extentOf(box: Box, axis: 'x' | 'y'): { min: number; max: number; size: number } {
  const bounds = unionBox([box])!;
  return axis === 'x'
    ? { min: bounds.x, max: bounds.x + bounds.width, size: bounds.width }
    : { min: bounds.y, max: bounds.y + bounds.height, size: bounds.height };
}

/**
 * Выравнивание.
 *
 * **Один выделенный выравнивается по ХОЛСТУ, несколько — по общей рамке
 * выделения.** Так в Canva, и по-другому было бы бессмысленно: у одного
 * элемента нет соседей, относительно которых равняться, и кнопка «по
 * левому краю» при одном выделенном либо двигает его к краю сцены, либо
 * не делает ничего.
 *
 * Общая рамка считается по тем же элементам, которые двигаются, поэтому
 * повторное нажатие той же кнопки уже ничего не меняет — операция
 * идемпотентна, и автор не «доводит» элементы многократным нажатием.
 */
export function align(
  items: readonly Placed[],
  kind: AlignKind,
  stage: { width: number; height: number },
): readonly Move[] {
  if (items.length === 0) return [];

  const axis = AXIS_OF[kind];
  const reference =
    items.length === 1
      ? { min: 0, max: axis === 'x' ? stage.width : stage.height }
      : (() => {
          const bounds = unionBox(items.map((item) => item.box))!;
          return axis === 'x'
            ? { min: bounds.x, max: bounds.x + bounds.width }
            : { min: bounds.y, max: bounds.y + bounds.height };
        })();

  return items.map((item) => {
    const extent = extentOf(item.box, axis);
    let target: number;
    switch (kind) {
      case 'left':
      case 'top':
        target = reference.min;
        break;
      case 'right':
      case 'bottom':
        target = reference.max - extent.size;
        break;
      default:
        // Середина: одна и та же формула для обеих осей.
        target = (reference.min + reference.max) / 2 - extent.size / 2;
    }
    // Смещение, а не присваивание: у повёрнутого элемента поле `x` и левый
    // видимый край — разные числа, и присвоить полю целевую границу значило
    // бы промахнуться ровно на вылет поворота.
    const delta = target - extent.min;
    return axis === 'x'
      ? { id: item.id, x: item.box.x + delta, y: item.box.y }
      : { id: item.id, x: item.box.x, y: item.box.y + delta };
  });
}

/**
 * Разложить поровну.
 *
 * Равными делаются ПРОМЕЖУТКИ МЕЖДУ КРАЯМИ, а не расстояния между
 * центрами. При разных размерах это разные раскладки, и вторая выглядит
 * криво: широкий элемент между двумя узкими прижимается к соседям,
 * хотя центры стоят ровно. Так же считает Canva.
 *
 * Крайние два не двигаются: они задают отрезок, внутри которого всё
 * раскладывается. Двигать их значило бы менять габарит всей группы
 * от нажатия кнопки «разложить».
 *
 * Меньше трёх элементов — ошибка вызывающего, а не штатный случай:
 * между двумя элементами промежуток ровно один, и делать его равным
 * нечему. Кнопка в интерфейсе при этом погашена.
 */
export function distribute(items: readonly Placed[], axis: DistributeAxis): readonly Move[] {
  if (items.length < 3) {
    throw new RangeError(`Разложить поровну можно от трёх элементов, получено ${items.length}`);
  }

  const measured = items
    .map((item) => ({ item, extent: extentOf(item.box, axis) }))
    .sort((a, b) => a.extent.min - b.extent.min);

  const first = measured[0]!;
  const last = measured[measured.length - 1]!;
  const span = last.extent.max - first.extent.min;
  const occupied = measured.reduce((sum, entry) => sum + entry.extent.size, 0);
  // Промежуток может выйти отрицательным, если элементы не помещаются
  // в отрезок. Это законно: они и до нажатия перекрывались, и результат —
  // равномерное перекрытие, а не ошибка.
  const gap = (span - occupied) / (measured.length - 1);

  let cursor = first.extent.min;
  return measured.map((entry) => {
    const delta = cursor - entry.extent.min;
    cursor += entry.extent.size + gap;
    return axis === 'x'
      ? { id: entry.item.id, x: entry.item.box.x + delta, y: entry.item.box.y }
      : { id: entry.item.id, x: entry.item.box.x, y: entry.item.box.y + delta };
  });
}

/** Слой элемента на слайде. */
export interface Stacked {
  readonly id: string;
  readonly zIndex: number;
}

/**
 * Порядок наложения кнопками.
 *
 * **Выделенные сохраняют взаимный порядок между собой.** Три элемента,
 * отправленные на передний план, встают поверх остальных в том же порядке,
 * в каком лежали, — иначе автор, нажав кнопку, получал бы перетасованную
 * стопку и не мог бы предсказать результат.
 *
 * **Номера переписываются плотно (0…n−1).** Без этого числа в сохранённом
 * файле росли бы от каждого нажатия и расходились между слайдами без
 * всякой причины: `zIndex` — поле снимка слайда, и два слайда одного
 * сегмента получали бы разные номера у одних и тех же элементов.
 * Плотная нумерация делает файл сравнимым глазами — тот же довод,
 * по которому `freeId` не случаен.
 *
 * Исходный порядок стопки читается так же, как его читает попадание
 * по клику (`topmostAt`): сначала `zIndex`, при равенстве побеждает тот,
 * кто позже в списке. Две разные трактовки одного порядка разошлись бы
 * молча — автор кликал бы по одному элементу, а поднимался бы другой.
 */
export function restack(
  layers: readonly Stacked[],
  movingIds: readonly string[],
  move: LayerMove,
): readonly Stacked[] {
  const moving = new Set(movingIds);
  for (const id of moving) {
    if (!layers.some((layer) => layer.id === id)) {
      throw new Error(`Нельзя подвинуть по слоям элемент «${id}»: его нет на слайде`);
    }
  }

  const order = layers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => (a.layer.zIndex - b.layer.zIndex) || (a.index - b.index))
    .map((entry) => entry.layer);

  const selected = order.filter((layer) => moving.has(layer.id));
  const rest = order.filter((layer) => !moving.has(layer.id));
  if (selected.length === 0 || rest.length === 0) return layers;

  /** Сколько невыделенных лежит НИЖЕ элемента с этим местом в общем порядке. */
  const restBelow = (position: number): number =>
    rest.filter((layer) => order.indexOf(layer) < position).length;

  const topSelected = order.indexOf(selected[selected.length - 1]!);
  const bottomSelected = order.indexOf(selected[0]!);

  let insertAt: number;
  switch (move) {
    case 'front':
      insertAt = rest.length;
      break;
    case 'back':
      insertAt = 0;
      break;
    case 'forward':
      // На один невыделенный вверх от САМОГО ВЕРХНЕГО выделенного.
      // Считать от нижнего значило бы, что пачка, у которой верхний уже
      // наверху, всё равно «двигается» — и разрывалась бы.
      insertAt = Math.min(restBelow(topSelected) + 1, rest.length);
      break;
    default:
      insertAt = Math.max(restBelow(bottomSelected) - 1, 0);
  }

  const next = [...rest.slice(0, insertAt), ...selected, ...rest.slice(insertAt)];
  return next.map((layer, index) => ({ id: layer.id, zIndex: index }));
}

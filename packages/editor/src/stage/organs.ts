/**
 * Органы расположения: выравнивание, раскладка, слои, «копировать
 * форматирование» — данные (подписи, `data-testid`, рисунок значка), общие
 * для ДВУХ мест их показа.
 *
 * До Сессии 48 они жили только на полосе свойств над холстом
 * (`stage/PropBar.tsx`, Сессия 30). Решение владельца 18.08.2026: полоса
 * при окне 1280 с открытым каталогом не помещает даже пять полей стиля
 * (673 px при доступных 586) — органы снимаются с полосы совсем и остаются
 * только за дверью «Ещё…», в блоке «Расположение» панели «Объект»
 * (`panels/Inspector.tsx`). На полосе остаются частые поля стиля,
 * названные владельцем поимённо: шрифт, кегль, начертание, цвет,
 * выравнивание (`text-align` — пятое поле `BAR_FIELD_KEYS.text`,
 * `state/propbar.ts`; это не то же самое, что `ALIGN_BUTTONS` ниже —
 * те выравнивают ОБЪЕКТЫ на холсте, а не текст внутри одного).
 *
 * Константы вынесены СЮДА, а не оставлены в `PropBar.tsx` и не
 * скопированы в `Inspector.tsx`, ровно по причине, дважды купленной
 * в Сессии 30: подписи и `data-testid` одного и того же хода обязаны
 * быть ОДНИ. Второй список с другими словами для одной кнопки — тот же
 * разнобой, что дал на одном экране две подписи «Фон».
 */
import type { AlignKind, DistributeAxis, LayerMove } from '../state/arrange.js';
import type { Shape } from '../ui/index.js';

/** Направляющая значка — тонкая полоса, показывающая, к чему равняем. */
const RULE_V: Shape = [1, 1, 1, 14];
const RULE_V_MID: Shape = [7.5, 1, 1, 14];
const RULE_V_END: Shape = [14, 1, 1, 14];
const RULE_H: Shape = [1, 1, 14, 1];
const RULE_H_MID: Shape = [1, 7.5, 14, 1];
const RULE_H_END: Shape = [1, 14, 14, 1];

export const ALIGN_BUTTONS: readonly {
  kind: AlignKind;
  label: string;
  testId: string;
  shapes: readonly Shape[];
}[] = [
  {
    kind: 'left',
    label: 'Выровнять по левому краю',
    testId: 'align-left',
    shapes: [RULE_V, [3, 3, 10, 3], [3, 10, 6, 3]],
  },
  {
    kind: 'centerX',
    label: 'Выровнять по центру, по горизонтали',
    testId: 'align-center-x',
    shapes: [RULE_V_MID, [3, 3, 10, 3], [5, 10, 6, 3]],
  },
  {
    kind: 'right',
    label: 'Выровнять по правому краю',
    testId: 'align-right',
    shapes: [RULE_V_END, [3, 3, 10, 3], [7, 10, 6, 3]],
  },
  {
    kind: 'top',
    label: 'Выровнять по верхнему краю',
    testId: 'align-top',
    shapes: [RULE_H, [3, 3, 3, 10], [10, 3, 3, 6]],
  },
  {
    kind: 'centerY',
    label: 'Выровнять по середине, по вертикали',
    testId: 'align-center-y',
    shapes: [RULE_H_MID, [3, 3, 3, 10], [10, 5, 3, 6]],
  },
  {
    kind: 'bottom',
    label: 'Выровнять по нижнему краю',
    testId: 'align-bottom',
    shapes: [RULE_H_END, [3, 3, 3, 10], [10, 7, 3, 6]],
  },
];

export const DISTRIBUTE_BUTTONS: readonly {
  axis: DistributeAxis;
  label: string;
  testId: string;
  shapes: readonly Shape[];
}[] = [
  {
    axis: 'x',
    label: 'Разложить поровну по горизонтали',
    testId: 'distribute-x',
    shapes: [[1, 3, 2, 10], [7, 3, 2, 10], [13, 3, 2, 10]],
  },
  {
    axis: 'y',
    label: 'Разложить поровну по вертикали',
    testId: 'distribute-y',
    shapes: [[3, 1, 10, 2], [3, 7, 10, 2], [3, 13, 10, 2]],
  },
];

/**
 * Подписи ходов по слоям обязаны быть ОДНИ везде, где они встают: меню
 * правой кнопки холста (`stage/ContextMenu.tsx`, через `Editor.tsx`) и
 * теперь блок «Расположение» панели «Объект» (Сессия 48) зовут этот же
 * список, а не заводят свой.
 */
export const LAYER_BUTTONS: readonly {
  move: LayerMove;
  label: string;
  testId: string;
  shapes: readonly Shape[];
}[] = [
  {
    move: 'front',
    label: 'На передний план',
    testId: 'layer-front',
    shapes: [[1, 1, 8, 8], [5, 5, 10, 10]],
  },
  {
    move: 'forward',
    label: 'Вперёд на один слой',
    testId: 'layer-forward',
    shapes: [[2, 2, 7, 7], [7, 7, 7, 7]],
  },
  {
    move: 'backward',
    label: 'Назад на один слой',
    testId: 'layer-backward',
    shapes: [[7, 7, 7, 7], [2, 2, 7, 7]],
  },
  {
    move: 'back',
    label: 'На задний план',
    testId: 'layer-back',
    shapes: [[5, 5, 10, 10], [1, 1, 8, 8]],
  },
];

/** Значок валика: тело + ручка + мазок краски, в поле 16×16 как остальные. */
export const COPY_FORMAT_SHAPES: readonly Shape[] = [
  [2, 2, 9, 4],
  [4, 6, 2, 5],
  [9, 9, 5, 3],
];

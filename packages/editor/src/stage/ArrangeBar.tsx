/**
 * Полоска расположения над холстом: выравнивание, раскладка, слои.
 *
 * **Строка полоски занимает своё место ВСЕГДА, исчезают только кнопки.**
 * Это куплено настоящим дефектом, найденным в Сессии 29 (журнал §8):
 * полоска, появлявшаяся вместе с выделением, ломала двойной клик по
 * элементу. Физика одна для обоих способов её разместить:
 *
 * - наложением поверх холста — первый клик двойного щелчка выделяет
 *   элемент, полоска возникает ПОД КУРСОРОМ, и второй клик попадает
 *   в её кнопку. В прогоне так и вышло: двойной клик по заголовку нажал
 *   «Выровнять по нижнему краю», и элемент уехал на низ холста;
 * - строкой в раскладке — появление строки уменьшает холст, сцена
 *   пересчитывает масштаб, и элемент уезжает из-под курсора; второй клик
 *   промахивается мимо него.
 *
 * Общее у обоих — обстановка под курсором меняется между двумя кликами
 * одного жеста. Постоянная высота строки убирает причину, а не симптом.
 *
 * Подписи разведены с инспектором намеренно. У выключки текста
 * (`state/style.ts`) уже есть «По левому краю», и одинаковая подпись
 * на одном экране — это не только строгий режим Playwright, но и живая
 * путаница: выключка двигает текст ВНУТРИ элемента, а эта кнопка двигает
 * сам элемент по холсту. Поэтому здесь «Выровнять по левому краю».
 */
import type { ReactElement } from 'react';

import type { AlignKind, DistributeAxis, LayerMove } from '../state/arrange.js';

export interface ArrangeBarProps {
  /** Сколько элементов выделено: от этого зависит, какие кнопки живые. */
  selectedCount: number;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onLayer: (move: LayerMove) => void;
}

/**
 * Значок собирается из прямоугольников в поле 16×16.
 *
 * Своя мелкая графика, а не шрифт значков: шрифт — это внешний файл,
 * а плеер собирается без внешних загрузок (инвариант №9), и заводить
 * его ради двенадцати кнопок редактора значило бы держать два разных
 * правила для одного проекта.
 */
type Shape = readonly [x: number, y: number, width: number, height: number];

function Icon({ shapes }: { shapes: readonly Shape[] }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {shapes.map(([x, y, width, height], index) => (
        <rect key={index} x={x} y={y} width={width} height={height} />
      ))}
    </svg>
  );
}

/** Направляющая значка — тонкая полоса, показывающая, к чему равняем. */
const RULE_V: Shape = [1, 1, 1, 14];
const RULE_V_MID: Shape = [7.5, 1, 1, 14];
const RULE_V_END: Shape = [14, 1, 1, 14];
const RULE_H: Shape = [1, 1, 14, 1];
const RULE_H_MID: Shape = [1, 7.5, 14, 1];
const RULE_H_END: Shape = [1, 14, 14, 1];

const ALIGN_BUTTONS: readonly {
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

const DISTRIBUTE_BUTTONS: readonly {
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

const LAYER_BUTTONS: readonly {
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

export function ArrangeBar({
  selectedCount,
  onAlign,
  onDistribute,
  onLayer,
}: ArrangeBarProps): ReactElement | null {
  // Ничего не выделено — кнопок нет, но СТРОКА остаётся: её высота
  // постоянна, иначе холст менял бы размер в момент выделения (см. шапку).
  if (selectedCount === 0) return <div className="ed-arrange-row" />;

  /**
   * Раскладка требует трёх: между двумя элементами промежуток ровно один,
   * и равнять его нечему. Кнопка гасится, а не бросает — автор выделяет
   * двоих по десять раз на дню, и это не ошибка, а обычное состояние.
   */
  const canDistribute = selectedCount >= 3;

  return (
    <div className="ed-arrange-row">
      <div className="ed-arrange" data-testid="arrange-bar" role="toolbar" aria-label="Расположение">
      {ALIGN_BUTTONS.map(({ kind, label, testId, shapes }) => (
        <button
          key={kind}
          type="button"
          className="ed-arrange-btn"
          data-testid={testId}
          aria-label={label}
          title={label}
          onClick={() => onAlign(kind)}
        >
          <Icon shapes={shapes} />
        </button>
      ))}

      <span className="ed-arrange-sep" aria-hidden="true" />

      {DISTRIBUTE_BUTTONS.map(({ axis, label, testId, shapes }) => (
        <button
          key={axis}
          type="button"
          className="ed-arrange-btn"
          data-testid={testId}
          aria-label={label}
          title={canDistribute ? label : `${label} — нужно выделить хотя бы три`}
          disabled={!canDistribute}
          onClick={() => onDistribute(axis)}
        >
          <Icon shapes={shapes} />
        </button>
      ))}

      <span className="ed-arrange-sep" aria-hidden="true" />

      {LAYER_BUTTONS.map(({ move, label, testId, shapes }) => (
        <button
          key={move}
          type="button"
          className="ed-arrange-btn"
          data-testid={testId}
          aria-label={label}
          title={label}
          onClick={() => onLayer(move)}
        >
          <Icon shapes={shapes} />
        </button>
      ))}
      </div>
    </div>
  );
}

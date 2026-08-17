/**
 * Полоса свойств над холстом: поля стиля выделения, выравнивание, раскладка,
 * слои и дверь в полный список свойств.
 *
 * До Сессии 30 это была полоса РАСПОЛОЖЕНИЯ (`ArrangeBar`, переименована).
 * Задание Сессии 30 переносит сюда частые поля стиля выделенного элемента
 * (или общие поля при множественном выделении — `state/propbar.ts`,
 * `propbarStyleFields`), а редкие остаются в панели «Объект» (бывший
 * `Inspector` из правой колонки, теперь открывается кнопкой «Ещё» этой
 * полосы). Виджеты полей — те же, что у панели «Объект»
 * (`panels/styleFieldWidget.tsx`, `StyleFieldWidget`): задание прямо
 * требует переиспользовать приём правки стиля, а не заводить второй.
 *
 * **Строка полосы занимает своё место ВСЕГДА, исчезают только кнопки.**
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
 * Высота — 56px (design/index.html, замер каркаса), а не прежние 38px:
 * полю стиля нужна подпись над значением, кнопкам расположения — нет,
 * и оба ряда делят одну строку постоянной высоты.
 *
 * Подписи кнопок расположения разведены с инспектором намеренно. У выключки
 * текста (`state/style.ts`) уже есть «По левому краю», и одинаковая подпись
 * на одном экране — это не только строгий режим Playwright, но и живая
 * путаница: выключка двигает текст ВНУТРИ элемента, а эта кнопка двигает
 * сам элемент по холсту. Поэтому здесь «Выровнять по левому краю».
 *
 * Кнопка «Ещё» — ОДНА дверь в панель «Объект». В каркасе рядом с ней стоит
 * ещё «Положение», ведущая туда же, и задание прямо запрещает вторую дверь:
 * автор перестаёт смотреть в обе. Здесь её нет и не будет.
 *
 * **Строка прокручивается и обязана об этом говорить (Сессия 46).** Замер
 * 18.08.2026 при окне 1280 и открытом каталоге — том состоянии, в котором
 * редактор открывается: полосе нужно 1276 px, достаётся 586. За краем
 * остаются ВСЕ тринадцать кнопок выравнивания, раскладки, слоёв и формата
 * и сама «Ещё…» — то есть единственная дверь ко всем прочим свойствам была
 * не видна вовсе. Отсюда ScrollStrip: он не убирает переполнение (при этой
 * ширине оно неустранимо — см. ниже), а делает его видимым и проходимым.
 *
 * **Переполнение при окне 1280 неустранимо перестановкой, и это числа,
 * а не мнение.** Из нужных 1276 px поля стиля занимают 697, а кнопки
 * с разделителями и «Ещё…» — 540. Доступно 586. То есть не помещаются
 * даже ОДНИ ПОЛЯ, без единой кнопки. Сделать так, чтобы влезло всё,
 * можно только убрав органы, или разложив их в две строки (высота полосы
 * постоянна и равна 56 — см. выше, почему она не может дышать), или
 * растянув полосу во всю ширину окна. Последние два — облик, а он
 * в каркасе задан (design/shell.css: полоса живёт над холстом одной
 * строкой), и меняет его владелец, а не эта правка.
 */
import type { ReactElement } from 'react';

import type { AlignKind, DistributeAxis, LayerMove } from '../state/arrange.js';
import type { LengthOrPercent, StyleFieldDef, StyleFieldKey, StyleReadResult } from '../state/style.js';
import { StyleFieldWidget } from '../panels/styleFieldWidget.js';
import { AlignIcon, ScrollStrip, type Shape } from '../ui/index.js';

export interface PropBarProps {
  /** Сколько элементов выделено: от этого зависит, какие кнопки живые. */
  selectedCount: number;
  /** Поля стиля полосы — уже отобранные `propbarStyleFields` вызывающим кодом. */
  styleFields: readonly StyleFieldDef[];
  /** Текущее значение поля — вызывающий код решает, из чьего style его читать. */
  styleValueOf: (key: StyleFieldKey) => StyleReadResult;
  onStyleCommit: (key: StyleFieldKey, value: string | number | LengthOrPercent) => void;
  /** Живое событие набора числа — см. комментарий styleFieldWidget.tsx. */
  onStyleLiveCommit: (key: StyleFieldKey, value: string | number | LengthOrPercent) => void;
  onStyleCommitHistory: () => void;
  onAlign: (kind: AlignKind) => void;
  onDistribute: (axis: DistributeAxis) => void;
  onLayer: (move: LayerMove) => void;
  /**
   * «Копировать форматирование» (docs/design/styles.md §5) — не «кисть»,
   * слово в интерфейс не идёт (натура снята в Canva 14.08.2026, там пункт
   * называется ровно так). Живо только при ОДНОМ выделенном с видом на этом
   * слайде — снимать формат с пачки или «ниоткуда» нечем.
   */
  copyFormatEnabled: boolean;
  /** Формат уже «в руке» — кнопка обязана выглядеть нажатой. */
  copyFormatArmed: boolean;
  onCopyFormat: () => void;
  /** Открывает панель «Объект» — единственная дверь в полный список свойств. */
  onOpenObject: () => void;
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

/**
 * Экспортирована ради меню правой кнопки (`stage/ContextMenu.tsx`): подписи
 * ходов по слоям обязаны быть ОДНИ. Свой список в меню разошёлся бы с этим
 * молча, и один и тот же ход назывался бы в двух местах по-разному —
 * ровно та болезнь, из-за которой в Сессии 30 на одном экране оказались
 * две подписи «Фон».
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
const COPY_FORMAT_SHAPES: readonly Shape[] = [
  [2, 2, 9, 4],
  [4, 6, 2, 5],
  [9, 9, 5, 3],
];

export function PropBar({
  selectedCount,
  styleFields,
  styleValueOf,
  onStyleCommit,
  onStyleLiveCommit,
  onStyleCommitHistory,
  onAlign,
  onDistribute,
  onLayer,
  copyFormatEnabled,
  copyFormatArmed,
  onCopyFormat,
  onOpenObject,
}: PropBarProps): ReactElement {
  // Ничего не выделено — ни полей стиля, ни кнопок расположения, но СТРОКА
  // остаётся: её высота постоянна, иначе холст менял бы размер в момент
  // выделения (см. шапку модуля). Внутренний тулбар (testid `propbar`) тут
  // же не монтируется вовсе — тот же приём, что был у прежнего ArrangeBar:
  // не «спрятан», а не существует в DOM, пока нечем его наполнить.
  if (selectedCount === 0) {
    return (
      <div className="ed-propbar-row">
        <span className="ed-propbar-hint">Выделите элементы, чтобы выровнять и разложить</span>
      </div>
    );
  }

  /**
   * Раскладка требует трёх: между двумя элементами промежуток ровно один,
   * и равнять его нечему. Кнопка гасится, а не бросает — автор выделяет
   * двоих по десять раз на дню, и это не ошибка, а обычное состояние.
   */
  const canDistribute = selectedCount >= 3;

  return (
    <div className="ed-propbar-row">
      <ScrollStrip className="ed-propbar" role="toolbar" label="Свойства объекта" testId="propbar">
        {styleFields.length === 0 ? (
          <span className="ed-propbar-hint">Общих свойств нет</span>
        ) : (
          styleFields.map((field) => (
            <div className="ed-propbar-field" key={field.key}>
              <StyleFieldWidget
                field={field}
                read={styleValueOf(field.key)}
                onCommit={(value) => onStyleCommit(field.key, value)}
                onLiveCommit={(value) => onStyleLiveCommit(field.key, value)}
                onCommitHistory={onStyleCommitHistory}
              />
            </div>
          ))
        )}

        <span className="ed-propbar-sep" aria-hidden="true" />

        {ALIGN_BUTTONS.map(({ kind, label, testId, shapes }) => (
          <button
            key={kind}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={label}
            onClick={() => onAlign(kind)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        {DISTRIBUTE_BUTTONS.map(({ axis, label, testId, shapes }) => (
          <button
            key={axis}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={canDistribute ? label : `${label} — нужно выделить хотя бы три`}
            disabled={!canDistribute}
            onClick={() => onDistribute(axis)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        {LAYER_BUTTONS.map(({ move, label, testId, shapes }) => (
          <button
            key={move}
            type="button"
            className="ed-propbar-btn"
            data-testid={testId}
            aria-label={label}
            title={label}
            onClick={() => onLayer(move)}
          >
            <AlignIcon shapes={shapes} />
          </button>
        ))}

        <span className="ed-propbar-sep" aria-hidden="true" />

        <button
          type="button"
          className="ed-propbar-btn"
          data-testid="copy-format"
          aria-label="Копировать форматирование"
          aria-pressed={copyFormatArmed}
          title={
            copyFormatEnabled
              ? 'Копировать форматирование (Ctrl+Alt+C)'
              : 'Копировать форматирование — нужно выделить один элемент с видом на этом слайде'
          }
          disabled={!copyFormatEnabled}
          onClick={onCopyFormat}
        >
          <AlignIcon shapes={COPY_FORMAT_SHAPES} />
        </button>

        <span className="ed-propbar-spacer" aria-hidden="true" />

        <button
          type="button"
          className="ed-propbar-more"
          data-testid="propbar-more"
          onClick={onOpenObject}
        >
          Ещё…
        </button>
      </ScrollStrip>
    </div>
  );
}

/**
 * Список элементов сцены — второй способ выделения, помимо клика по сцене.
 *
 * Существует ради элемента, чья анимация появления ещё не отыграла: клик
 * по сцене такой элемент найти не может — StageView фильтрует попадание по
 * видимости (ADR-010, «Выделяется то, что ВИДНО»), а список показывает
 * всё, что есть в scene.elements, независимо от того, что сейчас нарисовано.
 *
 * Строки — настоящие `<button>`: обход Tab работает без своей машинерии,
 * а порядок обхода совпадает с тем, что автор видит глазами (по zIndex).
 */
import type { ReactElement } from 'react';

import type { ElementRow } from './elementRows.js';

export interface ElementListProps {
  rows: readonly ElementRow[];
  selectedIds: readonly string[];
  onSelect: (id: string) => void;
  /** Поместить элемент на текущий слайд — §12.4. */
  onPutOnSlide: (id: string) => void;
  /** Убрать с текущего слайда, НЕ удаляя из части — парное к предыдущему. */
  onRemoveFromSlide: (id: string) => void;
}

export function ElementList({
  rows,
  selectedIds,
  onSelect,
  onPutOnSlide,
  onRemoveFromSlide,
}: ElementListProps): ReactElement {
  return (
    <div className="ed-elements" aria-label="Элементы сцены">
      <h2 className="ed-insp-title">Элементы</h2>
      {rows.length === 0 ? (
        <p className="ed-elements-empty">Сцена пуста</p>
      ) : (
        <ul className="ed-elements-list">
          {rows.map((row) => (
            <li key={row.id} className="ed-element-item">
              <button
                type="button"
                className={
                  selectedIds.includes(row.id) ? 'ed-element-row ed-element-row-selected' : 'ed-element-row'
                }
                aria-pressed={selectedIds.includes(row.id)}
                data-testid={`element-row-${row.id}`}
                onClick={() => onSelect(row.id)}
              >
                <span className="ed-element-type">{row.type}</span>
                <span className="ed-element-id">{row.id}</span>
                <span className="ed-element-summary">{row.summary}</span>
                {/* Элемент существует в сегменте, но на этом слайде у него ещё
                    нет состояния — появится только на более позднем слайде.
                    Не показать это значило бы дать автору выделить элемент
                    и упереться в пустую панель свойств без объяснения. */}
                {!row.onSlide ? <span className="ed-element-not-on-slide">не на слайде</span> : null}
              </button>
              {/*
                Сестра строки, а не вложенная в неё кнопка: кнопку в кнопку
                браузер не разрешает, а нажатие по внутренней всё равно
                поднялось бы к внешней и выделило элемент вместо действия.

                §12.4: элемент живёт в ЧАСТИ, а его состояние — на слайде.
                Здесь автор управляет вторым, не трогая первое: «убрать»
                снимает элемент с этого кадра, оставляя его в части и на
                остальных слайдах. Удаление насовсем — другая кнопка,
                в панели свойств, и это различие держится намеренно.
              */}
              <button
                type="button"
                className="ed-element-on-slide"
                data-testid={`element-slide-toggle-${row.id}`}
                title={row.onSlide ? 'Убрать с этого слайда' : 'Поместить на этот слайд'}
                aria-label={
                  row.onSlide
                    ? `Убрать «${row.id}» с этого слайда`
                    : `Поместить «${row.id}» на этот слайд`
                }
                onClick={() => (row.onSlide ? onRemoveFromSlide(row.id) : onPutOnSlide(row.id))}
              >
                {row.onSlide ? '−' : '+'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

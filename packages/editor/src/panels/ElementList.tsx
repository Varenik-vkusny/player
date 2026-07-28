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
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

export function ElementList({ rows, selectedId, onSelect }: ElementListProps): ReactElement {
  return (
    <div className="ed-elements" aria-label="Элементы сцены">
      <h2 className="ed-insp-title">Элементы</h2>
      {rows.length === 0 ? (
        <p className="ed-elements-empty">Сцена пуста</p>
      ) : (
        <ul className="ed-elements-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={
                  row.id === selectedId ? 'ed-element-row ed-element-row-selected' : 'ed-element-row'
                }
                aria-pressed={row.id === selectedId}
                data-testid={`element-row-${row.id}`}
                onClick={() => onSelect(row.id)}
              >
                <span className="ed-element-type">{row.type}</span>
                <span className="ed-element-id">{row.id}</span>
                <span className="ed-element-summary">{row.summary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

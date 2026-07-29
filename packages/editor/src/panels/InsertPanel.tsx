/**
 * Панель вставки: кнопка на каждую заготовку кладёт новый элемент сцены.
 *
 * Презентационный компонент — список кнопок и их подписи целиком берутся
 * из `ELEMENT_LIBRARY` (state/library.ts, данные), а не заданы здесь: этим
 * и проверяется, что пополнение библиотеки не требует правки этого файла
 * (library.test.ts). Что именно создавать и куда класть решает Editor.tsx
 * через `createElement`/`libraryItem` (state/elements.ts, state/library.ts)
 * и редьюсер. Здесь только вызов колбэка по клику, как того требует ADR-010.
 */
import type { ReactElement } from 'react';

import { ELEMENT_LIBRARY } from '../state/library.js';

export interface InsertPanelProps {
  onInsert: (itemId: string) => void;
}

export function InsertPanel({ onInsert }: InsertPanelProps): ReactElement {
  return (
    <div className="ed-insert" role="group" aria-label="Добавить элемент">
      {ELEMENT_LIBRARY.map((item) => (
        <button
          key={item.id}
          type="button"
          className="ed-action"
          data-testid={`insert-${item.id}`}
          onClick={() => onInsert(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

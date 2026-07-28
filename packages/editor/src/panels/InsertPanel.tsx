/**
 * Панель вставки: три кнопки создают новый элемент сцены.
 *
 * Презентационный компонент — что именно создавать и куда класть решает
 * Editor.tsx через `createElement` (state/elements.ts) и редьюсер. Здесь
 * только вызов колбэка по клику, как того требует ADR-010.
 */
import type { ReactElement } from 'react';

import type { ElementType } from '../state/elements.js';

export interface InsertPanelProps {
  onInsert: (type: ElementType) => void;
}

const ITEMS: readonly { readonly type: ElementType; readonly label: string }[] = [
  { type: 'text', label: 'Текст' },
  { type: 'shape', label: 'Фигура' },
  { type: 'image', label: 'Картинка' },
];

export function InsertPanel({ onInsert }: InsertPanelProps): ReactElement {
  return (
    <div className="ed-insert" role="group" aria-label="Добавить элемент">
      {ITEMS.map((item) => (
        <button
          key={item.type}
          type="button"
          className="ed-action"
          data-testid={`insert-${item.type}`}
          onClick={() => onInsert(item.type)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

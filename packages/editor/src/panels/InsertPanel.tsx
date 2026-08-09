/**
 * Панель вставки: кнопка на каждую заготовку кладёт новый элемент сцены.
 *
 * Презентационный компонент — список кнопок и их подписи целиком берутся
 * из `ELEMENT_LIBRARY` (state/library.ts, данные), а не заданы здесь: этим
 * и проверяется, что пополнение библиотеки не требует правки этого файла
 * (library.test.ts). Что именно создавать и куда класть решает Editor.tsx
 * через `createElement`/`libraryItem` (state/elements.ts, state/library.ts)
 * и редьюсер. Здесь только вызов колбэка по клику, как того требует ADR-010.
 *
 * `category` делит каталог между тремя панелями каталога («Фигуры», «Текст»,
 * «Своё») без единого упоминания конкретной заготовки в этом файле — фильтр
 * читает поле `category` из данных, а не список id/label в разметке.
 * Обязательный пропс: у каждого вызова с Сессии 30 есть своя категория
 * (chrome/catalog.ts), и показ «всех заготовок сразу» больше не бывает
 * законным состоянием — это была временная заглушка, пока Editor.tsx не был
 * разведён на три панели.
 */
import type { ReactElement } from 'react';

import { ELEMENT_LIBRARY, type LibraryCategory } from '../state/library.js';

export interface InsertPanelProps {
  onInsert: (itemId: string) => void;
  category: LibraryCategory;
}

export function InsertPanel({ onInsert, category }: InsertPanelProps): ReactElement {
  const items = ELEMENT_LIBRARY.filter((item) => item.category === category);
  return (
    <div className="ed-insert" role="group" aria-label="Добавить элемент">
      {items.map((item) => (
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

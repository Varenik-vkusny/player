/**
 * Оболочка широкой панели каталога справа от рельса — голова (заголовок,
 * кнопка сворачивания и пояснение) плюс тело с содержимым конкретной
 * категории.
 *
 * Презентационная обёртка: что показывать в теле, решает вызывающий
 * (`children`) — сама панель не знает о категориях каталога.
 *
 * Кнопка сворачивания (Сессия 30, задача владельца «сворачивать/сжимать
 * контролеры») существует ТОЛЬКО пока эта панель отрисована — то есть
 * пока каталог развёрнут: свёрнутый каталог Editor.tsx не рендерит вовсе
 * (ширина колонки уходит в 0 через `--ed-catalog-w`). Дорога назад для
 * свёрнутого состояния — не эта кнопка, а рельс категорий слева
 * (`CatalogRail`, он не сворачивается никогда): нажатие по любой категории
 * разворачивает панель обратно. Поэтому `aria-expanded` здесь всегда `true`.
 */
import type { ReactElement, ReactNode } from 'react';

export interface CatalogPanelProps {
  title: string;
  /** Пояснение под заголовком. Может отсутствовать — голова остаётся всё равно. */
  hint?: string;
  children: ReactNode;
  /** Сворачивает панель каталога. */
  onCollapse: () => void;
}

export function CatalogPanel({ title, hint, children, onCollapse }: CatalogPanelProps): ReactElement {
  return (
    <aside className="ed-catalog" data-testid="catalog">
      <div className="ed-catalog-head">
        <div className="ed-catalog-head-row">
          <h2 className="ed-catalog-title">{title}</h2>
          <button
            type="button"
            className="ed-catalog-collapse"
            data-testid="collapse-catalog"
            aria-expanded="true"
            aria-label="Свернуть панель каталога"
            onClick={onCollapse}
          >
            <span aria-hidden="true">«</span>
          </button>
        </div>
        {hint ? <p className="ed-catalog-hint">{hint}</p> : null}
      </div>
      <div className="ed-catalog-body">{children}</div>
    </aside>
  );
}

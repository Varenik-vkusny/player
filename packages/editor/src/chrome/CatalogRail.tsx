/**
 * Рельс категорий каталога — узкая полоса слева, как в Canva.
 *
 * Презентационный компонент: кнопки и подписи целиком берутся из
 * `CATALOG_CATEGORIES` (catalog.ts, данные), а не заданы здесь. Тем же
 * приёмом, каким `InsertPanel.tsx` защищён тестом `library.test.ts`
 * («пополнение каталога не требует правок в React») — списка подписей
 * в этой разметке нет и не будет. Значок берётся оттуда же, полем `icon`:
 * до Сессии 52 он рисовался символом из шрифта, что запрещено ADR-034 —
 * на машине без глифа от такого значка остаётся пустой прямоугольник,
 * молча.
 */
import type { ReactElement } from 'react';

import { Icon } from '../ui/index.js';

import { CATALOG_CATEGORIES } from './catalog.js';
import type { PanelId } from './catalog.js';

export interface CatalogRailProps {
  /** Какая панель открыта сейчас. Может быть `object` — тогда ни одна кнопка не нажата. */
  current: PanelId;
  onSelect: (id: PanelId) => void;
}

export function CatalogRail({ current, onSelect }: CatalogRailProps): ReactElement {
  return (
    <nav className="ed-rail" aria-label="Каталоги">
      {CATALOG_CATEGORIES.map(({ id, label, icon }) => (
        <button
          key={id}
          type="button"
          className="ed-rail-item"
          data-testid={`rail-${id}`}
          aria-pressed={current === id}
          title={label}
          onClick={() => onSelect(id)}
        >
          <Icon name={icon} />
          <span className="ed-rail-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}

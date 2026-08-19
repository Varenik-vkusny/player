/**
 * Каталог заготовок элементов: плитка на каждую кладёт новый элемент сцены.
 *
 * **Что изменилось в Сессии 52.** Был `div.ed-insert` с `flex-wrap` и
 * кнопками-подписями; стал сеткой плиток по анатомии, снятой замером с живой
 * Канвы (docs/research/2026-08-19-anatomy-canva-capcut.md). Форма плитки
 * здесь ДРУГАЯ, чем у шаблонов, и это не разнобой, а то же правило натуры:
 * у Канвы одна ширина колонки и один зазор на все сетки панели, а число
 * колонок выводится из формы содержимого. Раскладка слайда — 16:9 и две
 * колонки; отдельный объект — 1:1 и три колонки с подписью.
 *
 * **Рисунок плитки выводится из полей самой заготовки** — её пропорций,
 * заливки и скругления (`panels/thumbShapes.ts`). Поэтому круг выглядит
 * кругом, линия — линией, а рамка — контуром, и при этом ни одного имени
 * заготовки в этом файле нет: пополнение библиотеки остаётся дописанной
 * записью в данных, что и проверяет test/library.test.ts.
 *
 * `category` делит каталог между тремя панелями без единого упоминания
 * конкретной заготовки: фильтр читает поле из данных.
 */
import type { ReactElement } from 'react';

import { ELEMENT_LIBRARY, type LibraryCategory } from '../state/library.js';
import { LayoutThumb, Tile, TileGrid } from '../ui/index.js';
import { objectShape } from './thumbShapes.js';

/** Поле, в котором рисуется схема одной заготовки. Квадрат — плитка объекта 1:1. */
const FIELD = 100;

export interface InsertPanelProps {
  onInsert: (itemId: string) => void;
  category: LibraryCategory;
}

export function InsertPanel({ onInsert, category }: InsertPanelProps): ReactElement {
  const items = ELEMENT_LIBRARY.filter((item) => item.category === category);
  return (
    <TileGrid kind="объект" label="Добавить элемент">
      {items.map((item) => (
        <Tile
          key={item.id}
          shape="объект"
          label={item.label}
          data-testid={`insert-${item.id}`}
          onClick={() => onInsert(item.id)}
        >
          <LayoutThumb viewWidth={FIELD} viewHeight={FIELD} shapes={[objectShape(item, FIELD)]} />
        </Tile>
      ))}
    </TileGrid>
  );
}

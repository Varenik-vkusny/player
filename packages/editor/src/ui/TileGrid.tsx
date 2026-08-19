import type { JSX, ReactNode } from 'react';

/**
 * Сетка плиток каталога.
 *
 * Число колонок НЕ параметр вызывающего, а следствие того, что показано.
 * Снято замером с живой Канвы 19.08.2026: у неё одна ширина колонки
 * содержимого (313 px) и один зазор (8 px) на все сетки панели, а колонок
 * две у раскладок (плитка 16:9) и три у объектов (плитка 1:1). Обе сетки
 * сходятся в 313 арифметически: 152.5*2+8 и 99*3+8*2.
 *
 * Поэтому здесь то же слово, что у `Tile.shape`, а не число: «две колонки»
 * и «плитка 16:9» — не два решения, а одно, и разъехаться они не должны.
 */
export type TileGridKind = 'раскладка' | 'объект';

const KIND_CLASS: Record<TileGridKind, string> = {
  раскладка: 'ed-tile-grid--wide',
  объект: 'ed-tile-grid--compact',
};

export interface TileGridProps {
  kind: TileGridKind;
  /** Имя группы для тех, кто её не видит. Обязательно, как и у плитки. */
  label: string;
  children: ReactNode;
}

export function TileGrid({ kind, label, children }: TileGridProps): JSX.Element {
  return (
    <div className={`ed-tile-grid ${KIND_CLASS[kind]}`} role="group" aria-label={label}>
      {children}
    </div>
  );
}

import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

/**
 * Плитка каталога: рисунок сверху, подпись под ним.
 *
 * Кнопка, а не `div` с обработчиком: плитка кладёт что-то на сцену, то есть
 * совершает действие, и обязана доставаться с клавиатуры и называться вслух.
 *
 * `label` объявлен БЕЗ `?` намеренно. Правило, выразимое типом, выражают
 * типом: подпись, которую можно не передать, однажды не передадут, и плитка
 * молча останется без имени для тех, кто её не видит.
 *
 * Форма плитки снята с натуры (19.08.2026, docs/research/): у Канвы плитка
 * раскладки 16:9, плитка объекта 1:1. Форма — свойство того, ЧТО показано,
 * поэтому она названа словом (`'раскладка'` / `'объект'`), а не числом.
 */
export type TileShape = 'раскладка' | 'объект';

const SHAPE_CLASS: Record<TileShape, string> = {
  раскладка: 'ed-tile-art--wide',
  объект: 'ed-tile-art--square',
};

interface TileOwnProps {
  /** Подпись под рисунком. Обязательна — см. пояснение выше. */
  label: string;
  shape: TileShape;
  /** Сам рисунок: `LayoutThumb` или другая схема. */
  children: ReactNode;
}

type TileProps = TileOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function Tile({ label, shape, children, ...rest }: TileProps): JSX.Element {
  const { className, ...others } = rest;
  return (
    <button
      type="button"
      className={['ed-tile', className].filter(Boolean).join(' ')}
      {...others}
    >
      <span className={`ed-tile-art ${SHAPE_CLASS[shape]}`}>{children}</span>
      <span className="ed-tile-label">{label}</span>
    </button>
  );
}

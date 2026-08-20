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
  /** Имя плитки. Обязательно — см. пояснение выше. */
  label: string;
  /**
   * Рисовать ли подпись под рисунком. По умолчанию да.
   *
   * `false` ставится там, где рисунок называет вещь сам: в панели «Шаблоны»
   * подписей нет и у натуры (замер Канвы 20.08.2026), потому что внутри
   * плитки лежит настоящий снимок. Пока у нас там была серая схема, подпись
   * была обязательна — «Заголовок» и «Заголовок и текст» схемой на 160 px
   * не различить; со снимком различаются.
   *
   * ИМЯ ПРИ ЭТОМ НЕ ПРОПАДАЕТ, и это не то же самое, что спрятать текст
   * стилем. Подписи нет в разметке вовсе, а имя кнопки живёт в aria-label —
   * законный способ назвать кнопку с картинкой. Спрятанный `clip-path`-ом
   * текст этот проект уже покупал: он остаётся видимым тестам и невидимым
   * человеку, то есть врёт обоим сразу.
   */
  showLabel?: boolean;
  shape: TileShape;
  /** Сам рисунок: снимок сцены или схема. */
  children: ReactNode;
}

type TileProps = TileOwnProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function Tile({ label, shape, showLabel = true, children, ...rest }: TileProps): JSX.Element {
  const { className, ...others } = rest;
  return (
    <button
      type="button"
      className={['ed-tile', className].filter(Boolean).join(' ')}
      aria-label={showLabel ? undefined : label}
      {...others}
    >
      <span className={`ed-tile-art ${SHAPE_CLASS[shape]}`}>{children}</span>
      {showLabel ? <span className="ed-tile-label">{label}</span> : null}
    </button>
  );
}

import type { JSX } from 'react';

/**
 * Рисунок раскладки: схема из прямоугольников в произвольном поле.
 *
 * Родня `AlignIcon`, и по той же причине: это НЕ пиктограмма из набора,
 * а данные о раскладке, нарисованные по сетке. Разница одна — поле у
 * `AlignIcon` всегда 16×16, а здесь его задаёт вызывающий, потому что
 * рисунок строится в координатах сцены (1920×1080) или в своём поле
 * заготовки, и подгонять их к 16×16 руками значило бы считать одно и то же
 * дважды в двух местах.
 *
 * `preserveAspectRatio="xMidYMid meet"` обязателен и не украшение: плитка
 * каталога по CSS всегда 16:9, а сцена проекта может быть и 4:3. Без него
 * схема растянулась бы, то есть соврала бы о раскладке ровно там, где она
 * единственное, что плитка сообщает.
 *
 * Цвет — `currentColor` от текста плитки, как у `Icon`. Своей роли цвета
 * у схемы нет: она сопровождает подпись, а не живёт отдельно от неё.
 */
/**
 * `| undefined` у необязательных полей выписан ЯВНО: у пакета включён
 * `exactOptionalPropertyTypes`, и без него «поля нет» и «поле есть, но
 * пустое» — разные типы. Схема заготовки честно не знает скругления
 * у половины записей, и прятать это приведением было бы ложью типа.
 */
export interface ThumbShape {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /**
   * Сплошная заливка или один контур. Выводится из данных заготовки
   * (`background: 'transparent'` даёт контур), а не назначается рукой.
   */
  readonly fill?: 'solid' | 'outline' | undefined;
  /** Несущее или подложка. Подложки глушатся, иначе схема читается как каша. */
  readonly tone?: 'strong' | 'soft' | undefined;
  /** Скругление в единицах того же поля. `'round'` — эллипс во всю фигуру. */
  readonly radius?: number | 'round' | undefined;
}

export interface LayoutThumbProps {
  /** Поле, в координатах которого заданы фигуры. */
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly shapes: readonly ThumbShape[];
}

export function LayoutThumb({ viewWidth, viewHeight, shapes }: LayoutThumbProps): JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, index) => {
        const outline = shape.fill === 'outline';
        const opacity = shape.tone === 'soft' ? 0.28 : 0.8;
        const paint = outline
          ? { fill: 'none', stroke: 'currentColor', strokeOpacity: opacity, strokeWidth: Math.max(viewWidth, viewHeight) / 90 }
          : { fill: 'currentColor', fillOpacity: opacity };

        if (shape.radius === 'round') {
          return (
            <ellipse
              key={index}
              cx={shape.x + shape.width / 2}
              cy={shape.y + shape.height / 2}
              rx={shape.width / 2}
              ry={shape.height / 2}
              {...paint}
            />
          );
        }
        return (
          <rect
            key={index}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={typeof shape.radius === 'number' ? shape.radius : 0}
            {...paint}
          />
        );
      })}
    </svg>
  );
}

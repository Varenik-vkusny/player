/**
 * Рамка выделения и ручки.
 *
 * Живут ПОВЕРХ сцены, а не внутри неё. Сцена — это ровно то, что увидит
 * зритель, и служебных узлов в ней быть не должно: иначе они попадут
 * и в скриншотный паритет, и в сохранённый проект. Приём подтверждён
 * разбором чужих редакторов в docs/research/prior-art.md — у moveable
 * ручки тоже соседи редактируемого узла, а не его потомки.
 *
 * Координаты приходят в пикселях контейнера, уже переведённые из координат
 * сцены. Благодаря этому ручка остаётся одного размера при любом масштабе:
 * будь она внутри сцены, при вписывании в узкое окно она сжалась бы вместе
 * с ней и стала бы непопадаемой.
 */
import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';

import type { ResizeHandle } from './transform.js';

/** Что схвачено указателем. Перетаскивание самого элемента идёт мимо ручек. */
export type Grip = ResizeHandle | 'rotate';

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

export interface OverlayProps {
  /** null — выделения нет, рисовать нечего. */
  frame: Frame | null;
  /**
   * Рисовать ли ручки. `false` при множественном выделении: тянуть общую
   * рамку пока нечем — изменение размера пачки потребовало бы масштабировать
   * каждого относительно этой рамки, а своей геометрии у неё нет.
   *
   * Ручки, нарисованные без действия за ними, хуже отсутствующих: автор
   * потянет и решит, что редактор сломан.
   */
  showHandles: boolean;
  onGripDown: (grip: Grip, event: ReactPointerEvent<HTMLElement>) => void;
}

/** Ручки по краям. Порядок задаёт порядок в DOM и ни на что больше не влияет. */
const HANDLES: readonly { grip: ResizeHandle; x: number; y: number; cursor: string }[] = [
  { grip: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { grip: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { grip: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { grip: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { grip: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { grip: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { grip: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { grip: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

export function Overlay({ frame, showHandles, onGripDown }: OverlayProps): ReactElement | null {
  if (!frame) return null;

  return (
    <div
      className="ed-frame"
      data-testid="selection-frame"
      style={{
        left: `${frame.left}px`,
        top: `${frame.top}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
        // Тот же поворот вокруг центра, что применяет к элементу applyElement.
        // Считать вместо этого описанный прямоугольник нельзя: ручки разъехались
        // бы с элементом тем сильнее, чем больше угол.
        transform: frame.rotation ? `rotate(${frame.rotation}deg)` : undefined,
      }}
    >
      {showHandles ? (
        <div
          className="ed-grip ed-grip-rotate"
          data-grip="rotate"
          onPointerDown={(event) => onGripDown('rotate', event)}
        />
      ) : null}
      {(showHandles ? HANDLES : []).map(({ grip, x, y, cursor }) => (
        <div
          key={grip}
          className="ed-grip"
          data-grip={grip}
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, cursor }}
          onPointerDown={(event) => onGripDown(grip, event)}
        />
      ))}
    </div>
  );
}

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
  /**
   * Высота ПОЛОТНА, в котором живёт рамка, в тех же пикселях контейнера.
   *
   * Лежит рядом с рамкой, а не отдельным состоянием, намеренно: обе величины
   * снимаются одним замером в `syncFrame`, и разъехаться им нельзя. Нужна
   * ровно затем, чтобы решить, помещается ли ручка поворота под рамкой.
   */
  canvasHeight: number;
}

export interface OverlayProps {
  /** null — выделения нет, рисовать нечего. */
  frame: Frame | null;
  /**
   * Бледная рамка группы, пока автор внутри неё (Сессия 36, решение
   * владельца). `null` или `undefined` — автор снаружи, не рисовать.
   *
   * Отдельная величина, а не производная от `frame`: `frame` — это рамка
   * ВЫДЕЛЕННОГО (обычно ребёнка группы), а эта — рамка САМОЙ группы, и они
   * почти всегда разного размера.
   */
  groupFrame?: Frame | null;
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

/**
 * Насколько ручка поворота отстоит от рамки — то же число, что в `styles.ts`
 * у `.ed-grip-rotate` (`top: -26px`). Дублируется намеренно: CSS не умеет
 * спросить «а помещаюсь ли я», и решение о переносе принимается здесь.
 */
const ROTATE_GAP = 26;

/** Где рисовать ручку поворота относительно рамки. */
type RotateSide = 'above' | 'below' | 'inside';

/**
 * Ручка поворота ищет себе место (Сессия 34).
 *
 * До этого она стояла на `top: -26px` безусловно, и нажать её было нельзя
 * вовсе. Замер в живом Chromium (окно 1280x800, фикстура two-gates): область
 * холста высотой 84 px, рамка на 127.8, ручка на 96.8 — то есть ВЫШЕ верха
 * области, и `elementFromPoint` в её центре отдавал `div.ed-propbar`.
 * Ни ошибки, ни предупреждения: поворот через числовое поле работал,
 * недостижима была именно ручка.
 *
 * Порядок мест не произволен, у каждого своя причина.
 *
 * СВЕРХУ — как было и как привычно по другим редакторам. Годится, когда над
 * рамкой есть `ROTATE_GAP` пикселей ПОЛОТНА. Именно полотна, а не окна:
 * при вписывании они совпадают, а при увеличении `frame.top` только растёт,
 * и ручка остаётся внутри прокручиваемой области — доехать до неё можно.
 *
 * СНИЗУ — когда сверху места нет. Прокрутка несимметрична: к отрицательным
 * координатам браузер не прокручивает вовсе, а вниз — прокручивает.
 * Но и снизу место надо проверять: у элемента во весь экран рамка равна
 * полотну, и ручка под ней уезжает за пределы области. Замерено на
 * `demo/bg`: ручка на y=346 при нижнем крае области 320, `elementFromPoint`
 * отдаёт `div.ed-zoom-strip`. То есть один только перенос вниз этот случай
 * НЕ лечит — что и нашлось прогоном, а не рассуждением.
 *
 * ВНУТРИ — последнее средство, и оно безопасно по построению. Сюда попадают
 * только те рамки, у которых нет места ни сверху, ни снизу, а это значит
 * `frame.height > canvasHeight - 2 * ROTATE_GAP`, то есть рамка почти во всё
 * полотно. Такая рамка заведомо выше `ROTATE_GAP`, и ручка внутри неё
 * не сталкивается ни с `n`, ни с `s`.
 */
function rotateSide(frame: Frame): RotateSide {
  if (frame.top >= ROTATE_GAP) return 'above';
  if (frame.top + frame.height + ROTATE_GAP <= frame.canvasHeight) return 'below';
  return 'inside';
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

export function Overlay({ frame, groupFrame, showHandles, onGripDown }: OverlayProps): ReactElement | null {
  if (!frame && !groupFrame) return null;

  return (
    <>
      {/*
        Рамка группы рисуется ПЕРВОЙ — то есть НИЖЕ рамки выделения в порядке
        отрисовки: ни у одной, ни у другой нет своего z-index, а более поздний
        узел в DOM ложится поверх более раннего. Своих ручек у неё нет —
        рамка группы только показывает контекст, тянуть за неё нечем.
      */}
      {groupFrame ? (
        <div
          className="ed-group-frame"
          data-testid="group-frame"
          style={{
            left: `${groupFrame.left}px`,
            top: `${groupFrame.top}px`,
            width: `${groupFrame.width}px`,
            height: `${groupFrame.height}px`,
            transform: groupFrame.rotation ? `rotate(${groupFrame.rotation}deg)` : undefined,
          }}
        />
      ) : null}
      {frame ? <SelectionFrame frame={frame} showHandles={showHandles} onGripDown={onGripDown} /> : null}
    </>
  );
}

function SelectionFrame({
  frame,
  showHandles,
  onGripDown,
}: {
  frame: Frame;
  showHandles: boolean;
  onGripDown: (grip: Grip, event: ReactPointerEvent<HTMLElement>) => void;
}): ReactElement {
  const side = rotateSide(frame);

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
          className={
            side === 'above' ? 'ed-grip ed-grip-rotate' : `ed-grip ed-grip-rotate ed-grip-rotate--${side}`
          }
          data-grip="rotate"
          data-rotate-side={side}
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

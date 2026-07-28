/**
 * Полоса меток под волной: анимации и гейты.
 *
 * Компонент презентационный. Он получает метки с УЖЕ разрешёнными секундами
 * и отдаёт наружу новую секунду при перетаскивании. Решение, к чему привязать
 * метку — к слову или к секундам, — принимает чистый модуль marks.ts, потому
 * что это правило продукта (инвариант №10), а не свойство интерфейса.
 *
 * Отдельной полосой, а не поверх волны: по волне тащат головку, и метка,
 * лежащая сверху, отбирала бы у перемотки половину нажатий.
 */
import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { MarkKind } from '../state/project.js';

export interface Mark {
  readonly kind: MarkKind;
  readonly id: string;
  /** Момент метки в секундах — уже разрешённый из TimeRef. */
  readonly seconds: number;
  /** Привязана к слову, а не к секундам. Видно по значку. */
  readonly onWord: boolean;
  readonly title: string;
}

export interface MarksLaneProps {
  marks: readonly Mark[];
  durationSeconds: number;
  selected: { kind: MarkKind; id: string } | undefined;
  onSelect: (kind: MarkKind, id: string) => void;
  /**
   * Правка момента метки жестом. Как и `StageView.onElementChange`, вызывается
   * многократно за один жест — коммит-точку ставит `onMoveEnd` на `pointerup`
   * (срез 2: перетаскивание метки, как и перетаскивание элемента, обязано
   * стать ОДНИМ шагом истории, а не одним на каждый `pointermove`).
   */
  onMove: (kind: MarkKind, id: string, seconds: number) => void;
  /** Жест перетаскивания метки завершён — точка коммита истории. */
  onMoveEnd: () => void;
}

export function MarksLane({
  marks,
  durationSeconds,
  selected,
  onSelect,
  onMove,
  onMoveEnd,
}: MarksLaneProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ kind: MarkKind; id: string; pointerId: number } | null>(null);

  const secondsAt = useCallback(
    (clientX: number): number => {
      const lane = laneRef.current;
      if (!lane || durationSeconds <= 0) return 0;
      // Прямоугольник меряется заново: страницу могли прокрутить прямо в жесте.
      const rect = lane.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, ratio)) * durationSeconds;
    },
    [durationSeconds],
  );

  const handleDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, mark: Mark): void => {
      // Иначе нажатие уйдёт в полосу и начнёт перемотку головки.
      event.stopPropagation();
      draggingRef.current = { kind: mark.kind, id: mark.id, pointerId: event.pointerId };
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(mark.kind, mark.id);
    },
    [onSelect],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      const dragging = draggingRef.current;
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      onMove(dragging.kind, dragging.id, secondsAt(event.clientX));
    },
    [onMove, secondsAt],
  );

  const handleUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      const wasDragging = draggingRef.current !== null;
      draggingRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // Клик без движения (простое выделение метки) тоже проходит через
      // handleDown/handleUp, но onMove ни разу не звался — коммитить нечего.
      // onMoveEnd на стороне истории всё равно безопасен как no-op, но
      // проверка здесь дешевле лишнего вызова через компонент выше.
      if (wasDragging) onMoveEnd();
    },
    [onMoveEnd],
  );

  return (
    <div className="ed-marks" ref={laneRef} data-testid="marks-lane">
      {marks.map((mark) => {
        const isSelected = selected?.kind === mark.kind && selected.id === mark.id;
        return (
          <button
            type="button"
            key={`${mark.kind}:${mark.id}`}
            className={[
              'ed-mark',
              `ed-mark-${mark.kind}`,
              mark.onWord ? 'ed-mark-word' : 'ed-mark-seconds',
              isSelected ? 'ed-mark-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left: `${(mark.seconds / durationSeconds) * 100}%` }}
            data-testid={`mark-${mark.kind}-${mark.id}`}
            data-on-word={mark.onWord ? '1' : '0'}
            title={mark.title}
            aria-label={mark.title}
            onPointerDown={(event) => handleDown(event, mark)}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
          >
            {/* Ромб у анимации, столбик у гейта: род метки должен читаться
                с одного взгляда, а не по цвету — цвет уходит на выделение. */}
            {mark.kind === 'cue' ? '◆' : '▮'}
          </button>
        );
      })}
    </div>
  );
}

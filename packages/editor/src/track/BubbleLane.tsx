/**
 * Полоса капли: отрезки «моё» клипами, которые тянут за края.
 *
 * Компонент ПРЕЗЕНТАЦИОННЫЙ. Он получает отрезки с уже разрешёнными секундами
 * и отдаёт наружу новые секунды; во что их превратить — в слово или в число —
 * решает `marks.ts`, потому что это инвариант №10, а не свойство разметки.
 * Куда край может встать, решает `spans.ts`, потому что это правило продукта.
 * Здесь остаётся только жест.
 *
 * Пустое место между клипами читается САМО: там распоряжается зритель,
 * и подписывать это нечем (`bubble.md` §3). Поэтому фона у промежутков нет
 * и «ничьей» плашки не рисуется — иначе на полосе оказалось бы вдвое больше
 * прямоугольников, чем смыслов.
 *
 * → docs/design/bubble.md §3, ADR-032
 */
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import { clampEdge, clampWhole, placeNew, type SpanEdge, type SpanRange } from './spans.js';
import { ratioToX } from './zoom.js';

export interface BubbleLaneProps {
  /** Отрезки этой капли, по порядку, с разрешёнными секундами. */
  readonly spans: readonly SpanRange[];
  readonly durationSeconds: number;
  readonly canvasWidthPx: number;
  readonly height: number;
  readonly style?: CSSProperties;
  /** Автор нарисовал новый отрезок тягой по свободному месту. */
  readonly onCreate: (range: SpanRange) => void;
  /** Живое событие тяги: приходит на каждый `pointermove`. */
  readonly onEdit: (index: number, range: SpanRange) => void;
  /** Жест окончен — точка коммита истории. */
  readonly onEditEnd: () => void;
  readonly onRemove: (index: number) => void;
}

/** Что именно тянут. */
type Drag =
  | { readonly kind: 'create'; readonly pointerId: number; readonly anchorSeconds: number }
  | { readonly kind: 'edge'; readonly pointerId: number; readonly index: number; readonly edge: SpanEdge }
  | {
      readonly kind: 'body';
      readonly pointerId: number;
      readonly index: number;
      /** Насколько курсор отстоял от начала отрезка в момент захвата. */
      readonly grabSeconds: number;
    };

export function BubbleLane({
  spans,
  durationSeconds,
  canvasWidthPx,
  height,
  style,
  onCreate,
  onEdit,
  onEditEnd,
  onRemove,
}: BubbleLaneProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // Черновик существует только на время рисования: отрезка ещё нет ни в схеме,
  // ни в истории, и класть его в проект на каждый `pointermove` значило бы
  // засорить историю кадрами жеста. У готовых отрезков черновика нет —
  // они правятся через `onEdit`, то есть через единственную правду.
  const [draft, setDraft] = useState<SpanRange | null>(null);

  const secondsAt = useCallback(
    (clientX: number): number => {
      const lane = laneRef.current;
      if (!lane || durationSeconds <= 0) return 0;
      const rect = lane.getBoundingClientRect();
      // Координатные пространства не смешиваем: `clientX` и `getBoundingClientRect`
      // оба экранные, `offsetLeft` и `clientWidth` — нет.
      const ratio = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(1, ratio)) * durationSeconds;
    },
    [durationSeconds],
  );

  const capture = (event: ReactPointerEvent<HTMLElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const startCreate = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Только основная кнопка: правая открывает меню браузера, и рисовать
    // ею отрезок значило бы соревноваться с ним за жест.
    if (event.button !== 0) return;
    /*
     * ВСПЛЫТИЕ ГАСИТСЯ, как у startEdge и startBody рядом.
     *
     * До Сессии 55 без этого обходилось: перемотка висела только на линейке
     * и на волне, и жест по полосе капли до неё не всплывал. Теперь один
     * обработчик перемотки стоит на ПОЛОТНЕ, общем для всех полос, и он
     * безусловно берёт setPointerCapture на себя — то есть отбирает захват
     * указателя у полосы капли посреди её жеста.
     *
     * Замер: после pointerdown+move захват у `.ed-lane-bodies`, а не
     * у `bubble-lane`; новый отрезок не дорисовывается — было 2, осталось 2.
     * Ни ошибки, ни предупреждения: это тот же класс, что записан в проекте
     * про setPointerCapture на сцене, съедающий клик по кнопке внутри неё.
     */
    event.stopPropagation();
    capture(event);
    const anchorSeconds = secondsAt(event.clientX);
    dragRef.current = { kind: 'create', pointerId: event.pointerId, anchorSeconds };
    setDraft(null);
  }, [secondsAt]);

  const startEdge = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, index: number, edge: SpanEdge) => {
      if (event.button !== 0) return;
      // Гасим всплытие: иначе тот же жест начал бы ещё и рисование нового
      // отрезка на полосе под клипом.
      event.stopPropagation();
      capture(event);
      dragRef.current = { kind: 'edge', pointerId: event.pointerId, index, edge };
    },
    [],
  );

  const startBody = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, index: number) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      capture(event);
      const span = spans[index];
      if (!span) return;
      dragRef.current = {
        kind: 'body',
        pointerId: event.pointerId,
        index,
        grabSeconds: secondsAt(event.clientX) - span.fromSeconds,
      };
    },
    [secondsAt, spans],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const seconds = secondsAt(event.clientX);

      if (drag.kind === 'create') {
        setDraft(placeNew(spans, drag.anchorSeconds, seconds, durationSeconds) ?? null);
        return;
      }

      const span = spans[drag.index];
      if (!span) return;

      if (drag.kind === 'edge') {
        const value = clampEdge(spans, drag.index, drag.edge, seconds, durationSeconds);
        onEdit(drag.index, drag.edge === 'from'
          ? { fromSeconds: value, toSeconds: span.toSeconds }
          : { fromSeconds: span.fromSeconds, toSeconds: value });
        return;
      }

      onEdit(drag.index, clampWhole(spans, drag.index, seconds - drag.grabSeconds, durationSeconds));
    },
    [durationSeconds, onEdit, secondsAt, spans],
  );

  const handleUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;

      if (drag.kind === 'create') {
        // Черновик берётся из состояния, а не пересчитывается по последнему
        // событию: `pointerup` может прийти без предшествующего `pointermove`
        // (щелчок без движения), и пересчёт дал бы отрезок нулевой длины.
        if (draft) onCreate(draft);
        setDraft(null);
        return;
      }

      onEditEnd();
    },
    [draft, onCreate, onEditEnd],
  );

  const box = (range: SpanRange): CSSProperties => {
    const left = ratioToX(range.fromSeconds / durationSeconds, canvasWidthPx);
    const right = ratioToX(range.toSeconds / durationSeconds, canvasWidthPx);
    return { left: `${left}px`, width: `${Math.max(1, right - left)}px` };
  };

  return (
    <div
      ref={laneRef}
      className="ed-bubble-lane"
      style={{ height: `${height}px`, ...style }}
      data-testid="bubble-lane"
      onPointerDown={startCreate}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {spans.map((span, index) => (
        <div
          // Ключ по положению, а не по индексу: отрезки не пересекаются,
          // поэтому начало уникально, и React не перепутает клипы местами,
          // когда автор нарисует новый левее прежних.
          key={`${span.fromSeconds}-${span.toSeconds}`}
          className="ed-span"
          style={box(span)}
          data-testid="bubble-span"
          title="Здесь каплей распоряжается автор"
          onPointerDown={(event) => startBody(event, index)}
        >
          <span
            className="ed-span-grip ed-span-grip-from"
            data-testid="bubble-span-grip-from"
            onPointerDown={(event) => startEdge(event, index, 'from')}
          />
          <span className="ed-span-label">моё</span>
          <button
            type="button"
            className="ed-span-remove"
            data-testid="bubble-span-remove"
            aria-label="Убрать отрезок «моё»"
            // Гасим ИМЕННО `pointerdown`, а не `click`: захват указателя,
            // взятый полосой, переадресовал бы последующий `click` ей, и кнопка
            // молча перестала бы работать. В проекте это уже измерено
            // на сцене редактора — ни ошибки, ни предупреждения.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onRemove(index)}
          >
            ×
          </button>
          <span
            className="ed-span-grip ed-span-grip-to"
            data-testid="bubble-span-grip-to"
            onPointerDown={(event) => startEdge(event, index, 'to')}
          />
        </div>
      ))}

      {draft && (
        <div className="ed-span ed-span-draft" style={box(draft)} data-testid="bubble-span-draft" />
      )}
    </div>
  );
}

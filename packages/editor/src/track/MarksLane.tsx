/**
 * Полоса меток под волной: гейты и слайды.
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
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type RefObject,
} from 'react';

import type { MarkKind } from '../state/project.js';
import type { MarkAnchor } from './marks.js';
import { canvasWidth, ratioToX, type ZoomStep } from './zoom.js';

export interface Mark {
  readonly kind: MarkKind;
  readonly id: string;
  /** Момент метки в секундах — уже разрешённый из TimeRef. */
  readonly seconds: number;
  /**
   * Состояние якоря (`product.md` §4): привязан, зафиксирован вручную или
   * потерял своё слово. Раньше здесь стояло `onWord: boolean` — двух значений
   * хватало, пока состояний было два. Сирота не «не на слове»: она на слове,
   * просто на угаданном, и булев признак её либо приравнял бы к секундной
   * метке, либо к нормально привязанной. Оба ответа неверны.
   */
  readonly anchor: MarkAnchor;
  /**
   * Сколько сцена ЕДЕТ к этой метке, секунды. Ноль — приходит срезом.
   *
   * Окно движения кончается на метке (ADR-020), поэтому рисуется хвостом
   * ПЕРЕД ромбом. Автор видит не только «где снимок», но и «сколько едет»:
   * без этого расстановка слайдов вплотную молча укорачивает переходы.
   */
  readonly morphSeconds: number;
  /**
   * Потолок продолжительности перехода — расстояние до ПРЕДЫДУЩЕЙ метки
   * (ADR-020), то же число, что `Editor.selectedSlideGapSeconds` считает для
   * ВЫДЕЛЕННОГО слайда, но здесь оно есть у КАЖДОЙ метки: ручка стыка тянет
   * ту метку, под курсором которой начался жест, а не обязательно выбранную.
   * У гейта ехать некуда, и число здесь ничем не используется (ручка стыка
   * рисуется только у слайдов с `morphSeconds > 0` — см. рендер ниже).
   */
  readonly gapSeconds: number;
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
  /**
   * Живое событие ручки стыка (Задача 5): каждое движение при перетаскивании
   * левого конца хвоста. Имя нарочно НЕ совпадает с `MarkPanel.onSetSlideTransitionSeconds` —
   * там обработчик знает выбранный слайд и id не принимает; здесь ручка может
   * тянуть метку, которая сейчас не выделена. Оба зовут одно и то же действие
   * `setSlideTransitionSeconds` (`Editor.tsx`) — разделение в именах, а не в сути.
   */
  onTransitionSecondsLive: (id: string, seconds: number) => void;
  /** Жест ручки стыка завершён — точка коммита истории, как `onMoveEnd`. */
  onTransitionSecondsCommit: () => void;
  /** Ступень масштаба дорожки (`zoom.ts`) — та же, что и у волны сверху. */
  zoom: ZoomStep;
  /**
   * Контейнер прокрутки полосы меток. Заводится и передаётся сверху
   * (`TrackView`), а не внутри самого компонента: волна ведёт прокрутку,
   * полоса меток повторяет её `scrollLeft` — синхронизация односторонняя
   * (track-zoom.md §3 у полосы меток), и вести её может только тот, кто
   * видит обе стороны разом.
   */
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}

export function MarksLane({
  marks,
  durationSeconds,
  selected,
  onSelect,
  onMove,
  onMoveEnd,
  onTransitionSecondsLive,
  onTransitionSecondsCommit,
  zoom,
  scrollContainerRef,
}: MarksLaneProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ kind: MarkKind; id: string; pointerId: number } | null>(null);
  // Захватывает markSeconds/gapSeconds жеста ЦЕЛИКОМ на pointerdown: move/up
  // не ищут метку заново по id в каждом кадре жеста, тем же приёмом, каким
  // draggingRef выше хранит kind/id, а не читает их из marks по ходу жеста.
  const draggingTransitionRef = useRef<{
    id: string;
    pointerId: number;
    markSeconds: number;
    gapSeconds: number;
  } | null>(null);
  const [laneWidth, setLaneWidth] = useState(0);

  // Тот же приём, что в TrackView: наблюдатель стоит на КОНТЕЙНЕРЕ прокрутки,
  // а не на полотне (.ed-marks) — полотно само раздувается от zoom, и
  // наблюдатель на нём мерил бы то, что сам же раздувает.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) throw new Error('MarksLane: контейнер прокрутки не смонтирован');
    const measure = (): void => setLaneWidth(container.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollContainerRef]);

  // Полотно полосы меток шириной laneWidth × zoom — та же функция, что и
  // у волны, значением совпадает с ней по построению (оба контейнера —
  // родные дети одной колонки одинаковой ширины).
  const canvasWidthPx = canvasWidth(laneWidth, zoom);

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

  /**
   * Ручка стыка (Задача 5): тянет ЛЕВЫЙ конец хвоста, а метка (правый конец,
   * ромб) стоит на месте — окно перехода кончается НА метке (ADR-020), значит
   * удлинение окна двигает НАЧАЛО назад во времени, а не саму метку.
   * Тот же расклад из трёх обработчиков, что у handleDown/handleMove/handleUp
   * выше, только семейство действия другое: не момент метки, а длительность.
   */
  const handleTransitionDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, mark: Mark): void => {
      // Иначе нажатие уйдёт в полосу и начнёт перемотку головки — та же
      // причина, что у handleDown выше.
      event.stopPropagation();
      draggingTransitionRef.current = {
        id: mark.id,
        pointerId: event.pointerId,
        markSeconds: mark.seconds,
        gapSeconds: mark.gapSeconds,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      onSelect(mark.kind, mark.id);
    },
    [onSelect],
  );

  const handleTransitionMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      const dragging = draggingTransitionRef.current;
      if (!dragging || dragging.pointerId !== event.pointerId) return;
      // Продолжительность — расстояние от точки указателя НАЗАД до метки,
      // а не сама точка: указатель стоит на НАЧАЛЕ окна, метка — на конце.
      const candidate = dragging.markSeconds - secondsAt(event.clientX);
      // Потолок — Math.max(0, Math.min(seconds, gapSeconds)): физика та же,
      // что у TransitionSecondsControl в MarkPanel.tsx (ADR-020).
      onTransitionSecondsLive(dragging.id, Math.max(0, Math.min(candidate, dragging.gapSeconds)));
    },
    [onTransitionSecondsLive, secondsAt],
  );

  const handleTransitionUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      const wasDragging = draggingTransitionRef.current !== null;
      draggingTransitionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (wasDragging) onTransitionSecondsCommit();
    },
    [onTransitionSecondsCommit],
  );

  return (
    <div className="ed-marks-scroll" ref={scrollContainerRef}>
      <div
        className="ed-marks"
        ref={laneRef}
        style={{ width: `${canvasWidthPx}px` }}
        data-testid="marks-lane"
      >
        {/* Хвосты и их ручки рисуются ДО кнопок меток, чтобы ромб оставался
            сверху и ловил нажатие (Задача 6): он орган управления, а хвост
            раньше был картинкой. Хвост сам теперь тоже кликабелен — клик
            без перетаскивания выделяет метку (Задача 6), а ручка на его
            левом конце тянет длительность перехода (Задача 5); это два
            разных элемента ровно потому, что жесты у них разные. */}
        {marks
          .filter((mark) => mark.morphSeconds > 0)
          .map((mark) => {
            const tailLeft = ratioToX((mark.seconds - mark.morphSeconds) / durationSeconds, canvasWidthPx);
            const tailWidth = ratioToX(mark.morphSeconds / durationSeconds, canvasWidthPx);
            return (
              <Fragment key={`tail:${mark.kind}:${mark.id}`}>
                <button
                  type="button"
                  className="ed-mark-tail"
                  data-testid={`mark-tail-${mark.id}`}
                  title={mark.title}
                  aria-label={mark.title}
                  style={{ left: `${tailLeft}px`, width: `${tailWidth}px` }}
                  onClick={() => onSelect(mark.kind, mark.id)}
                />
                {/* Ручка на ЛЕВОМ конце хвоста — шире хвоста и вылезает
                    влево (Задача 5): при ×1 хвост сам по себе всего 7.2px,
                    непопадаемая мишень, ради этого и затевалась вся задача. */}
                <button
                  type="button"
                  className="ed-mark-transition-handle"
                  data-testid={`mark-transition-${mark.id}`}
                  title="Потянуть — изменить длительность перехода"
                  aria-label={`Длительность перехода к метке «${mark.id}»`}
                  style={{ left: `${tailLeft}px` }}
                  onPointerDown={(event) => handleTransitionDown(event, mark)}
                  onPointerMove={handleTransitionMove}
                  onPointerUp={handleTransitionUp}
                  onPointerCancel={handleTransitionUp}
                />
              </Fragment>
            );
          })}
        {marks.map((mark) => {
          const isSelected = selected?.kind === mark.kind && selected.id === mark.id;
          return (
            <button
              type="button"
              key={`${mark.kind}:${mark.id}`}
              className={[
                'ed-mark',
                `ed-mark-${mark.kind}`,
                `ed-mark-${mark.anchor}`,
                isSelected ? 'ed-mark-selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: `${ratioToX(mark.seconds / durationSeconds, canvasWidthPx)}px` }}
              data-testid={`mark-${mark.kind}-${mark.id}`}
              data-anchor={mark.anchor}
              title={mark.title}
              aria-label={mark.title}
              onPointerDown={(event) => handleDown(event, mark)}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
            >
              {/* Ромб у слайда, столбик у гейта: род метки должен читаться
                  с одного взгляда, а не по цвету — цвет уходит на выделение. */}
              {mark.kind === 'slide' ? '◆' : '▮'}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { MarkKind } from '../state/project.js';
import type { MarkAnchor } from './marks.js';
import { ratioToX } from './zoom.js';
import { secondsText } from '../timeText.js';
import { assignMarkRows } from './markRows.js';

/**
 * Размер метки и шаг ряда — числа раскладки, а не оформления.
 *
 * Ширина совпадает с `.ed-mark` в styles.ts (18) намеренно: раскладка
 * считает перекрытие по тем же прямоугольникам, которые рисует браузер.
 * Разойдись эти числа — функция разводила бы метки, которые на экране
 * не пересекаются, и оставляла бы вместе те, что пересекаются.
 *
 * Шаг 12 и два ряда выбраны замером, а не на глаз: метка 18 в ряду 34
 * стоит с `top: 8`. Сдвиг рядов на -6 и +6 даёт прямоугольники 2..20
 * и 14..32 — оба внутри полосы, центры разнесены на 12 px, и точка
 * в центре каждого достаётся ЕЙ, а не соседке.
 */
const MARK_SIZE = 18;
const MARK_ROWS = 2;
const ROW_STEP = 12;
/** Верхний ряд поднят на половину шага, чтобы полоса осталась уравновешенной. */
const ROW_LIFT = -ROW_STEP / 2;

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
  /**
   * Ширина полотна в пикселях (`zoom.ts: canvasWidth`), посчитанная
   * наверху (`TrackView`). Полоса меток стоит теперь в ОБЩЕМ контейнере
   * прокрутки со всеми остальными полосами (каркас, задача 2.1) — своего
   * `ResizeObserver` и своего контейнера у неё больше нет, и мерить ширину
   * самой было бы второй правдой о том же числе.
   */
  canvasWidthPx: number;
  /** Высота тела меток на текущей ступени (`tiers.ts: marksBodyHeight`). */
  heightPx: number;
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
  canvasWidthPx,
  heightPx,
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

  const rowOf = ((): ReadonlyMap<string, number> => {
    const merged = new Map<string, number>();
    for (const kind of ['slide', 'gate'] as const) {
      const rows = assignMarkRows(
        marks
          .filter((mark) => mark.kind === kind)
          .map((mark) => ({
            key: `${mark.kind}:${mark.id}`,
            x: ratioToX(mark.seconds / durationSeconds, canvasWidthPx),
          })),
        MARK_SIZE,
        MARK_ROWS,
      );
      for (const [key, row] of rows) merged.set(key, row);
    }
    return merged;
  })();

  /** Сдвиг метки вниз от её ряда — в пикселях. */
  const rowShift = (mark: Mark): number =>
    ROW_LIFT + (rowOf.get(`${mark.kind}:${mark.id}`) ?? 0) * ROW_STEP;

  return (
    <div
      className="ed-marks"
      ref={laneRef}
      style={{ width: `${canvasWidthPx}px`, height: `${heightPx}px` }}
      data-testid="marks-lane"
    >
      {/* Хвосты и их ручки рисуются ДО кнопок меток, чтобы ромб оставался
          сверху и ловил нажатие (Задача 6): он орган управления, а хвост
          раньше был картинкой. Хвост сам теперь тоже кликабелен — клик
          без перетаскивания выделяет метку (Задача 6), а ручка на его
          левом конце тянет длительность перехода (Задача 5); это два
          разных элемента ровно потому, что жесты у них разные. */}
      {/*
        РАЗВЕДЕНИЕ БЛИЗКИХ МЕТОК ПО РЯДАМ (Сессия 55, долг от 20.08.2026).

        Считается на каждую отрисовку, потому что зависит от ширины полотна:
        та меняется и от окна, и от масштаба дорожки. Запомненная раскладка
        разошлась бы с экраном ровно тогда, когда автор потянул за край.

        Слайды и остановки раскладываются ОТДЕЛЬНО: они стоят в разных рядах
        полосы (top 8 и top 43) и перекрыть друг друга не могут — общая
        раскладка развела бы их без нужды.
      */}
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
                style={{
                  left: `${tailLeft}px`,
                  width: `${tailWidth}px`,
                  // Хвост едет вместе со своей меткой: он показывает окно
                  // движения ИМЕННО к ней, и оставшись на месте, указывал бы
                  // на соседку.
                  transform: `translateY(${rowShift(mark)}px)`,
                }}
                onClick={() => onSelect(mark.kind, mark.id)}
              />
              {/* Ручка на ЛЕВОМ конце хвоста — шире хвоста и вылезает
                  влево (Задача 5): при ×1 хвост сам по себе всего 7.2px,
                  непопадаемая мишень, ради этого и затевалась вся задача. */}
              {/* Имя ручки называет метку ВРЕМЕНЕМ, а не ключом схемы:
                  «node-1-slide-3» автор не заводил (Сессия 47, Задача 5).
                  Имя для тех, кто ручку не видит, обязано указывать на то же,
                  что видит зрячий, — а видно время. */}
              <button
                type="button"
                className="ed-mark-transition-handle"
                data-testid={`mark-transition-${mark.id}`}
                title="Потянуть — изменить длительность перехода"
                aria-label={`Длительность перехода к метке на ${secondsText(mark.seconds)}`}
                style={{ left: `${tailLeft}px`, transform: `translateY(${rowShift(mark)}px)` }}
                onPointerDown={(event) => handleTransitionDown(event, mark)}
                onPointerMove={handleTransitionMove}
                onPointerUp={handleTransitionUp}
                onPointerCancel={handleTransitionUp}
              />
            </Fragment>
          );
        })}
      {marks.map((mark, index) => {
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
            /*
              ПОРЯДОК НАЛОЖЕНИЯ: РАННЯЯ МЕТКА ВЫШЕ ПОЗДНЕЙ.

              Соседние метки перекрываются — механизма разведения у дорожки
              нет (см. docs/debt.md). Замер 20.08.2026 на фикстуре demo:
              при окне 1920 семь перекрывающихся пар, при 1280 восемь.

              При естественном порядке DOM поздняя метка ложится поверх
              ранней и накрывает ЕЁ ЦЕНТР: `elementFromPoint` в центре
              `slide-2` отдавал `slide-3`, и выбрать раннюю метку было
              нельзя вовсе — ни автору, ни тесту.

              Обратный порядок это чинит по построению. Метка шириной 18
              и перекрытие в 8: центр ранней лежит левее левого края поздней,
              а центр поздней — правее правого края ранней. Значит при верхней
              РАННЕЙ свободны центры обеих, а при верхней поздней — только её.

              Перекрытие больше половины ширины (9 px) так не лечилось,
              и это было записано долгом. ДОЛГ ЗАКРЫТ В СЕССИИ 55: близкие
              метки разводятся по двум рядам внутри полосы (`markRows.ts`),
              и их центры перестают закрывать друг друга даже при полном
              наложении прямоугольников. Порядок наложения оставлен —
              он по-прежнему верен и дешевле любого другого при перекрытии
              в пару пикселей, где ряды разводить незачем.

              Замер до разведения, фикстура demo: при окне 1280 недостижимы
              были СЕМЬ меток из шестнадцати.

              Выделенная метка поднимается над всеми: она единственная,
              чью рамку автор обязан видеть целиком.
            */
            style={{
              left: `${ratioToX(mark.seconds / durationSeconds, canvasWidthPx)}px`,
              // Сдвиг ряда — трансформацией, а не правкой `top`: `top` задан
              // в стилях и разный у слайдов и остановок, а трансформация
              // ложится поверх любого из них одним правилом. Плюс инвариант
              // №8: двигаем `transform`, а не геометрию.
              transform: `translateY(${rowShift(mark)}px)`,
              zIndex: isSelected ? marks.length + 1 : marks.length - index,
            }}
            data-testid={`mark-${mark.kind}-${mark.id}`}
            data-anchor={mark.anchor}
            /* Род и имя метки — атрибутами ДАННЫХ, а не разбором testid.
               Меню правой кнопки над дорожкой узнаёт по ним, на что нажали,
               и предлагает действия этого предмета. Разбирать `data-testid`
               значило бы сделать имя для тестов частью работающей логики:
               переименовали бы его ради теста — и меню молча перестало бы
               узнавать метки. */
            data-mark-kind={mark.kind}
            data-mark-id={mark.id}
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
  );
}

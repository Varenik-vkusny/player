/**
 * Дорожка: волна, головка, перемотка мышью и строка транскрипта.
 *
 * Компонент презентационный. Он не грузит звук, не декодирует и не считает
 * пики — всё это делает Transport, который про React не знает. Сюда приходят
 * готовые числа, отсюда уходят вызовы transport.seek. Когда интерфейс будут
 * переписывать, выбросят этот файл, а не то, что умеет продукт.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { Word } from '@player/core';

import { plural, type PluralForms } from '../plural.js';
import type { MarkKind } from '../state/project.js';
import { nextOrphan } from './marks.js';
import { MarksLane, type Mark } from './MarksLane.js';
import type { TransportApi } from './useTransport.js';
import { Waveform } from './Waveform.js';
import { canvasWidth, largestFittingZoom, zoomBlockedReason, zoomFits, ZOOM_STEPS, type ZoomStep } from './zoom.js';

/** Винительный падеж: «Проверьте 1 метку / 2 метки / 5 меток». */
const ORPHAN_MARKS: PluralForms = { one: 'метку', few: 'метки', many: 'меток' };

export interface TrackViewProps {
  transport: TransportApi;
  words: readonly Word[];
  marks: readonly Mark[];
  selectedMark: { kind: MarkKind; id: string } | undefined;
  onSelectMark: (kind: MarkKind, id: string) => void;
  onMoveMark: (kind: MarkKind, id: string, seconds: number) => void;
  /** Перетаскивание метки завершено — точка коммита истории (срез 2). */
  onMoveMarkEnd: () => void;
  /** Добавляет гейт на текущей позиции. */
  onAddGate: () => void;
  /** Живое событие ручки стыка (Задача 5) — пробрасывается в `MarksLane`. */
  onTransitionSecondsLive: (id: string, seconds: number) => void;
  /** Жест ручки стыка завершён — коммит истории, как `onMoveMarkEnd`. */
  onTransitionSecondsCommit: () => void;
}

/** Секунды в вид 01:23.4 — так короче и читается быстрее голых секунд. */
function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${rest.toFixed(1).padStart(4, '0')}`;
}

/** Шаг делений линейки: столько секунд, чтобы подписи не слипались. */
function tickStep(duration: number, width: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  // Примерно 90 пикселей на подпись — иначе они наезжают друг на друга.
  const wanted = (duration * 90) / Math.max(width, 1);
  return candidates.find((step) => step >= wanted) ?? candidates[candidates.length - 1]!;
}

export function TrackView({
  transport,
  words,
  marks,
  selectedMark,
  onSelectMark,
  onMoveMark,
  onMoveMarkEnd,
  onAddGate,
  onTransitionSecondsLive,
  onTransitionSecondsCommit,
}: TrackViewProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const laneScrollRef = useRef<HTMLDivElement>(null);
  const marksScrollRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  // Высота КАНВЫ волны (A1) — источник живой, а не константа 72: скролбар
  // полосы волны теперь виден (решение владельца 06.08.2026) и отнимает
  // высоту у clientHeight контейнера, а не у его offsetHeight, толщиной,
  // которая зависит от ОС и настроек (measured: 72 → 57 в живом Chrome).
  // 72 здесь — только запасное значение ДО первого замера ResizeObserver'ом.
  const [waveHeight, setWaveHeight] = useState(72);
  const [zoom, setZoom] = useState<ZoomStep>(1);
  const draggingRef = useRef(false);

  const { positionSeconds, durationSeconds, peaks, failure, isPlaying } = transport;

  // Ширина видимого окна нужна и канвасу, и переводу времени в пиксели —
  // но меряется она у КОНТЕЙНЕРА прокрутки, не у полотна (.ed-lane): при
  // масштабе больше ×1 полотно само раздувается от ширины по zoom, и
  // наблюдатель, поставленный на него, мерил бы то, что сам же раздувает
  // (docs/plans/2026-08-06-track-zoom.md, Задача 2, шаг 3). Наблюдателем,
  // а не по событию окна: дорожка меняет ширину и когда окно не трогали —
  // например, если рядом откроется панель.
  useLayoutEffect(() => {
    const container = laneScrollRef.current;
    if (!container) throw new Error('TrackView: контейнер прокрутки не смонтирован');
    const measure = (): void => {
      setWidth(container.clientWidth);
      // Тот же наблюдатель меряет и высоту (A1): clientHeight, а не константа,
      // потому что классический скролбар отнимает высоту именно у него, и
      // ResizeObserver по умолчанию наблюдает content-box — размер, который
      // скролбар как раз меняет при появлении/исчезновении.
      setWaveHeight(container.clientHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Полотно волны шириной laneWidth × zoom (track-zoom.md §2). При zoom === 1
  // совпадает с шириной контейнера — сегодняшний вид без изменений.
  const canvasWidthPx = canvasWidth(width, zoom);

  // Часть A: гашение кнопки (zoomBlockedReason ниже) останавливает только
  // ВЫБОР новой ступени — оно не спасает автора, который уже стоит на ×8
  // или ×16 и растягивает окно. `laneWidth × zoom` пересекает
  // MAX_CANVAS_WIDTH_PX в тот же кадр, и волна пропадает МОЛЧА (замер
  // в zoom.ts у largestFittingZoom). Проверка идёт при каждом изменении
  // ширины полосы: если активная ступень больше не помещается, опускаемся
  // на наибольшую, которая ещё помещается.
  useEffect(() => {
    if (zoomFits(width, zoom)) return;
    setZoom(largestFittingZoom(width));
  }, [width, zoom]);

  const progress = durationSeconds > 0 ? positionSeconds / durationSeconds : 0;

  // Прокрутка вслед за головкой (Задача 4). Проверка «видна ли головка»
  // обязана идти ПЕРЕД записью в scrollLeft: гнать прокрутку каждый кадр
  // воспроизведения отняло бы у автора возможность смотреть в другое место
  // дорожки во время игры звука. scrollIntoView здесь не годится — он
  // прокручивает и предков, то есть увёл бы всю страницу редактора; пишем
  // только в container.scrollLeft самого контейнера дорожки.
  useEffect(() => {
    const container = laneScrollRef.current;
    if (!container || durationSeconds <= 0) return;
    const headPx = progress * canvasWidthPx;
    const visibleStart = container.scrollLeft;
    const visibleEnd = visibleStart + container.clientWidth;
    if (headPx >= visibleStart && headPx <= visibleEnd) return;
    const maxScrollLeft = Math.max(0, canvasWidthPx - container.clientWidth);
    container.scrollLeft = Math.max(0, Math.min(headPx - container.clientWidth / 2, maxScrollLeft));
  }, [progress, canvasWidthPx, durationSeconds]);

  /** Экранная точка на дорожке → секунда. */
  const seekToPointer = useCallback(
    (clientX: number): void => {
      const lane = laneRef.current;
      if (!lane || durationSeconds <= 0) return;
      // Прямоугольник измеряется заново на каждое движение: полагаться
      // на запомненный нельзя — страницу могли прокрутить прямо в жесте.
      const rect = lane.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      transport.seek(Math.max(0, Math.min(1, ratio)) * durationSeconds);
    },
    [durationSeconds, transport],
  );

  const handleDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      if (draggingRef.current) seekToPointer(event.clientX);
    },
    [seekToPointer],
  );

  const handleUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const orphanCount = marks.filter((mark) => mark.anchor === 'orphan').length;

  const step = tickStep(durationSeconds, canvasWidthPx);
  const ticks: number[] = [];
  for (let t = 0; t <= durationSeconds; t += step) ticks.push(t);

  // Слово, которое звучит сейчас. Ищется линейно: сотня слов на дорожку,
  // а бинарный поиск здесь был бы преждевременной оптимизацией.
  const activeIndex = words.findIndex(
    (word) => positionSeconds >= word.start && positionSeconds < word.end,
  );

  return (
    <section className="ed-track" aria-label="Дорожка">
      <div className="ed-transport">
        <button
          type="button"
          className="ed-play"
          onClick={transport.toggle}
          disabled={Boolean(failure)}
          aria-label={isPlaying ? 'Пауза' : 'Играть'}
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <code className="ed-clock" data-testid="track-clock">
          {formatTime(positionSeconds)} / {formatTime(durationSeconds)}
        </code>
        {failure ? (
          // Причина показывается дословно. Пустая волна вместо неё
          // изображала бы тишину там, где на самом деле нет файла.
          <span className="ed-failure" role="status" data-testid="track-failure">
            Дорожка не загрузилась: {failure}
          </span>
        ) : null}

        {/* Ступени масштаба дорожки (track-zoom.md §§1, 8). Встают в эту же
            строку транспорта — новой строки по высоте они не заводят.

            A2: ступень, чьё полотно не поместится в канву браузера на
            текущей ширине окна (`zoomBlockedReason`, `zoom.ts`), ГАСНЕТ —
            остаётся в разметке с `aria-disabled` и причиной в `title`, а не
            исчезает и не ломается молча. Клик по ней — no-op: onClick сам
            проверяет ту же причину, `aria-disabled` — не `disabled`, кнопка
            должна остаться фокусируемой. */}
        <span className="ed-zoom" data-testid="zoom-controls">
          {ZOOM_STEPS.map((zoomStep) => {
            const blockedReason = zoomBlockedReason(width, zoomStep);
            return (
              <button
                key={zoomStep}
                type="button"
                className="ed-zoom-step"
                data-testid={`zoom-${zoomStep}`}
                aria-pressed={zoomStep === zoom}
                aria-disabled={blockedReason !== undefined}
                onClick={() => {
                  if (blockedReason !== undefined) return;
                  setZoom(zoomStep);
                }}
                title={blockedReason ?? `Масштаб дорожки ×${zoomStep}`}
              >
                ×{zoomStep}
              </button>
            );
          })}
        </span>

        <span className="ed-add">
          <button
            type="button"
            className="ed-add-mark"
            onClick={onAddGate}
            // Слово схемы «гейт» пережило чистку словаря Сессии 8 именно
            // здесь: на подсказки при наведении никто не смотрит, а автор
            // видит их так же, как подписи (product.md §2а).
            title="Остановка на этой секунде"
          >
            ▮ остановка
          </button>
        </span>
      </div>

      {/* Контейнер прокрутки полотна волны (track-zoom.md §2). laneRef
          остаётся на ПОЛОТНЕ (.ed-lane), а не на этом контейнере: seekToPointer
          меряет getBoundingClientRect() полотна, и у прокрученного полотна
          left уходит в минус ровно на величину прокрутки — формула
          (clientX − rect.left) / rect.width продолжает работать без правки
          (замер 06.08.2026, docs/design/track-zoom.md §3). Эту функцию
          и её пару в MarksLane трогать нельзя. */}
      <div
        className="ed-lane-scroll"
        ref={laneScrollRef}
        onScroll={(event) => {
          // Односторонняя синхронизация: волна ведёт, полоса меток
          // повторяет (track-zoom.md §3 у полосы меток) — иначе метка
          // стояла бы не под своим местом волны.
          const marksContainer = marksScrollRef.current;
          if (marksContainer) marksContainer.scrollLeft = event.currentTarget.scrollLeft;
        }}
      >
        <div
          className="ed-lane"
          ref={laneRef}
          style={{ width: `${canvasWidthPx}px` }}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          data-testid="track-lane"
        >
          <Waveform peaks={peaks} width={canvasWidthPx} height={waveHeight} progress={progress} />

          <div className="ed-ticks" aria-hidden="true">
            {ticks.map((t) => (
              <span key={t} className="ed-tick" style={{ left: `${(t / durationSeconds) * 100}%` }}>
                {formatTime(t)}
              </span>
            ))}
          </div>

          <div
            className="ed-playhead"
            data-testid="playhead"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/*
        Список «проверьте эти места» (`product.md` §4 [Р]) — строкой над
        дорожкой, а не отдельной панелью.

        Считается ОТ МЕТОК, то есть от данных проекта, а не от события замены
        озвучки. Разница видна назавтра: отчёт о переносе живёт, пока открыта
        панель дорожки, а сирота живёт в файле. Покажи мы счётчик только после
        замены — он исчез бы при перезагрузке вместе с памятью о проблеме,
        и §4 «автор получает список» выполнялся бы ровно один сеанс.

        Строки нет, когда сирот нет: пустой блок «0 меток требуют проверки»
        приучал бы глаз пропускать это место.
      */}
      {orphanCount > 0 && (
        <p className="ed-orphans" data-testid="orphan-counter">
          <span className="ed-orphans-sign" aria-hidden="true">⚠</span>
          {' '}
          Проверьте {plural(orphanCount, ORPHAN_MARKS)}: слово не найдено в записи.
          {' '}
          <button
            type="button"
            className="ed-orphans-next"
            data-testid="orphan-next"
            onClick={() => {
              const next = nextOrphan(marks, selectedMark);
              if (!next) return;
              onSelectMark(next.kind, next.id);
              // Ведём головку к метке: выделения мало, автор должен увидеть
              // МЕСТО. Перемотка в паузе законна — так же выбирается слайд
              // в ленте (`Editor.tsx`, `handleSelectSlide`).
              transport.seek(next.seconds);
            }}
          >
            к следующей
          </button>
        </p>
      )}

      <MarksLane
        marks={marks}
        durationSeconds={durationSeconds}
        selected={selectedMark}
        onSelect={onSelectMark}
        onMove={onMoveMark}
        onMoveEnd={onMoveMarkEnd}
        onTransitionSecondsLive={onTransitionSecondsLive}
        onTransitionSecondsCommit={onTransitionSecondsCommit}
        zoom={zoom}
        scrollContainerRef={marksScrollRef}
      />

      <p className="ed-words" data-testid="track-words">
        {/* Слово автора — «расшифровка»; «транскрипт» живёт в схеме и коде
            (product.md §2а). И это не просто «пусто»: часть без озвучки —
            законный случай, поэтому строка сразу говорит, что делать. */}
        {words.length === 0
          ? 'Расшифровки нет — метки этой части ставятся по секундам'
          : words.map((word, index) => (
              <span
                key={`${word.start}-${index}`}
                className={index === activeIndex ? 'ed-word ed-word-active' : 'ed-word'}
              >
                {word.text}{' '}
              </span>
            ))}
      </p>
    </section>
  );
}

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
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { Word } from '@player/core';

import type { MarkKind } from '../state/project.js';
import { MarksLane, type Mark } from './MarksLane.js';
import type { TransportApi } from './useTransport.js';
import { Waveform } from './Waveform.js';

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
}: TrackViewProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const draggingRef = useRef(false);

  const { positionSeconds, durationSeconds, peaks, failure, isPlaying } = transport;

  // Ширина нужна и канвасу, и переводу времени в пиксели. Меряем её
  // наблюдателем, а не по событию окна: дорожка меняет ширину и когда
  // окно не трогали — например, если рядом откроется панель.
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) throw new Error('TrackView: дорожка не смонтирована');
    const measure = (): void => setWidth(lane.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(lane);
    return () => observer.disconnect();
  }, []);

  const progress = durationSeconds > 0 ? positionSeconds / durationSeconds : 0;

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

  const step = tickStep(durationSeconds, width);
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

        <span className="ed-add">
          <button
            type="button"
            className="ed-add-mark"
            onClick={onAddGate}
            title="Гейт на этой секунде"
          >
            ▮ остановка
          </button>
        </span>
      </div>

      <div
        className="ed-lane"
        ref={laneRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        data-testid="track-lane"
      >
        <Waveform peaks={peaks} width={width} height={72} progress={progress} />

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

      <MarksLane
        marks={marks}
        durationSeconds={durationSeconds}
        selected={selectedMark}
        onSelect={onSelectMark}
        onMove={onMoveMark}
        onMoveEnd={onMoveMarkEnd}
      />

      <p className="ed-words" data-testid="track-words">
        {words.length === 0
          ? 'Транскрипта нет'
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

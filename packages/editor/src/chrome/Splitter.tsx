/**
 * Перетаскиваемая граница между панелью каталога и остальным хромом.
 *
 * **Координатные пространства не смешивать** (правило из CLAUDE.md, дефект
 * уже стоил перетаскивания в редакторе тихо): ширина считается только от
 * `event.clientX`, разницей между текущим и стартовым положением указателя.
 * `offsetLeft`/`clientWidth` сюда не входят вовсе — не потому что забыты,
 * а потому что жест работает через ДЕЛЬТУ движения, а не через измерение
 * прямоугольника на каждом кадре: абсолютное положение курсора самой
 * границы для вычисления новой ширины не нужно.
 *
 * **Орган управления виден всегда, а не по наведению.** Элемент интерфейса,
 * появляющийся под курсором от действия автора, уже ломал двойной клик
 * (Сессия 29, журнал §8: полоска расположения возникала под курсором между
 * двумя кликами и перехватывала второй). Граница здесь не имеет состояния
 * «скрыта» вообще — hover-видимость в CSS этому компоненту не задаётся.
 */
import {
  useCallback,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

export type SplitterSide = 'left' | 'right';

export interface SplitterProps {
  /** Текущая ширина изменяемой панели, px. */
  width: number;
  min: number;
  max: number;
  /** С какой стороны от границы лежит изменяемая панель. */
  side: SplitterSide;
  onChange: (width: number) => void;
}

/** Шаг клавиатуры — работает без мыши, как требует доступность. */
const KEYBOARD_STEP_PX = 16;

/** Зажим ширины в `[min, max]`. Чистая функция — тест проверяет её без React. */
export function clampSplitterWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, width));
}

/**
 * Новая ширина панели от смещения указателя вдоль оси X.
 *
 * `deltaX` — движение курсора вправо положительно, вне зависимости от того,
 * с какой стороны панель. Знак переворачивается только здесь: если панель
 * лежит СЛЕВА от границы, движение вправо её увеличивает; если СПРАВА —
 * уменьшает (граница вдвигается в панель). Зажимается на каждый вызов,
 * а не в конце жеста — требование задания, чтобы курсор не убегал от ручки
 * при быстром движении за пределы допустимого диапазона.
 */
export function nextSplitterWidth(
  baseWidth: number,
  side: SplitterSide,
  deltaX: number,
  min: number,
  max: number,
): number {
  const widthDelta = side === 'left' ? deltaX : -deltaX;
  return clampSplitterWidth(baseWidth + widthDelta, min, max);
}

export function Splitter({ width, min, max, side, onChange }: SplitterProps): ReactElement {
  // Стартовые координаты жеста, а не текущая ширина из пропсов на каждый
  // pointermove: React мог ещё не перерисовать компонент с новым `width`
  // между двумя событиями движения, поэтому дельта считается от точки
  // начала жеста, а не от последнего полученного пропса.
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  const handleDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
      // Без захвата быстрое движение мыши уводит указатель с узкой границы,
      // и pointermove перестаёт приходить вовсе — граница «отпускает» жест.
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [width],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      onChange(nextSplitterWidth(drag.startWidth, side, event.clientX - drag.startX, min, max));
    },
    [side, min, max, onChange],
  );

  const handleUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>): void => {
      // Стрелка симулирует движение самой границы: вправо — курсор двигается
      // вправо на шаг, влево — на шаг влево. Знак от стороны панели переворачивает
      // тот же `nextSplitterWidth`, что и жест мышью — правило одно на оба ввода.
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onChange(nextSplitterWidth(width, side, KEYBOARD_STEP_PX, min, max));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onChange(nextSplitterWidth(width, side, -KEYBOARD_STEP_PX, min, max));
      }
    },
    [width, side, min, max, onChange],
  );

  return (
    <div
      className="ed-splitter"
      data-testid={`splitter-${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onKeyDown={handleKeyDown}
    />
  );
}

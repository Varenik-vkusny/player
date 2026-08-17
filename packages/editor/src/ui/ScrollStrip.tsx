import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react';

import { Icon } from './Icon.js';

/**
 * Строка, которая прокручивается сама — и ОБЯЗАНА об этом сказать.
 *
 * Заведена по замеру 18.08.2026 на полосе свойств. При окне 1280 и открытом
 * каталоге (состояние, в котором редактор открывается) полосе нужно 1276 px,
 * а достаётся 586: за краем остаются ВСЕ тринадцать кнопок выравнивания,
 * раскладки и слоёв и кнопка «Ещё…» — единственная дверь ко всем остальным
 * свойствам. Уезжают они горизонтальной прокруткой, и до этой правки о них
 * не сообщал ничего: ни одного видимого признака, что справа что-то есть.
 *
 * **Полосы прокрутки признаком не считаются, и это не придирка.** В каркасе
 * (design/shell.css) у .propbar прямо стоит `scrollbar-width: none`, то есть
 * облик её и не предполагает; а там, где браузер её всё же рисует, она
 * накладная и тает через секунду после жеста. Признак, который виден только
 * тому, кто уже прокрутил, не сообщает ничего тому, кто не знает, что можно.
 *
 * Поэтому признак здесь — стрелка у того края, за которым ещё есть
 * содержимое: её видно, не трогая ничего, и на неё можно нажать.
 *
 * **Стрелки лежат НАЛОЖЕНИЕМ, а не в потоке строки.** Стрелка в потоке
 * отнимала бы у строки свои 28 px, а от этого строка может стать
 * прокручиваемой — и тогда появление стрелки порождает стрелку. Обратный
 * ход того же кольца: перестало помещаться → стрелка ушла → снова
 * помещается → стрелка вернулась. Наложенная стрелка ширины не отнимает,
 * и кольца не существует вовсе.
 *
 * Замер пересчитывается тремя путями сразу, потому что три разные причины:
 * прокрутка (событие scroll), изменение размера строки (ResizeObserver)
 * и смена самого содержимого — у неё события нет, поэтому пересчёт идёт
 * после каждой отрисовки. Нового хронометра при этом не заводится
 * (инвариант №1): ни setInterval, ни счётчика кадров здесь нет.
 */
export function ScrollStrip({
  className,
  role,
  label,
  testId,
  children,
}: {
  /** Класс самой прокручиваемой строки: её прежние правила остаются на ней. */
  className: string;
  role?: string;
  /** aria-label прокручиваемой строки — остаётся на ней, а не на обёртке. */
  label?: string;
  /**
   * data-testid прокручиваемой строки. Стрелки получают производные имена
   * `${testId}-scroll-start` и `-scroll-end`: своё имя у органа обязано
   * говорить, к чему он относится, иначе второй такой же орган на экране
   * не отличить от первого.
   */
  testId?: string;
  children: ReactNode;
}): JSX.Element {
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // Допуск в 1 px: scrollLeft и scrollWidth дробные при масштабе страницы,
    // и без допуска стрелка «конца» осталась бы висеть на прокрученной
    // до упора строке — то есть врала бы.
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
  }, []);

  // Подписки: живут, пока жив узел. Отдельно от пересчёта после отрисовки —
  // иначе ResizeObserver пересоздавался бы на каждое движение ползунка числа
  // (onStyleLiveCommit шлёт событие на каждый pointermove).
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure]);

  // Содержимое сменилось — событий об этом нет ни у scroll, ни у наблюдателя
  // за размером САМОЙ строки. Поэтому после каждой отрисовки меряем заново.
  useEffect(measure);

  const page = (direction: -1 | 1): void => {
    const el = stripRef.current;
    if (!el) return;
    // Шаг — 80 % видимого, а не всё видимое: полностью «перелистнутая» строка
    // не оставляет на экране ни одного прежнего органа, и автор теряет место,
    // где был. Внахлёст он его видит.
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <div className="ed-scrollstrip">
      <div
        ref={stripRef}
        className={className}
        role={role}
        aria-label={label}
        data-testid={testId}
      >
        {children}
      </div>

      {edges.start ? (
        <button
          type="button"
          className="ed-scrollstrip-edge ed-scrollstrip-edge-start"
          data-testid={testId === undefined ? undefined : `${testId}-scroll-start`}
          aria-label="Показать, что слева"
          onClick={() => page(-1)}
        >
          <Icon name="chevron-left" />
        </button>
      ) : null}

      {edges.end ? (
        <button
          type="button"
          className="ed-scrollstrip-edge ed-scrollstrip-edge-end"
          data-testid={testId === undefined ? undefined : `${testId}-scroll-end`}
          aria-label="Показать, что справа"
          onClick={() => page(1)}
        >
          <Icon name="chevron-right" />
        </button>
      ) : null}
    </div>
  );
}

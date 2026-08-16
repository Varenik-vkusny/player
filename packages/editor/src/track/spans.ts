/**
 * Правила отрезков «моё» на полосе капли.
 *
 * Модуль ЧИСТЫЙ и лежит отдельно от вида по той же причине, что и `marks.ts`:
 * «куда можно поставить край» — правило продукта (отрезки не перекрываются,
 * хозяин бинарен), а не свойство разметки. Положи его в компонент — и оно
 * разъедется со схемой, которая то же самое проверяет при разборе.
 *
 * Здесь всё считается В СЕКУНДАХ. Превращение секунды обратно в `TimeRef`
 * (слово или число) — дело `marks.ts`, у которого это уже написано и охраняется
 * инвариантом №10. Двух мест, решающих «слово или секунды», быть не должно.
 *
 * → docs/design/bubble.md §3, ADR-032
 */

/**
 * Короче этого отрезок не создаётся и не ужимается.
 *
 * Не «строго больше нуля»: схема запрещает нулевую длину, но отрезок
 * в три миллисекунды формально законен и при этом невидим — автор получил бы
 * клип, который нельзя ни увидеть, ни поймать курсором. Четверть секунды
 * заметна на любом масштабе полосы.
 */
export const MIN_SPAN_SECONDS = 0.25;

/** Отрезок с уже разрешёнными секундами — то, чем оперирует полоса. */
export interface SpanRange {
  readonly fromSeconds: number;
  readonly toSeconds: number;
}

/** Какой край тянут. */
export type SpanEdge = 'from' | 'to';

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

/**
 * Куда упрётся край при тяге: в соседний отрезок, в границу главы
 * или в собственный второй край.
 *
 * Возвращает ВСЕГДА законное значение, а не «нельзя»: клип, переставший
 * следовать за курсором, читается как прилипание, а отказ посреди жеста —
 * как поломка. То же решение, что у прилипания элементов на сцене.
 */
export function clampEdge(
  spans: readonly SpanRange[],
  index: number,
  edge: SpanEdge,
  seconds: number,
  durationSeconds: number,
): number {
  const span = spans[index];
  if (!span) throw new Error(`Отрезка №${index} нет: тянуть нечего`);

  if (edge === 'from') {
    // Слева — конец предыдущего отрезка или ноль. Соприкосновение краёв
    // законно (схема разрешает его намеренно: его порождает разрез главы).
    const low = spans[index - 1]?.toSeconds ?? 0;
    return clamp(seconds, low, span.toSeconds - MIN_SPAN_SECONDS);
  }

  const high = spans[index + 1]?.fromSeconds ?? durationSeconds;
  return clamp(seconds, span.fromSeconds + MIN_SPAN_SECONDS, high);
}

/**
 * Куда встанет отрезок целиком при перетаскивании за тело.
 *
 * Длина сохраняется: тащат отрезок, а не его края. Упереться он может
 * в соседей и в границы главы — и упирается ЦЕЛИКОМ, не деформируясь.
 */
export function clampWhole(
  spans: readonly SpanRange[],
  index: number,
  fromSeconds: number,
  durationSeconds: number,
): SpanRange {
  const span = spans[index];
  if (!span) throw new Error(`Отрезка №${index} нет: двигать нечего`);

  const length = span.toSeconds - span.fromSeconds;
  const low = spans[index - 1]?.toSeconds ?? 0;
  const high = (spans[index + 1]?.fromSeconds ?? durationSeconds) - length;

  // Проверки «а вдруг места меньше длины» здесь НЕТ, и это не упущение.
  // Отрезки упорядочены и не пересекаются (схема), значит
  // `next.from − length ≥ span.to − length = span.from ≥ prev.to`,
  // то есть `high` не может оказаться ниже `low` ни при каких данных,
  // которые вообще прошли разбор. Написанная было ветка оказалась
  // недостижимой, а тест к ней — выдумкой: проверять было нечего.
  const from = clamp(fromSeconds, low, high);
  return { fromSeconds: from, toSeconds: from + length };
}

/**
 * Куда встанет НОВЫЙ отрезок, нарисованный тягой по пустому месту.
 *
 * `undefined` — «не поместился»: жест начался в занятом месте или оказался
 * короче различимого. Ответ «нет» здесь законен, в отличие от тяги за край:
 * не появившийся клип виден сразу, а вот клип, молча вставший не туда,
 * автор заметит через полчаса.
 */
export function placeNew(
  spans: readonly SpanRange[],
  anchorSeconds: number,
  cursorSeconds: number,
  durationSeconds: number,
): SpanRange | undefined {
  const from = clamp(Math.min(anchorSeconds, cursorSeconds), 0, durationSeconds);
  const to = clamp(Math.max(anchorSeconds, cursorSeconds), 0, durationSeconds);

  // Начали ВНУТРИ существующего отрезка — свободного промежутка нет вовсе.
  //
  // Проверяется ОТДЕЛЬНО и первым делом. Первая редакция искала промежуток
  // одним проходом, сужая границы соседями слева и справа, — и отрезок,
  // ВНУТРИ которого оказалась точка начала, не подходил ни под одно условие
  // и не сужал ничего. Жест из середины чужого клипа создавал клип внахлёст,
  // то есть проект, который перестаёт разбираться. Поймано тестом.
  const inside = spans.some((span) => from > span.fromSeconds && from < span.toSeconds);
  if (inside) return undefined;

  // Свободный промежуток вокруг точки начала.
  let low = 0;
  let high = durationSeconds;
  for (const span of spans) {
    if (span.toSeconds <= from) low = Math.max(low, span.toSeconds);
    if (span.fromSeconds >= from) high = Math.min(high, span.fromSeconds);
  }

  const start = clamp(from, low, high);
  const end = clamp(to, low, high);
  if (end - start < MIN_SPAN_SECONDS) return undefined;

  return { fromSeconds: start, toSeconds: end };
}

/**
 * Куда вставить новый отрезок, чтобы массив остался упорядоченным.
 *
 * Порядок — требование схемы, а не косметика: она проверяет отрезки подряд
 * и на неупорядоченном массиве отказала бы разбором. Вставка «в конец»
 * работала бы ровно до первого отрезка, нарисованного левее прежних.
 */
export function insertionIndex(spans: readonly SpanRange[], fromSeconds: number): number {
  const after = spans.findIndex((span) => span.fromSeconds > fromSeconds);
  return after === -1 ? spans.length : after;
}

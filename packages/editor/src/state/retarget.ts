/**
 * Перенос меток дорожки со старой расшифровки на новую.
 *
 * Инвариант №10: метки времени привязаны к словам, а не к секундам.
 * Когда автор заменяет озвучку, слова у новой дорожки — другие: другой
 * набор, другие границы. Метка, построенная как `wordIndex` в СТАРОМ
 * транскрипте, обязана переехать на тот же текст в НОВОМ, а не молча
 * указывать на случайное слово по тому же индексу.
 *
 * `alignWords` (core) даёт сопоставление последовательностей слов — что
 * совпало, что заменилось, что пропало. Эта функция читает сопоставление
 * и решает судьбу каждой метки: `same` — переезд один в один, `replaced` —
 * переезд с пометкой «слово изменилось, проверьте», `removed` (или слово
 * вне сопоставления вовсе) — слова больше нет, метка становится секундной
 * по СТАРОМУ времени, единственному, что про неё известно.
 *
 * Модуль живёт в `editor`, а не в `core`: он знает про метки редактора
 * (`TimeRef` внутри `Slide`/`Gate`) и возвращает отчёт для интерфейса —
 * сколько меток переехало ровно, сколько нужно проверить, сколько потеряло
 * слово. `core` не должен знать, что кому показывают.
 */
import { alignWords } from '@player/core';
import type { AlignOp, TimeRef, Word } from '@player/core';
import { plural, type PluralForms } from '../plural.js';
import { retargetMark } from '../track/marks.js';

const MARKS: PluralForms = { one: 'метка', few: 'метки', many: 'меток' };

/** Итог переноса меток числами — для отображения автору. */
export type RetargetReport = {
  /** Метка переехала на своё слово: тот же текст, сопоставление `same`. */
  readonly moved: number;
  /** Слово в другой форме — метка переехала, но сопоставление `replaced`: проверить. */
  readonly check: number;
  /** Слова больше нет — метка стала секундной по старому времени. */
  readonly toSeconds: number;
};

/**
 * Переносит метки `refs` со старой расшифровки `before` на новую `after`.
 *
 * Секундные метки (`kind: 'seconds'`) не трогаются вовсе и в отчёт не
 * попадают — им нечего переносить, они уже не привязаны к слову.
 *
 * Карта `oldIndex → операция` строится один раз на весь вызов — а не
 * поиском по массиву на каждую метку, — потому что меток в сегменте может
 * быть много, а сопоставление на весь вызов одно.
 */
export function retargetByAlignment(
  refs: readonly TimeRef[],
  before: readonly Word[],
  after: readonly Word[],
): { readonly refs: readonly TimeRef[]; readonly report: RetargetReport } {
  const ops = alignWords(before, after);
  const byOldIndex = new Map<number, AlignOp>();
  for (const op of ops) {
    if (op.kind === 'same' || op.kind === 'replaced' || op.kind === 'removed') {
      byOldIndex.set(op.oldIndex, op);
    }
  }

  let moved = 0;
  let check = 0;
  let toSeconds = 0;

  const nextRefs = refs.map((ref) => {
    if (ref.kind === 'seconds') return ref;

    const op = byOldIndex.get(ref.wordIndex);
    if (op?.kind === 'same') {
      moved++;
      return { ...ref, wordIndex: op.newIndex };
    }
    if (op?.kind === 'replaced') {
      check++;
      return { ...ref, wordIndex: op.newIndex };
    }

    // `removed`, либо слова с таким индексом вовсе не было в сопоставлении
    // (например старой расшифровки не было) — переносить некуда. Секунды
    // считаются по СТАРОЙ расшифровке: у исчезнувшего слова новых времён
    // нет по определению, а старое время — единственное, что про эту метку
    // известно. Это ровно то, чем сегодня пользуется `replaceSegmentAudio`.
    //
    // Если слова не было даже в СТАРОЙ расшифровке (индекс вне `before`,
    // например она вовсе пуста) — состояние невалидно по схеме (`schema.ts`,
    // проверка `ref.wordIndex >= wordCount`: «Ссылка на слово при пустом
    // транскрипте» не проходит валидацию проекта). `retargetMark` в этом
    // случае намеренно падает `TimeRefError` — резолвить действительно
    // нечего. Заглушки на этот случай нет: `product.md` §4 запрещает тихую
    // подстановку — метка выглядела бы рабочей и сломалась бы у зрителя.
    toSeconds++;
    return retargetMark(ref, before, 'seconds');
  });

  return { refs: nextRefs, report: { moved, check, toSeconds } };
}

/**
 * Отчёт о переносе меток человеческими словами — для панели дорожки
 * (`AudioSourcePanel`).
 *
 * Строится ИЗ ЧИСЕЛ отчёта, а не наугад: количества в интерфейсе — та же
 * грабля «числа в комментариях гниют» (CLAUDE.md), только в тексте, который
 * видит автор, а не в комментарии. Три части — переехавшие ровно, переехавшие
 * с пометкой «проверьте» (слово изменило форму) и потерявшие слово (стали
 * секундными) — необязательны и появляются только когда их число больше нуля.
 *
 * Все три нуля — легитимный исход (например, все метки сегмента уже были
 * секундными до замены — `retargetByAlignment` их вообще не считает), и тогда
 * возвращается нейтральная фраза, а не пустая строка: молчание выглядело бы
 * как забытая часть интерфейса, а не как «переносить было нечего».
 */
export function describeRetarget(report: RetargetReport): string {
  const parts: string[] = [];
  if (report.moved > 0) {
    parts.push(`Перенесено ${plural(report.moved, MARKS)}.`);
  }
  if (report.check > 0) {
    parts.push(`Проверьте ${plural(report.check, MARKS)} — слово изменило форму.`);
  }
  if (report.toSeconds > 0) {
    parts.push(`Переведено в секунды ${plural(report.toSeconds, MARKS)}: слова больше нет.`);
  }
  if (parts.length === 0) {
    return 'Меток, привязанных к слову, в этой части не было — переносить было нечего.';
  }
  return parts.join(' ');
}

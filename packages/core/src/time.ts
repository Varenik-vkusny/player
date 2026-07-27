/**
 * Разрешение TimeRef в секунды — ЕДИНСТВЕННОЕ место, где это разрешено делать.
 *
 * Инвариант №10: метки привязаны к словам, а не к миллисекундам. Секунды
 * вычисляются при загрузке из актуальных таймингов и никогда не хранятся
 * в проекте для меток типа word (см. ADR-008).
 */
import type { TimeRef, Word, WordAnchor } from './schema.js';

/** Приводит слово к виду, в котором его можно сравнивать между озвучками. */
export function normalizeWord(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
}

export class TimeRefError extends Error {
  constructor(message: string, readonly ref: TimeRef) {
    super(message);
    this.name = 'TimeRefError';
  }
}

/** Строит якорь для слова по его окрестности. */
export function buildAnchor(words: readonly Word[], index: number): WordAnchor {
  const word = words[index];
  if (!word) throw new Error(`Слово №${index} отсутствует, всего слов ${words.length}`);
  return {
    text: normalizeWord(word.text),
    before: index > 0 ? normalizeWord(words[index - 1]!.text) : '',
    after: index + 1 < words.length ? normalizeWord(words[index + 1]!.text) : '',
  };
}

export type AnchorCheck =
  | { status: 'ok' }
  | { status: 'moved'; suggestedIndex: number }
  | { status: 'lost' };

/**
 * Проверяет, указывает ли ссылка на то же слово, что и раньше.
 *
 * Нужно после замены озвучки: вставленное предложение сдвигает все последующие
 * индексы, и без этой проверки метка молча переехала бы на другое слово.
 */
export function checkAnchor(words: readonly Word[], ref: TimeRef): AnchorCheck {
  if (ref.kind !== 'word') return { status: 'ok' };

  const current = words[ref.wordIndex];
  if (current && normalizeWord(current.text) === ref.anchor.text) return { status: 'ok' };

  // Ищем слово с той же окрестностью — так вставка текста выше по дорожке
  // не ломает метку, а лишь смещает её.
  const candidates: number[] = [];
  for (let i = 0; i < words.length; i++) {
    if (normalizeWord(words[i]!.text) !== ref.anchor.text) continue;
    const anchor = buildAnchor(words, i);
    if (anchor.before === ref.anchor.before && anchor.after === ref.anchor.after) {
      candidates.push(i);
    }
  }

  if (candidates.length === 1) return { status: 'moved', suggestedIndex: candidates[0]! };
  return { status: 'lost' };
}

/**
 * Переводит ссылку в секунды. Падает громко: молча вернуть ноль или
 * приблизительное значение здесь означало бы анимировать не в том месте
 * и не сообщить об этом.
 */
export function resolveTimeRef(ref: TimeRef, words: readonly Word[]): number {
  if (ref.kind === 'seconds') return ref.t;

  const word = words[ref.wordIndex];
  if (!word) {
    throw new TimeRefError(
      words.length === 0
        ? 'Ссылка на слово, но транскрипт пуст'
        : `Слово №${ref.wordIndex} отсутствует, всего слов ${words.length}`,
      ref,
    );
  }

  if (normalizeWord(word.text) !== ref.anchor.text) {
    throw new TimeRefError(
      `Слово №${ref.wordIndex} теперь «${word.text}», а метка ставилась на «${ref.anchor.text}». `
      + 'Требуется перепривязка.',
      ref,
    );
  }

  return Math.max(0, word.start + ref.offset);
}

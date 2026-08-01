/**
 * Сопоставление двух транскриптов.
 *
 * Зачем отдельно от `checkAnchor`: тот сравнивает ПОСЛОВНО — ищет слово с тем
 * же текстом И теми же соседями, а при двух кандидатах сдаётся. Пока автор
 * вставил кусок в стороне, этого хватает; как только он перефразировал
 * соседнее слово, окрестность разошлась, и метка теряется, хотя само слово
 * на месте.
 *
 * `CLAUDE.md`: сравнивать пословно можно только ПОСЛЕ сопоставления
 * последовательностей. Здесь и делается сопоставление.
 */
import { describe, expect, it } from 'vitest';

import { alignWords } from '../src/align.js';
import type { Word } from '../src/schema.js';

/** Транскрипт из строки: тайминги здесь не важны, важен порядок слов. */
const transcript = (text: string): Word[] =>
  text.split(' ').map((word, i) => ({
    text: word,
    start: i,
    end: i + 0.5,
    source: 'asr' as const,
  }));

describe('alignWords', () => {
  it('одинаковые транскрипты дают только совпадения', () => {
    const words = transcript('часы это позиция в дорожке');
    const ops = alignWords(words, words);

    expect(ops.map((op) => op.kind)).toEqual(['same', 'same', 'same', 'same', 'same']);
    // Сужение по виду обязательно: у `removed` поля `newIndex` нет вовсе,
    // и союз это гарантирует на уровне типа, а не соглашения.
    expect(ops.flatMap((op) => (op.kind === 'same' ? [op.newIndex] : []))).toEqual([0, 1, 2, 3, 4]);
  });

  it('различие в ё не считается различием: Deepgram вернул «ждет» на «ждёт»', () => {
    // Не выдумка: замерено 01.08.2026 на настоящем ответе Deepgram по ask.mp3.
    const before = transcript('оно ждёт ответа');
    const after = transcript('оно ждет ответа');

    expect(alignWords(before, after).map((op) => op.kind)).toEqual(['same', 'same', 'same']);
  });

  it('вставленное слово помечается добавленным, соседи остаются совпавшими', () => {
    const before = transcript('часы это позиция');
    const after = transcript('часы это всегда позиция');

    const ops = alignWords(before, after);
    expect(ops.map((op) => op.kind)).toEqual(['same', 'same', 'added', 'same']);
  });

  it('пропущенное слово помечается удалённым', () => {
    const before = transcript('часы это всегда позиция');
    const after = transcript('часы это позиция');

    const ops = alignWords(before, after);
    expect(ops.map((op) => op.kind)).toEqual(['same', 'same', 'removed', 'same']);
  });

  it('совпадение несёт оба индекса — по ним и переезжает якорь', () => {
    const before = transcript('раз два три');
    const after = transcript('ноль раз два три');

    const ops = alignWords(before, after);
    const same = ops.filter((op) => op.kind === 'same');

    // Слово «три» было третьим, стало четвёртым. Именно этот сдвиг
    // и обязано вернуть сопоставление.
    expect(same.at(-1)).toMatchObject({ oldIndex: 2, newIndex: 3 });
  });

  it('пустой прежний транскрипт: всё добавлено, ничего не потеряно', () => {
    const ops = alignWords([], transcript('раз два'));
    expect(ops.map((op) => op.kind)).toEqual(['added', 'added']);
  });

  it('пустой новый транскрипт: всё удалено', () => {
    const ops = alignWords(transcript('раз два'), []);
    expect(ops.map((op) => op.kind)).toEqual(['removed', 'removed']);
  });

  it('склонение считается заменой: то же слово в другой форме', () => {
    // Русский меняет хвост, а не начало. «объяснение» и «объяснения»
    // совпадают на 9 буквах из 10 — это одно слово, сказанное иначе.
    const before = transcript('здесь объяснение ждёт');
    const after = transcript('здесь объяснения ждёт');

    const ops = alignWords(before, after);
    expect(ops.map((op) => op.kind)).toEqual(['same', 'replaced', 'same']);
    expect(ops[1]).toMatchObject({ kind: 'replaced', oldIndex: 1, newIndex: 1 });
  });

  it('другое слово заменой НЕ считается: якорь не ставится наугад', () => {
    // «часы» и «время» не совпадают ни одной буквой в начале.
    // product.md §4: якорь никогда не ставится наугад.
    const before = transcript('это часы проекта');
    const after = transcript('это время проекта');

    expect(alignWords(before, after).map((op) => op.kind)).toEqual([
      'same',
      'removed',
      'added',
      'same',
    ]);
  });

  it('порядок операций повторяет порядок нового транскрипта', () => {
    const before = transcript('а б в');
    const after = transcript('а г в');

    const ops = alignWords(before, after);
    // Что именно случилось с «б»→«г» — решает политика сходства.
    // Здесь проверяется только одно: операции идут слева направо.
    const newIndexes = ops
      .map((op) => ('newIndex' in op ? op.newIndex : undefined))
      .filter((i): i is number => i !== undefined);
    expect(newIndexes).toEqual([...newIndexes].sort((a, b) => a - b));
  });
});

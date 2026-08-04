import { describe, expect, it } from 'vitest';

import { buildAnchor, checkAnchor, normalizeWord, resolveTimeRef, TimeRefError } from '../src/time.js';
import type { TimeRef, Word } from '../src/schema.js';

const words: Word[] = [
  { text: 'Энергия', start: 1, end: 1.6, source: 'alignment' },
  { text: 'не', start: 1.65, end: 1.8, source: 'alignment' },
  { text: 'берётся', start: 1.85, end: 2.4, source: 'alignment' },
  { text: 'ниоткуда', start: 2.45, end: 3.2, source: 'alignment' },
];

const refTo = (index: number, offset = 0): TimeRef => ({
  kind: 'word',
  wordIndex: index,
  offset,
  anchor: buildAnchor(words, index),
});

describe('нормализация слов', () => {
  it('снимает регистр, пунктуацию и различие ё/е', () => {
    expect(normalizeWord('Берётся,')).toBe('берется');
    expect(normalizeWord('«Энергия»')).toBe('энергия');
  });
});

describe('разрешение TimeRef', () => {
  it('секунды возвращаются как есть', () => {
    expect(resolveTimeRef({ kind: 'seconds', t: 4.25 }, words)).toBe(4.25);
  });

  it('ссылка на слово даёт начало слова', () => {
    expect(resolveTimeRef(refTo(2), words)).toBeCloseTo(1.85, 6);
  });

  it('смещение прибавляется к началу слова', () => {
    expect(resolveTimeRef(refTo(2, 0.3), words)).toBeCloseTo(2.15, 6);
  });

  it('отрицательное смещение не уводит время в минус', () => {
    expect(resolveTimeRef(refTo(0, -10), words)).toBe(0);
  });

  it('ссылка за пределы транскрипта падает громко', () => {
    const ref: TimeRef = { kind: 'word', wordIndex: 99, offset: 0, anchor: buildAnchor(words, 0) };
    expect(() => resolveTimeRef(ref, words)).toThrow(TimeRefError);
  });

  it('подменённое слово падает громко, а не анимирует не там', () => {
    const ref = refTo(2);
    const changed: Word[] = [...words];
    changed[2] = { ...words[2]!, text: 'появляется' };
    expect(() => resolveTimeRef(ref, changed)).toThrow(/Требуется перепривязка/);
  });
});

describe('устойчивость якоря к правке текста', () => {
  it('без изменений якорь в порядке', () => {
    expect(checkAnchor(words, refTo(1))).toEqual({ status: 'ok' });
  });

  it('вставка слова выше по дорожке сдвигает метку, но не теряет её', () => {
    const ref = refTo(2);
    const withInsert: Word[] = [
      { text: 'Итак', start: 0.5, end: 0.9, source: 'alignment' },
      ...words,
    ];
    expect(checkAnchor(withInsert, ref)).toEqual({ status: 'moved', suggestedIndex: 3 });
  });

  it('удаление слова из окрестности делает якорь потерянным', () => {
    const ref = refTo(2);
    const without = words.filter((_, i) => i !== 1);
    expect(checkAnchor(without, ref)).toEqual({ status: 'lost' });
  });

  it('секундная ссылка не зависит от текста', () => {
    expect(checkAnchor([], { kind: 'seconds', t: 1 })).toEqual({ status: 'ok' });
  });
});

/**
 * Сирота (`product.md` §4) — метка, чьё слово не нашлось при выравнивании.
 * Она указывает на слово-догадку в АКТУАЛЬНОЙ расшифровке и несёт `lost` —
 * якорь, который искали и не нашли.
 *
 * Отсюда её главное отличие от `word`: сверять её якорь с догадкой нельзя.
 * `lost` описывает слово, которого в этой расшифровке НЕТ по определению,
 * и сверка гарантированно падала бы на каждой сироте — то есть проект
 * с честно помеченной проблемой перестал бы открываться вовсе.
 */
describe('сирота: догадка, а не утверждение', () => {
  const orphan = (index: number, offset = 0): TimeRef => ({
    kind: 'orphan',
    wordIndex: index,
    offset,
    lost: { text: 'квант', before: 'один', after: 'света' },
  });

  it('резолвится по догадке и не сверяет потерянный якорь', () => {
    expect(resolveTimeRef(orphan(2), words)).toBe(1.85);
  });

  it('смещение работает так же, как у обычной привязки', () => {
    expect(resolveTimeRef(orphan(2, 0.15), words)).toBeCloseTo(2.0, 10);
  });

  it('догадка за пределами транскрипта падает громко', () => {
    expect(() => resolveTimeRef(orphan(99), words)).toThrow(TimeRefError);
  });

  it('checkAnchor не требует перепривязки: о потере уже сказано в самих данных', () => {
    expect(checkAnchor(words, orphan(2))).toEqual({ status: 'ok' });
  });
});

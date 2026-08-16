/**
 * Кому принадлежит капля в этот момент (v14, ADR-032).
 *
 * Здесь только ЧИСТАЯ часть: применение владения к живому узлу
 * (`applyOwnership`) проверяется e2e, потому что среда юнитов — узел
 * без DOM (`vitest.config.ts` → `environment: 'node'`), и `document`
 * там не существует.
 */
import { describe, expect, it } from 'vitest';

import type { AuthorSpan, Word } from '@player/core';

import { bubbleElementOf, ownerAt } from '../src/bubble.js';

/** Десять слов по секунде: «w0» в 0.000, «w1» в 1.000 и так далее. */
const WORDS: Word[] = Array.from({ length: 10 }, (_, index) => ({
  text: `w${index}`,
  start: index,
  end: index + 0.5,
  source: 'tts' as const,
}));

const seconds = (t: number): AuthorSpan['from'] => ({ kind: 'seconds', t });

const SPANS: AuthorSpan[] = [
  { elementId: 'head', from: seconds(2), to: seconds(4) },
  { elementId: 'head', from: seconds(6), to: seconds(8) },
];

describe('кому принадлежит капля', () => {
  it('внутри отрезка — автору, между отрезками — зрителю', () => {
    // СЛОМ: убрать сравнение `seconds >= from` — владение начнётся не там.
    expect(ownerAt(SPANS, WORDS, 'head', 3)).toBe('author');
    expect(ownerAt(SPANS, WORDS, 'head', 5)).toBe('viewer');
    expect(ownerAt(SPANS, WORDS, 'head', 7)).toBe('author');
    expect(ownerAt(SPANS, WORDS, 'head', 9)).toBe('viewer');
  });

  it('начало отрезка ВКЛЮЧЕНО, конец — НЕТ', () => {
    // Не придирка. Разрез главы порождает отрезки ВСТЫК, и на их общей
    // секунде включённые оба конца дали бы двух хозяев сразу — ответ зависел
    // бы от порядка перебора, то есть от порядка в массиве.
    //
    // СЛОМ: заменить `seconds < to` на `seconds <= to` — этот тест покраснеет
    // на границе 4.0, а тест «между отрезками — зрителю» останется зелёным.
    expect(ownerAt(SPANS, WORDS, 'head', 2)).toBe('author');
    expect(ownerAt(SPANS, WORDS, 'head', 4)).toBe('viewer');
  });

  it('встык двух отрезков хозяин ровно один', () => {
    // Прямая проверка того, ради чего сделан предыдущий выбор.
    const touching: AuthorSpan[] = [
      { elementId: 'head', from: seconds(0), to: seconds(5) },
      { elementId: 'head', from: seconds(5), to: seconds(9) },
    ];
    expect(ownerAt(touching, WORDS, 'head', 5)).toBe('author');
    // И это ВТОРОЙ отрезок, а не первый: 5.0 — его начало.
    expect(ownerAt(touching, WORDS, 'head', 4.999)).toBe('author');
    expect(ownerAt(touching, WORDS, 'head', 9)).toBe('viewer');
  });

  it('без единого отрезка капля принадлежит зрителю ВСЁ время', () => {
    // Это не «ничего не настроено», а осмысленное состояние: автор не забрал
    // голову себе ни разу, значит зритель распоряжается ею целиком.
    // СЛОМ: вернуть 'author' при пустом списке — зритель потеряет каплю там,
    // где автор её и не просил.
    expect(ownerAt([], WORDS, 'head', 0)).toBe('viewer');
    expect(ownerAt([], WORDS, 'head', 99)).toBe('viewer');
  });

  it('отрезки ЧУЖОГО элемента на каплю не влияют', () => {
    // СЛОМ: убрать проверку `span.elementId !== elementId` — капля окажется
    // во власти автора там, где он размечал совсем другой элемент.
    expect(ownerAt(SPANS, WORDS, 'другой', 3)).toBe('viewer');
  });

  it('отрезок, привязанный к СЛОВУ, разрешается так же, как секундный', () => {
    // Инвариант №10: края отрезка — TimeRef. Разрешение идёт единственным
    // `resolveTimeRef`, и второго способа быть не должно.
    const byWord: AuthorSpan[] = [{
      elementId: 'head',
      from: { kind: 'word', wordIndex: 2, offset: 0, anchor: { text: 'w2', before: 'w1', after: 'w3' } },
      to: { kind: 'word', wordIndex: 5, offset: 0, anchor: { text: 'w5', before: 'w4', after: 'w6' } },
    }];
    expect(ownerAt(byWord, WORDS, 'head', 3)).toBe('author');
    expect(ownerAt(byWord, WORDS, 'head', 1.5)).toBe('viewer');
    expect(ownerAt(byWord, WORDS, 'head', 5.5)).toBe('viewer');
  });
});

describe('какой элемент главы — капля', () => {
  it('первый элемент типа video', () => {
    expect(bubbleElementOf([
      { id: 'bg', type: 'shape' },
      { id: 'head', type: 'video' },
      { id: 'caption', type: 'text' },
    ])).toBe('head');
  });

  it('без видео капли нет вовсе', () => {
    // `undefined`, а не пустая строка: «капли нет» и «капля с пустым именем» —
    // разные состояния, и второе невыразимо.
    expect(bubbleElementOf([{ id: 'bg', type: 'shape' }])).toBeUndefined();
  });

  it('вторая капля прав не получает — их цена не измерена', () => {
    // `bubble.md` §8.3: несколько капель на сцене одновременно не мерялись
    // ни разу. Правило названо ТЕСТОМ, а не только комментарием, иначе
    // однажды кто-нибудь «поправит» его как недосмотр.
    expect(bubbleElementOf([
      { id: 'first', type: 'video' },
      { id: 'second', type: 'video' },
    ])).toBe('first');
  });
});

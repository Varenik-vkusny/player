import { describe, expect, it } from 'vitest';

import { composeLengthOrPercent, parseStyleDraft } from '../src/panels/styleDraft.js';

describe('parseStyleDraft: черновик числового поля секции «Вид»', () => {
  it('целое и дробное число разбираются', () => {
    expect(parseStyleDraft('36')).toBe(36);
    expect(parseStyleDraft('1.5')).toBe(1.5);
  });

  it('пустая и пробельная строка — незавершённый черновик, не 0', () => {
    // Number('') === 0 и Number(' ') === 0 — оба правдоподобны и оба неверны.
    expect(parseStyleDraft('')).toBeUndefined();
    expect(parseStyleDraft('   ')).toBeUndefined();
  });

  it('одинокий минус — незавершённый черновик, не число', () => {
    expect(parseStyleDraft('-')).toBeUndefined();
  });

  it('«1.» на пути к «1.5» разбирается как 1 — так же, как у NumberField геометрии: ' +
    'Number("1.") валиден в JS, черновик просто ещё не дописан до конца', () => {
    expect(parseStyleDraft('1.')).toBe(1);
  });

  it('отрицательное число — валидный черновик, ограничение по знаку не забота этой функции', () => {
    expect(parseStyleDraft('-12')).toBe(-12);
  });

  it('нечисловой текст не разбирается', () => {
    expect(parseStyleDraft('большой')).toBeUndefined();
  });
});

describe('composeLengthOrPercent: сборка LengthOrPercent из числа и единицы', () => {
  it('валидное число даёт объект с указанной единицей', () => {
    expect(composeLengthOrPercent('28', 'px')).toEqual({ amount: 28, unit: 'px' });
    expect(composeLengthOrPercent('50', '%')).toEqual({ amount: 50, unit: '%' });
  });

  it('незавершённый черновик числа — undefined независимо от единицы', () => {
    expect(composeLengthOrPercent('', 'px')).toBeUndefined();
    expect(composeLengthOrPercent('большой', '%')).toBeUndefined();
  });
});

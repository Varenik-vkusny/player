import { describe, expect, it } from 'vitest';

import { formatRemovalMessage } from '../src/panels/removalMessage.js';

describe('formatRemovalMessage', () => {
  it('без каскада — сообщения нет', () => {
    expect(formatRemovalMessage('title', 0)).toBeUndefined();
  });

  it('одна анимация — единственное число', () => {
    expect(formatRemovalMessage('title', 1)).toBe('Удалён элемент «title», вместе с ним 1 анимация');
  });

  it('2, 3, 4 — форма «анимации»', () => {
    expect(formatRemovalMessage('title', 2)).toBe('Удалён элемент «title», вместе с ним 2 анимации');
    expect(formatRemovalMessage('title', 3)).toContain('3 анимации');
    expect(formatRemovalMessage('title', 4)).toContain('4 анимации');
  });

  it('5..20 — форма «анимаций»', () => {
    expect(formatRemovalMessage('title', 5)).toContain('5 анимаций');
    expect(formatRemovalMessage('title', 10)).toContain('10 анимаций');
  });

  it('11..14 — исключение, всегда «анимаций», несмотря на последнюю цифру', () => {
    expect(formatRemovalMessage('title', 11)).toContain('11 анимаций');
    expect(formatRemovalMessage('title', 12)).toContain('12 анимаций');
    expect(formatRemovalMessage('title', 13)).toContain('13 анимаций');
    expect(formatRemovalMessage('title', 14)).toContain('14 анимаций');
  });

  it('21 — снова единственное число, исключение 11-14 не действует', () => {
    expect(formatRemovalMessage('title', 21)).toContain('21 анимация');
  });

  it('22..24 — снова «анимации»', () => {
    expect(formatRemovalMessage('title', 22)).toContain('22 анимации');
    expect(formatRemovalMessage('title', 24)).toContain('24 анимации');
  });

  it('25, 100, 111, 112 — «анимаций»', () => {
    expect(formatRemovalMessage('title', 25)).toContain('25 анимаций');
    expect(formatRemovalMessage('title', 100)).toContain('100 анимаций');
    expect(formatRemovalMessage('title', 111)).toContain('111 анимаций');
    expect(formatRemovalMessage('title', 112)).toContain('112 анимаций');
  });

  it('101 — единственное число (мод100 = 1, не 11-14)', () => {
    expect(formatRemovalMessage('title', 101)).toContain('101 анимация');
  });

  it('идентификатор элемента обёрнут кавычками-ёлочками', () => {
    expect(formatRemovalMessage('my-el', 1)).toContain('«my-el»');
  });
});

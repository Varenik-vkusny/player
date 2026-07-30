import { describe, expect, it } from 'vitest';

import { formatRemovalMessage, statesOnSlides } from '../src/panels/removalMessage.js';

/**
 * Единица счёта сменилась вместе со схемой v3: кью больше нет, каскад
 * снимает состояние элемента со слайдов. Само правило согласования
 * числительного проверяется отдельно в `plural.test.ts` — здесь только то,
 * что относится к сообщению.
 *
 * Формы «слайде» и «слайдах» стоят в предложном падеже, поэтому у 2–4
 * и 5–20 они совпадают: различима только граница «один против остальных».
 * Это не упрощение теста, а свойство русского языка в этой позиции.
 */
describe('formatRemovalMessage', () => {
  it('без каскада — сообщения нет', () => {
    expect(formatRemovalMessage('title', 0)).toBeUndefined();
  });

  it('один слайд — единственное число', () => {
    expect(formatRemovalMessage('title', 1))
      .toBe('Удалён элемент «title», вместе с ним состояния на 1 слайде');
  });

  it('несколько слайдов — множественное', () => {
    expect(formatRemovalMessage('title', 2)).toContain('на 2 слайдах');
    expect(formatRemovalMessage('title', 5)).toContain('на 5 слайдах');
    expect(formatRemovalMessage('title', 11)).toContain('на 11 слайдах');
    expect(formatRemovalMessage('title', 15)).toContain('на 15 слайдах');
  });

  it('21 — снова единственное число, исключение 11–14 не действует', () => {
    expect(formatRemovalMessage('title', 21)).toContain('на 21 слайде');
  });

  it('идентификатор элемента обёрнут кавычками-ёлочками', () => {
    expect(formatRemovalMessage('my-el', 1)).toContain('«my-el»');
  });
});

describe('statesOnSlides', () => {
  const slides = [
    { states: { a: {}, b: {} } },
    { states: { b: {} } },
    { states: { a: {}, c: {} } },
  ];

  it('считает слайды, где у элемента есть состояние', () => {
    expect(statesOnSlides(slides, 'a')).toBe(2);
    expect(statesOnSlides(slides, 'b')).toBe(2);
    expect(statesOnSlides(slides, 'c')).toBe(1);
  });

  /**
   * Ноль — законный случай, а не ошибка: элемент есть в сегменте,
   * но состояния ему пока не задали ни на одном слайде.
   */
  it('элемент без состояний даёт ноль, а не падение', () => {
    expect(statesOnSlides(slides, 'нет-такого')).toBe(0);
    expect(statesOnSlides([], 'a')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import type { Element } from '@player/core';

import { activeGroupOf } from '../src/state/groupElements.js';

// Без `as Element`: каст спрятал бы расхождение с настоящей формой типа
// ровно там, где тест обязан её знать (тот же приём, что в groupElements.test.ts).
function element(id: string, overrides: Partial<Element> = {}): Element {
  return { id, type: 'shape', content: 'rect', locked: false, ...overrides };
}

describe('activeGroupOf', () => {
  it('двое детей одной группы → её id', () => {
    // Краснеет, если проверять только ПЕРВОГО выделенного: вернуло бы id
    // группы даже без сверки второго.
    const elements = [
      element('g1', { type: 'group' }),
      element('a', { parentId: 'g1' }),
      element('b', { parentId: 'g1' }),
    ];
    expect(activeGroupOf(elements, ['a', 'b'])).toBe('g1');
  });

  it('ребёнок и чужой элемент верхнего уровня → undefined', () => {
    const elements = [
      element('g1', { type: 'group' }),
      element('a', { parentId: 'g1' }),
      element('c'),
    ];
    expect(activeGroupOf(elements, ['a', 'c'])).toBeUndefined();
  });

  it('дети РАЗНЫХ групп → undefined', () => {
    // Краснеет от той же ошибки, что предыдущий тест: сравнения родителей нет,
    // групповой id взят у первого выделенного и не сверен со вторым.
    const elements = [
      element('g1', { type: 'group' }),
      element('g2', { type: 'group' }),
      element('a', { parentId: 'g1' }),
      element('b', { parentId: 'g2' }),
    ];
    expect(activeGroupOf(elements, ['a', 'b'])).toBeUndefined();
  });

  it('пустое выделение → undefined', () => {
    // Краснеет от вырожденного случая: пустой набор родителей «одинаков»
    // по построению, и наивная реализация вернула бы undefined-группу как
    // «совпадение», а не как явно проверенный отдельный случай.
    const elements = [element('g1', { type: 'group' }), element('a', { parentId: 'g1' })];
    expect(activeGroupOf(elements, [])).toBeUndefined();
  });

  it('один элемент верхнего уровня → undefined', () => {
    // Краснеет от возврата parentId без проверки на undefined: у элемента
    // верхнего уровня parentId === undefined, и наивный код мог бы вернуть
    // undefined «как id группы» и перепутать это со «снаружи».
    const elements = [element('c')];
    expect(activeGroupOf(elements, ['c'])).toBeUndefined();
  });
});

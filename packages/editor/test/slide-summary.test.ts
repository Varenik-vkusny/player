import { describe, expect, it } from 'vitest';

import type { Element, ElementState, Slide } from '@player/core';

import { slideChangeSummary } from '../src/track/slide-summary.js';

/**
 * Строит элемент. `type: 'text'` с непустым `content` — единственный случай,
 * когда подпись карточки называет элемент по его тексту, а не по id
 * (задание §14.11, п.1: «имя элемента — content, обрезанный до 20 символов,
 * если это текст и он непуст; иначе id»).
 */
function element(id: string, overrides: Partial<Element> = {}): Element {
  return { id, type: 'shape', content: '', ...overrides };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, style: {}, ...overrides };
}

function slide(id: string, states: Record<string, ElementState>, at: Slide['at'] = { kind: 'seconds', t: 0 }): Slide {
  return { id, at, transition: 'morph', states };
}

describe('slideChangeSummary', () => {
  it('первый слайд — «начало сцены», независимо от содержимого', () => {
    const s = slide('s1', { a: elementState() });
    expect(slideChangeSummary(undefined, s, [element('a')])).toBe('начало сцены');
  });

  it('появившийся элемент называется по id, если это не текст', () => {
    const prev = slide('s1', {});
    const next = slide('s2', { box: elementState() });
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('появляется: box');
  });

  it('появившийся текстовый элемент называется по содержимому', () => {
    const prev = slide('s1', {});
    const next = slide('s2', { title: elementState() });
    const els = [element('title', { type: 'text', content: 'Привет' })];
    expect(slideChangeSummary(prev, next, els)).toBe('появляется: Привет');
  });

  it('исчезнувший элемент', () => {
    const prev = slide('s1', { box: elementState() });
    const next = slide('s2', {});
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('исчезает: box');
  });

  it('двигающийся элемент — состояние изменилось между слайдами', () => {
    const prev = slide('s1', { box: elementState({ x: 0 }) });
    const next = slide('s2', { box: elementState({ x: 50 }) });
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('двигается: box');
  });

  it('изменение прозрачности тоже считается движением', () => {
    const prev = slide('s1', { box: elementState({ opacity: 1 }) });
    const next = slide('s2', { box: elementState({ opacity: 0.4 }) });
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('двигается: box');
  });

  it('несколько видов сразу соединяются через « · », в порядке появление/исчезание/движение', () => {
    const prev = slide('s1', {
      leaving: elementState(),
      moving: elementState({ x: 0 }),
    });
    const next = slide('s2', {
      entering: elementState(),
      moving: elementState({ x: 10 }),
    });
    const els = [element('entering'), element('leaving'), element('moving')];
    expect(slideChangeSummary(prev, next, els))
      .toBe('появляется: entering · исчезает: leaving · двигается: moving');
  });

  it('ничего не изменилось и слайд привязан к слову — «ждёт слова» (§14.12: опорный кадр начала анимации)', () => {
    const state = elementState();
    const prev = slide('s1', { box: state }, { kind: 'seconds', t: 0 });
    const next = slide(
      's2',
      { box: state },
      { kind: 'word', wordIndex: 3, offset: 0, anchor: { text: 'слово', before: '', after: '' } },
    );
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('ждёт слова');
  });

  it('ничего не изменилось и слайд на секундах — «ничего не меняет»', () => {
    const state = elementState();
    const prev = slide('s1', { box: state }, { kind: 'seconds', t: 0 });
    const next = slide('s2', { box: state }, { kind: 'seconds', t: 1 });
    expect(slideChangeSummary(prev, next, [element('box')])).toBe('ничего не меняет');
  });

  it('имя элемента обрезается до 20 символов', () => {
    const prev = slide('s1', {});
    const next = slide('s2', { box: elementState() });
    const els = [element('box', { type: 'text', content: 'Очень длинная подпись элемента, длиннее двадцати' })];
    const summary = slideChangeSummary(prev, next, els);
    // «появляется: » + ровно 20 символов имени (19 текста + «…»).
    expect(summary).toBe('появляется: Очень длинная подпи…');
  });

  it('пустой текстовый элемент называется по id, а не пустой строкой', () => {
    const prev = slide('s1', {});
    const next = slide('s2', { title: elementState() });
    const els = [element('title', { type: 'text', content: '' })];
    expect(slideChangeSummary(prev, next, els)).toBe('появляется: title');
  });

  it('элемент, отсутствующий в обоих слайдах, не попадает в подпись', () => {
    const prev = slide('s1', { box: elementState() });
    const next = slide('s2', { box: elementState() });
    // «other» нет ни на prev, ни на next — законный случай (role 'absent').
    expect(slideChangeSummary(prev, next, [element('box'), element('other')])).toBe('ничего не меняет');
  });
});

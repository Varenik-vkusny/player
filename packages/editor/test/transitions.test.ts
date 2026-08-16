/**
 * Каталог подписей приёма перехода (`src/transitions.ts`) и правка
 * продолжительности (`src/state/slides.ts`, `setTransitionSeconds`) —
 * чистая логика, без React и DOM (`vitest.config.ts`: `environment: 'node'`).
 *
 * Компоненты (`MarkPanel.tsx`) здесь не рендерятся — их проверяет
 * `e2e/mark-panel.spec.ts`, нажимая по видимым узлам настоящего браузера.
 * Юниты проверяют то, что рендер использует, но сам не выражает: полноту
 * таблицы против перечисления ядра и различимость подписей друг от друга —
 * копипаста даёт два одинаковых слова, а не отсутствие слова.
 */
import { describe, expect, it } from 'vitest';

import { TRANSITIONS } from '@player/core';
import type { Element, ElementState, Segment, TimeRef } from '@player/core';

import { TRANSITION_INFO, TRANSITION_ORDER } from '../src/transitions.js';
import { setTransitionSeconds } from '../src/state/slides.js';

function el(id: string, type: Element['type'] = 'shape', content = ''): Element {
  return { id, type, content, locked: false };
}

function state(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides };
}

const seconds = (t: number): TimeRef => ({ kind: 'seconds', t });

/**
 * Часть на 10 секунд с тремя слайдами: стартовый на нуле, два подвижных
 * на 3-й и 6-й секундах — второй и третий правит `setTransitionSeconds`
 * в тестах ниже, первый остаётся неприкосновенным контрольным объектом.
 */
function baseSegment(): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
    elements: [el('shape-1')],
    slides: [
      { id: 'slide-1', at: seconds(0), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state() } },
      { id: 'slide-2', at: seconds(3), transition: 'morph', transitionSeconds: 0.6, states: { 'shape-1': state({ x: 50 }) } },
      { id: 'slide-3', at: seconds(6), transition: 'dissolve', transitionSeconds: 0.6, states: { 'shape-1': state({ x: 80 }) } },
    ],
    gates: [],
    exit: { rules: [], default: null },
  };
}

describe('TRANSITION_INFO: одна таблица подписей', () => {
  it('покрывает каждое значение перечисления TRANSITIONS из ядра', () => {
    for (const transition of TRANSITIONS) {
      expect(TRANSITION_INFO, `нет записи каталога для «${transition}»`).toHaveProperty(transition);
    }
    // И обратно: в таблице нет записи ЛИШНЕЙ сверх перечисления ядра —
    // иначе объект и `Record<Slide['transition'], …>` разошлись бы числом.
    expect(Object.keys(TRANSITION_INFO).sort()).toEqual([...TRANSITIONS].sort());
  });

  it('порядок каталога — восемь ключей, «Срез» первым (docs/design/screens.md §4.2)', () => {
    expect(TRANSITION_ORDER).toHaveLength(8);
    expect(TRANSITION_ORDER[0]).toBe('cut');
  });

  it('подписи (label) попарно различны — копипаста даёт два одинаковых слова', () => {
    const labels = TRANSITION_ORDER.map((transition) => TRANSITION_INFO[transition].label);
    expect(new Set(labels).size, `подписи: ${labels.join(', ')}`).toBe(labels.length);
  });

  it('подсказки (hint) попарно различны', () => {
    const hints = TRANSITION_ORDER.map((transition) => TRANSITION_INFO[transition].hint);
    expect(new Set(hints).size, `подсказки: ${hints.join(' | ')}`).toBe(hints.length);
  });

  it('слова схемы (morph/cut/…) не используются как подпись автору буквально', () => {
    // Не общий запрет на подстроку (у «Морфинг» естественно есть «морф»),
    // а конкретно то, что рождало старую ложь: голое имя значения схемы
    // как единственный текст подписи.
    for (const transition of TRANSITIONS) {
      expect(TRANSITION_INFO[transition].label).not.toBe(transition);
    }
  });
});

describe('setTransitionSeconds', () => {
  it('бросает на первом слайде: у него нет перехода, ехать в него неоткуда', () => {
    const segment = baseSegment();
    expect(() => setTransitionSeconds(segment, 'slide-1', 1)).toThrow(/первого слайда/);
  });

  it('не трогает соседние слайды — они остаются теми же объектами по ссылке', () => {
    const segment = baseSegment();
    const [first, second, third] = segment.slides;

    const next = setTransitionSeconds(segment, 'slide-2', 1.2);

    expect(next.slides[0]).toBe(first); // первый слайд не задет
    expect(next.slides[2]).toBe(third); // третий слайд не задет
    expect(next.slides[1]).not.toBe(second); // а вот второй — изменился
    expect(next.slides[1]!.transitionSeconds).toBe(1.2);
  });

  it('правит ровно поле transitionSeconds, приём перехода не трогает', () => {
    const segment = baseSegment();
    const next = setTransitionSeconds(segment, 'slide-3', 2.5);
    expect(next.slides[2]!.transition).toBe('dissolve');
    expect(next.slides[2]!.transitionSeconds).toBe(2.5);
  });

  it('бросает, если слайда с таким id нет в сегменте', () => {
    const segment = baseSegment();
    expect(() => setTransitionSeconds(segment, 'slide-ghost', 1)).toThrow(/нет в сегменте/);
  });
});

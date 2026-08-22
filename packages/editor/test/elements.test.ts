import { describe, expect, it } from 'vitest';

import type { ElementState, Gate, Segment } from '@player/core';

import { createElement, freeId, removeElement } from '../src/state/elements.js';
import { libraryItem } from '../src/state/library.js';

const STAGE = { width: 1920, height: 1080 };

function emptyStates(): Record<string, ElementState> {
  return {};
}

function segment(overrides: Partial<Segment> = {}): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
    gates: [],
    exit: { rules: [], default: null },
    ...overrides,
  };
}

function gate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 2 },
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: id,
  };
}

describe('freeId', () => {
  it('на пустом списке даёт первый номер', () => {
    expect(freeId('text', [])).toBe('text-1');
  });

  it('пропускает занятые номера подряд', () => {
    expect(freeId('text', [{ id: 'text-1' }, { id: 'text-2' }])).toBe('text-3');
  });

  it('не смотрит на дыры — берёт первый свободный по порядку, не первый после максимума', () => {
    expect(freeId('text', [{ id: 'text-1' }, { id: 'text-3' }])).toBe('text-2');
  });
});

describe('createElement: фабрики трёх видов', () => {
  it('text получает font-family, font-size, color, line-height и заглушку текста', () => {
    const { element, state } = createElement(libraryItem('text'), segment(), emptyStates(), STAGE);
    expect(element.type).toBe('text');
    expect(typeof state.style['font-family']).toBe('string');
    expect(typeof state.style['font-size']).toBe('string');
    expect(typeof state.style.color).toBe('string');
    expect(typeof state.style['line-height']).toBe('string');
    // Заглушка непустая — автор увидит рамку с текстом, а не пустой прямоугольник.
    expect(element.content.length).toBeGreaterThan(0);
  });

  it('shape получает background и border-radius, содержимого у фигуры нет', () => {
    const { element, state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    expect(element.type).toBe('shape');
    expect(typeof state.style.background).toBe('string');
    expect(typeof state.style['border-radius']).toBe('string');
    expect(element.content).toBe('');
  });

  it('image появляется с пустым style и пустым content — ждёт файла', () => {
    const { element, state } = createElement(libraryItem('image'), segment(), emptyStates(), STAGE);
    expect(element.type).toBe('image');
    expect(state.style).toEqual({});
    expect(element.content).toBe('');
  });

  it('новый элемент стоит по центру сцены', () => {
    const { state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    expect(state.x).toBeCloseTo(STAGE.width / 2 - state.width / 2, 6);
    expect(state.y).toBeCloseTo(STAGE.height / 2 - state.height / 2, 6);
  });

  /**
   * Прежде здесь утверждалось обратное: «на непустом слайде центрирование
   * остаётся тем же». Это утверждение и было дефектом — каждый новый элемент
   * ложился ровно в центр сцены и полностью накрывал предыдущий: автор нажимал
   * «Фигура» после «Текст» и текста больше не видел. Найдено взглядом
   * в браузере: девять вставок подряд легли в одну точку.
   */
  it('второй элемент НЕ ложится на первый: центр занят — уходим в сторону', () => {
    const seg = segment();
    const first = createElement(libraryItem('text'), seg, emptyStates(), STAGE);
    const next = createElement(libraryItem('shape'), seg, { [first.element.id]: first.state }, STAGE);
    expect(next.state.x).not.toBeCloseTo(STAGE.width / 2 - next.state.width / 2, 6);
    expect(next.state.y).not.toBeCloseTo(STAGE.height / 2 - next.state.height / 2, 6);
  });

  it('смещение детерминированное: те же действия дают тот же файл', () => {
    const first = createElement(libraryItem('text'), segment(), emptyStates(), STAGE);
    const again = createElement(libraryItem('text'), segment(), emptyStates(), STAGE);
    expect({ x: again.state.x, y: again.state.y }).toEqual({ x: first.state.x, y: first.state.y });
  });

  it('шесть вставок подряд не дают двух элементов в одной точке', () => {
    let seg = segment();
    let states: Record<string, ElementState> = {};
    const places = new Set<string>();
    for (let i = 0; i < 6; i += 1) {
      const created = createElement(libraryItem('shape'), seg, states, STAGE);
      places.add(`${created.state.x}:${created.state.y}`);
      seg = { ...seg, elements: [...seg.elements, created.element] };
      states = { ...states, [created.element.id]: created.state };
    }
    expect(places.size).toBe(6);
  });

  it('каскад не выносит элемент за пределы сцены — иначе его не выделить мышью', () => {
    let seg = segment();
    let states: Record<string, ElementState> = {};
    for (let i = 0; i < 20; i += 1) {
      const created = createElement(libraryItem('shape'), seg, states, STAGE);
      expect(created.state.x).toBeGreaterThanOrEqual(0);
      expect(created.state.y).toBeGreaterThanOrEqual(0);
      expect(created.state.x + created.state.width).toBeLessThanOrEqual(STAGE.width);
      expect(created.state.y + created.state.height).toBeLessThanOrEqual(STAGE.height);
      seg = { ...seg, elements: [...seg.elements, created.element] };
      states = { ...states, [created.element.id]: created.state };
    }
  });

  it('свободный идентификатор: два подряд созданных элемента не совпадают', () => {
    const seg = segment();
    const first = createElement(libraryItem('text'), seg, emptyStates(), STAGE);
    const second = createElement(
      libraryItem('text'),
      { ...seg, elements: [first.element] },
      { [first.element.id]: first.state },
      STAGE,
    );
    expect(second.element.id).not.toBe(first.element.id);
  });

  it('на пустом слайде zIndex начинается с нуля', () => {
    const { state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    expect(state.zIndex).toBe(0);
  });

  it('zIndex нового элемента на единицу больше максимального на слайде', () => {
    const first = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    const bumped: ElementState = { ...first.state, zIndex: 9 };
    const second = createElement(libraryItem('shape'), segment(), { [first.element.id]: bumped }, STAGE);
    expect(second.state.zIndex).toBe(10);
  });

  it('уникальность id — среди всех элементов сегмента, а не только видимых на текущем слайде', () => {
    const seg = segment({ elements: [{ id: 'shape-1', type: 'shape', content: '', locked: false }] });
    // states пуст — на текущем слайде элемента не видно, но id уже занят на уровне сегмента.
    const { element } = createElement(libraryItem('shape'), seg, emptyStates(), STAGE);
    expect(element.id).not.toBe('shape-1');
  });
});

describe('removeElement: каскад по слайдам', () => {
  it('убирает элемент из segment.elements', () => {
    const { element, state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    const seg = segment({
      elements: [element],
      slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: { [element.id]: state } }],
    });

    const next = removeElement(seg, element.id);

    expect(next.elements).toEqual([]);
  });

  it('каскадом снимает состояние элемента со ВСЕХ слайдов', () => {
    const { element, state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    const seg = segment({
      elements: [element],
      slides: [
        { id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: { [element.id]: state } },
        { id: 'slide-2', at: { kind: 'seconds', t: 1 }, transition: 'morph', transitionSeconds: 0.6, states: { [element.id]: state } },
      ],
    });

    const next = removeElement(seg, element.id);

    expect(next.slides[0]!.states).toEqual({});
    expect(next.slides[1]!.states).toEqual({});
  });

  it('слайд, не несущий состояние удаляемого элемента, остаётся тем же объектом по ссылке', () => {
    const { element, state } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    const untouched = { id: 'slide-2', at: { kind: 'seconds' as const, t: 1 }, transition: 'morph' as const, transitionSeconds: 0.6, states: {} };
    const seg = segment({
      elements: [element],
      slides: [
        { id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: { [element.id]: state } },
        untouched,
      ],
    });

    const next = removeElement(seg, element.id);

    expect(next.slides[1]).toBe(untouched);
  });

  it('элементы, не задетые удалением, остаются теми же объектами по ссылке', () => {
    const el = { id: 'a', type: 'shape' as const, content: '', locked: false };
    const other = { id: 'b', type: 'shape' as const, content: '', locked: false };
    const seg = segment({ elements: [el, other] });

    const next = removeElement(seg, el.id);

    expect(next.elements[0]).toBe(other);
  });

  it('удаление несуществующего элемента бросает громкую ошибку', () => {
    expect(() => removeElement(segment(), 'ghost')).toThrow('ghost');
  });
});

// gate() используется только чтобы убедиться, что removeElement не трогает
// гейты (у Gate нет ссылок на элементы, ADR-011).
describe('removeElement: гейты не трогает', () => {
  it('gates остаются тем же массивом по ссылке', () => {
    const g = gate('gate-1');
    const seg = segment({ elements: [{ id: 'a', type: 'shape', content: '', locked: false }], gates: [g] });
    const next = removeElement(seg, 'a');
    expect(next.gates).toBe(seg.gates);
  });
});

/**
 * УДАЛЕНИЕ ФИГУРЫ СНИМАЕТ ССЫЛКИ ОТВЕТОВ НА НЕЁ (ADR-035, схема v15).
 *
 * С версии 15 связь «ответ — элемент сцены» это настоящее поле, и ссылка
 * на несуществующий элемент — ошибка разбора. Значит удаление фигуры,
 * оставившее ссылку, сделало бы проект незагружаемым: автор нажал Delete,
 * а узнал бы об этом при сохранении или, хуже, у зрителя.
 *
 * Обратная сторона строгости обязана быть закрыта здесь, а не оставлена
 * автору: он не должен помнить, что фигура «занята» ответом.
 */
describe('removeElement: ссылки ответов на удалённую фигуру', () => {
  function choiceGate(elementId: string | undefined): Gate {
    return {
      id: 'g1',
      at: { kind: 'seconds', t: 1 },
      config: {
        kind: 'choice',
        prompt: 'Где?',
        options: [
          { id: 'opt-1', label: 'Первый', ...(elementId === undefined ? {} : { elementId }) },
          { id: 'opt-2', label: 'Второй' },
        ],
        correctId: 'opt-1',
      },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'g1',
    };
  }

  /** Фигура с ЗАДАННЫМ именем: ссылка ответа сверяется именно с ним. */
  const card = (id: string): Segment['elements'][number] => ({
    id,
    type: 'text',
    content: 'т',
    locked: false,
  });

  const withCard = (): Segment => segment({
    elements: [card('card')],
    gates: [choiceGate('card')],
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятая чистка ссылок в `removeElement`. Тогда
   * после удаления фигуры в проекте осталась бы ссылка на неё, и схема
   * отказалась бы его разбирать.
   */
  it('ссылка снимается, и вариант остаётся на месте', () => {
    const after = removeElement(withCard(), 'card');
    const config = after.gates[0]!.config;
    if (config.kind !== 'choice') throw new Error('ожидался choice');
    expect(config.options.map((o) => o.id)).toEqual(['opt-1', 'opt-2']);
    expect(config.options[0]!.elementId).toBeUndefined();
    // Вопрос и верный ответ не тронуты: меняется только то, чем щёлкают.
    expect(config.prompt).toBe('Где?');
    expect(config.correctId).toBe('opt-1');
  });

  /**
   * Положительный контроль на сам прибор: без него тест выше прошёл бы
   * и на реализации, которая выбрасывает варианты целиком.
   */
  it('удаление ЧУЖОЙ фигуры ссылку не трогает', () => {
    const base = segment({
      elements: [card('card'), card('other')],
      gates: [choiceGate('card')],
    });
    const after = removeElement(base, 'other');
    const config = after.gates[0]!.config;
    if (config.kind !== 'choice') throw new Error('ожидался choice');
    expect(config.options[0]!.elementId).toBe('card');
  });
});

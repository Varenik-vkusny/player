import { describe, expect, it } from 'vitest';

import type { Cue, Element, Gate, Scene } from '@player/core';

import { createElement, freeId, removeElement } from '../src/state/elements.js';

const STAGE = { width: 1920, height: 1080 };

function scene(overrides: Partial<Scene> = {}): Scene {
  return { elements: [], cues: [], gates: [], ...overrides };
}

function cue(id: string, targetId: string): Cue {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    targetId,
    animation: { property: 'opacity', from: 0, to: 1, duration: 300, ease: 'outQuad' },
  };
}

function gate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 2 },
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
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
    const element = createElement('text', scene(), STAGE);
    expect(element.type).toBe('text');
    expect(typeof element.style['font-family']).toBe('string');
    expect(typeof element.style['font-size']).toBe('string');
    expect(typeof element.style.color).toBe('string');
    expect(typeof element.style['line-height']).toBe('string');
    // Заглушка непустая — автор увидит рамку с текстом, а не пустой прямоугольник.
    expect(element.content.length).toBeGreaterThan(0);
  });

  it('shape получает background и border-radius, содержимого у фигуры нет', () => {
    const element = createElement('shape', scene(), STAGE);
    expect(element.type).toBe('shape');
    expect(typeof element.style.background).toBe('string');
    expect(typeof element.style['border-radius']).toBe('string');
    expect(element.content).toBe('');
  });

  it('image появляется с пустым style и пустым content — ждёт файла', () => {
    const element = createElement('image', scene(), STAGE);
    expect(element.type).toBe('image');
    expect(element.style).toEqual({});
    expect(element.content).toBe('');
  });

  it('новый элемент стоит по центру сцены', () => {
    const element = createElement('shape', scene(), STAGE);
    expect(element.x).toBeCloseTo(STAGE.width / 2 - element.width / 2, 6);
    expect(element.y).toBeCloseTo(STAGE.height / 2 - element.height / 2, 6);
  });

  it('на непустой сцене центрирование остаётся тем же — от размера сцены, не от соседей', () => {
    const existing = createElement('text', scene(), STAGE);
    const next = createElement('shape', scene({ elements: [existing] }), STAGE);
    expect(next.x).toBeCloseTo(STAGE.width / 2 - next.width / 2, 6);
    expect(next.y).toBeCloseTo(STAGE.height / 2 - next.height / 2, 6);
  });

  it('свободный идентификатор: два подряд созданных элемента не совпадают', () => {
    const first = createElement('text', scene(), STAGE);
    const second = createElement('text', scene({ elements: [first] }), STAGE);
    expect(second.id).not.toBe(first.id);
  });

  it('на пустой сцене zIndex начинается с нуля', () => {
    const element = createElement('shape', scene(), STAGE);
    expect(element.zIndex).toBe(0);
  });

  it('zIndex нового элемента на единицу больше максимального в сцене', () => {
    const first = createElement('shape', scene(), STAGE);
    const bumped: Element = { ...first, zIndex: 9 };
    const second = createElement('shape', scene({ elements: [bumped] }), STAGE);
    expect(second.zIndex).toBe(10);
  });
});

describe('removeElement: каскад по cues, gates не трогает', () => {
  it('убирает элемент из scene.elements', () => {
    const el = createElement('shape', scene(), STAGE);
    const s = scene({ elements: [el] });

    const { scene: next } = removeElement(s, el.id);

    expect(next.elements).toEqual([]);
  });

  it('каскадом удаляет только cues, нацеленные на этот элемент, и возвращает их', () => {
    const el = createElement('shape', scene(), STAGE);
    const other = createElement('shape', scene({ elements: [el] }), STAGE);
    const cueOnEl = cue('cue-a', el.id);
    const cueOnOther = cue('cue-b', other.id);
    const s = scene({ elements: [el, other], cues: [cueOnEl, cueOnOther] });

    const { scene: next, removedCues } = removeElement(s, el.id);

    expect(removedCues).toEqual([cueOnEl]);
    expect(next.cues).toEqual([cueOnOther]);
  });

  it('gates остаются тем же массивом по ссылке — у Gate нет ссылок на элементы', () => {
    const el = createElement('shape', scene(), STAGE);
    const g = gate('gate-1');
    const s = scene({ elements: [el], gates: [g] });

    const { scene: next } = removeElement(s, el.id);

    expect(next.gates).toBe(s.gates);
  });

  it('если ни один cue не задет, массив cues остаётся тем же по ссылке', () => {
    const el = createElement('shape', scene(), STAGE);
    const other = createElement('shape', scene({ elements: [el] }), STAGE);
    const cueOnOther = cue('cue-a', other.id);
    const s = scene({ elements: [el, other], cues: [cueOnOther] });

    const { scene: next } = removeElement(s, el.id);

    expect(next.cues).toBe(s.cues);
  });

  it('элементы, не задетые удалением, остаются теми же объектами по ссылке', () => {
    const el = createElement('shape', scene(), STAGE);
    const other = createElement('shape', scene({ elements: [el] }), STAGE);
    const s = scene({ elements: [el, other] });

    const { scene: next } = removeElement(s, el.id);

    expect(next.elements[0]).toBe(other);
  });

  it('удаление несуществующего элемента бросает громкую ошибку', () => {
    expect(() => removeElement(scene(), 'ghost')).toThrow('ghost');
  });
});

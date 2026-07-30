import { describe, expect, it } from 'vitest';

import type { Element, ElementState } from '@player/core';

import { toRows } from '../src/panels/elementRows.js';

function element(overrides: Partial<Element> & { id: string }): Element {
  return { type: 'shape', content: '', ...overrides };
}

function state(overrides: Partial<ElementState> = {}): ElementState {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    opacity: 1,
    visible: true,
    style: {},
    ...overrides,
  };
}

describe('toRows: порядок', () => {
  it('сортирует по убыванию zIndex — верхний слой сверху списка', () => {
    const low = element({ id: 'low' });
    const high = element({ id: 'high' });
    const mid = element({ id: 'mid' });
    const states = { low: state({ zIndex: 0 }), high: state({ zIndex: 5 }), mid: state({ zIndex: 2 }) };

    const rows = toRows([low, high, mid], states);

    expect(rows.map((row) => row.id)).toEqual(['high', 'mid', 'low']);
  });

  it('при равном zIndex порядок стабилен — по id', () => {
    const b = element({ id: 'b' });
    const a = element({ id: 'a' });
    const states = { b: state({ zIndex: 1 }), a: state({ zIndex: 1 }) };

    const rows = toRows([b, a], states);

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('не мутирует входной массив', () => {
    const elements = [element({ id: 'b' }), element({ id: 'a' })];
    const copy = [...elements];
    const states = { b: state({ zIndex: 1 }), a: state({ zIndex: 2 }) };

    toRows(elements, states);

    expect(elements).toEqual(copy);
  });

  it('пустая сцена даёт пустой список', () => {
    expect(toRows([], {})).toEqual([]);
  });

  it('элемент без состояния на этом слайде уходит в конец списка', () => {
    const onSlide = element({ id: 'here' });
    const notOnSlide = element({ id: 'later' });
    const states = { here: state({ zIndex: -100 }) };

    const rows = toRows([notOnSlide, onSlide], states);

    // Даже отрицательный zIndex присутствующего элемента побеждает
    // отсутствующего: отсутствие state не сравнимо с числом.
    expect(rows.map((row) => row.id)).toEqual(['here', 'later']);
    expect(rows.find((row) => row.id === 'here')!.onSlide).toBe(true);
    expect(rows.find((row) => row.id === 'later')!.onSlide).toBe(false);
  });

  it('несколько элементов без состояния упорядочены между собой по id', () => {
    const b = element({ id: 'b' });
    const a = element({ id: 'a' });

    const rows = toRows([b, a], {});

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
    expect(rows.every((row) => !row.onSlide)).toBe(true);
  });
});

describe('toRows: короткое содержимое', () => {
  it('текст — сам текст, обрезанный, если длинный', () => {
    const short = element({ id: 't1', type: 'text', content: 'Привет' });
    expect(toRows([short], { t1: state() })[0]!.summary).toBe('Привет');

    const long = element({ id: 't2', type: 'text', content: 'а'.repeat(100) });
    const summary = toRows([long], { t2: state() })[0]!.summary;
    expect(summary.length).toBeLessThan(45);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('пустой текст получает заметную заглушку, а не пустую строку', () => {
    const empty = element({ id: 't3', type: 'text', content: '   ' });
    expect(toRows([empty], { t3: state() })[0]!.summary).toBe('(пустой текст)');
  });

  it('текст схлопывает переносы строк в пробелы', () => {
    const multiline = element({ id: 't4', type: 'text', content: 'Строка1\nСтрока2' });
    expect(toRows([multiline], { t4: state() })[0]!.summary).toBe('Строка1 Строка2');
  });

  it('картинка без content — «ждёт файла»', () => {
    const el = element({ id: 'i1', type: 'image', content: '' });
    expect(toRows([el], { i1: state() })[0]!.summary).toContain('ждёт файла');
  });

  it('картинка с data-URI не показывает содержимое дословно', () => {
    const el = element({
      id: 'i2',
      type: 'image',
      content: 'data:image/png;base64,' + 'A'.repeat(500),
    });
    const summary = toRows([el], { i2: state() })[0]!.summary;
    expect(summary.length).toBeLessThan(50);
    expect(summary).not.toContain('base64');
  });

  it('картинка с путём/URL показывает его', () => {
    const el = element({ id: 'i3', type: 'image', content: '/img/photo.png' });
    expect(toRows([el], { i3: state() })[0]!.summary).toBe('/img/photo.png');
  });

  it('фигура с background в стиле показывает его', () => {
    const el = element({ id: 's1', type: 'shape' });
    const rows = toRows([el], { s1: state({ style: { background: '#1b2430' } }) });
    expect(rows[0]!.summary).toContain('#1b2430');
  });

  it('фигура без background в стиле — просто «фигура»', () => {
    const el = element({ id: 's2', type: 'shape' });
    expect(toRows([el], { s2: state() })[0]!.summary).toBe('фигура');
  });

  it('фигура без состояния на слайде — тоже просто «фигура», без падения', () => {
    const el = element({ id: 's3', type: 'shape' });
    expect(toRows([el], {})[0]!.summary).toBe('фигура');
  });
});

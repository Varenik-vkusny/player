import { describe, expect, it } from 'vitest';

import type { Element } from '@player/core';

import { toRows } from '../src/panels/elementRows.js';

function element(overrides: Partial<Element> & { id: string }): Element {
  return {
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    style: {},
    content: '',
    ...overrides,
  };
}

describe('toRows: порядок', () => {
  it('сортирует по убыванию zIndex — верхний слой сверху списка', () => {
    const low = element({ id: 'low', zIndex: 0 });
    const high = element({ id: 'high', zIndex: 5 });
    const mid = element({ id: 'mid', zIndex: 2 });

    const rows = toRows([low, high, mid]);

    expect(rows.map((row) => row.id)).toEqual(['high', 'mid', 'low']);
  });

  it('при равном zIndex порядок стабилен — по id', () => {
    const b = element({ id: 'b', zIndex: 1 });
    const a = element({ id: 'a', zIndex: 1 });

    const rows = toRows([b, a]);

    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('не мутирует входной массив', () => {
    const elements = [element({ id: 'b', zIndex: 1 }), element({ id: 'a', zIndex: 2 })];
    const copy = [...elements];

    toRows(elements);

    expect(elements).toEqual(copy);
  });

  it('пустая сцена даёт пустой список', () => {
    expect(toRows([])).toEqual([]);
  });
});

describe('toRows: короткое содержимое', () => {
  it('текст — сам текст, обрезанный, если длинный', () => {
    const short = element({ id: 't1', type: 'text', content: 'Привет' });
    expect(toRows([short])[0]!.summary).toBe('Привет');

    const long = element({ id: 't2', type: 'text', content: 'а'.repeat(100) });
    const summary = toRows([long])[0]!.summary;
    expect(summary.length).toBeLessThan(45);
    expect(summary.endsWith('…')).toBe(true);
  });

  it('пустой текст получает заметную заглушку, а не пустую строку', () => {
    const empty = element({ id: 't3', type: 'text', content: '   ' });
    expect(toRows([empty])[0]!.summary).toBe('(пустой текст)');
  });

  it('текст схлопывает переносы строк в пробелы', () => {
    const multiline = element({ id: 't4', type: 'text', content: 'Строка1\nСтрока2' });
    expect(toRows([multiline])[0]!.summary).toBe('Строка1 Строка2');
  });

  it('картинка без content — «ждёт файла»', () => {
    const el = element({ id: 'i1', type: 'image', content: '' });
    expect(toRows([el])[0]!.summary).toContain('ждёт файла');
  });

  it('картинка с data-URI не показывает содержимое дословно', () => {
    const el = element({
      id: 'i2',
      type: 'image',
      content: 'data:image/png;base64,' + 'A'.repeat(500),
    });
    const summary = toRows([el])[0]!.summary;
    expect(summary.length).toBeLessThan(50);
    expect(summary).not.toContain('base64');
  });

  it('картинка с путём/URL показывает его', () => {
    const el = element({ id: 'i3', type: 'image', content: '/img/photo.png' });
    expect(toRows([el])[0]!.summary).toBe('/img/photo.png');
  });

  it('фигура с background в стиле показывает его', () => {
    const el = element({ id: 's1', type: 'shape', style: { background: '#1b2430' } });
    expect(toRows([el])[0]!.summary).toContain('#1b2430');
  });

  it('фигура без background в стиле — просто «фигура»', () => {
    const el = element({ id: 's2', type: 'shape', style: {} });
    expect(toRows([el])[0]!.summary).toBe('фигура');
  });

  it('группа — «группа»', () => {
    const el = element({ id: 'g1', type: 'group' });
    expect(toRows([el])[0]!.summary).toBe('группа');
  });
});

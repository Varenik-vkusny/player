import { describe, expect, it } from 'vitest';

import { propbarStyleFields } from '../src/state/propbar.js';

/** Ключи из результата — то, что реально важно проверить, не порядок объектов. */
const keysOf = (fields: readonly { key: string }[]): string[] => fields.map((field) => field.key);

describe('propbarStyleFields: отбор полей стиля для полосы над холстом', () => {
  it('ничего не выделено — полоса не показывает полей стиля', () => {
    expect(propbarStyleFields([])).toEqual([]);
  });

  it('один текст — только частые поля: без line-height', () => {
    const keys = keysOf(propbarStyleFields(['text']));
    expect(keys).toEqual(['font-family', 'font-size', 'font-weight', 'color', 'text-align']);
    expect(keys).not.toContain('line-height');
  });

  it('одна картинка — только border-radius, без background', () => {
    const keys = keysOf(propbarStyleFields(['image']));
    expect(keys).toEqual(['border-radius']);
    expect(keys).not.toContain('background');
  });

  it('одна фигура — оба применимых поля разом: background и border-radius', () => {
    const keys = keysOf(propbarStyleFields(['shape']));
    expect(keys).toEqual(['background', 'border-radius']);
  });

  it('двое выделенных РАЗНЫХ типов (текст + фигура) — пересечение appliesTo, ' +
    'а не частый список: только background и border-radius, применимые к обоим', () => {
    const keys = keysOf(propbarStyleFields(['text', 'shape']));
    expect(keys).toEqual(['background', 'border-radius']);
    // Текстовые поля не входят: они не применимы к фигуре.
    expect(keys).not.toContain('font-family');
    expect(keys).not.toContain('color');
  });

  it('двое выделенных ОДНОГО типа (два текста) — правило множественного выделения ' +
    'всё равно действует: полный список применимых полей, а не частый (line-height ' +
    'и background/border-radius, скрытые у одиночного текста, здесь есть)', () => {
    const keys = keysOf(propbarStyleFields(['text', 'text']));
    expect(keys).toEqual([
      'font-family', 'font-size', 'font-weight', 'color', 'text-align',
      'line-height', 'background', 'border-radius',
    ]);
  });

  it('трое выделенных смешанных типов (текст, картинка, фигура) — общие поля ' +
    'те же background/border-radius: appliesTo у обоих — ALL_TYPES, поэтому оба ' +
    'применимы ко всем трём типам разом, а текстовые поля отсеиваются', () => {
    const keys = keysOf(propbarStyleFields(['text', 'image', 'shape']));
    expect(keys).toEqual(['background', 'border-radius']);
  });

  it('video/group — типов без частого списка в каркасе — отдаются все применимые поля', () => {
    expect(keysOf(propbarStyleFields(['video']))).toEqual(['background', 'border-radius']);
    expect(keysOf(propbarStyleFields(['group']))).toEqual(['background', 'border-radius']);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ANIMATABLE, loadProject, type Project } from '@player/core';

import {
  getStyleValue,
  readStyleEntry,
  setStyleValue,
  styleFieldsFor,
  STYLE_FIELDS,
  type ElementStyle,
  type LengthOrPercent,
  type StyleFieldKey,
} from '../src/state/style.js';

/** Образцы авторских значений — по одному на поле, не равные значению по умолчанию. */
const SAMPLES: Record<StyleFieldKey, string | number | LengthOrPercent> = {
  'font-family': 'Georgia, serif',
  'font-size': 52,
  'font-weight': '700',
  color: '#ff00aa',
  'text-align': 'center',
  'line-height': 1.2,
  background: '#112233',
  'border-radius': { amount: 12, unit: 'px' },
};

function parsed(value: string | number | LengthOrPercent) {
  return { kind: 'parsed' as const, value };
}

describe('STYLE_FIELDS: утверждённый набор восьми полей', () => {
  it('ровно восемь полей, ключи kebab-case, как в ADR-012', () => {
    expect(STYLE_FIELDS.map((field) => field.key)).toEqual([
      'font-family',
      'font-size',
      'font-weight',
      'color',
      'text-align',
      'line-height',
      'background',
      'border-radius',
    ]);
  });

  it('ни один ключ не пересекается с ANIMATABLE — иначе стиль и анимация подерутся за одно свойство', () => {
    const animatable = new Set<string>(ANIMATABLE);
    for (const field of STYLE_FIELDS) {
      expect(animatable.has(field.key)).toBe(false);
    }
  });

  it('padding, margin и border в набор не входят — ни одно поле не двигает раскладку за бокс', () => {
    const keys = STYLE_FIELDS.map((field) => field.key);
    expect(keys).not.toContain('padding');
    expect(keys).not.toContain('margin');
    expect(keys).not.toContain('border');
  });

  it('текстовые поля применимы только к text — у shape и image их нет', () => {
    const textOnlyKeys: StyleFieldKey[] = [
      'font-family',
      'font-size',
      'font-weight',
      'color',
      'text-align',
      'line-height',
    ];
    for (const type of ['shape', 'image'] as const) {
      const keys = styleFieldsFor(type).map((field) => field.key);
      for (const textKey of textOnlyKeys) {
        expect(keys).not.toContain(textKey);
      }
    }
  });

  it('background и border-radius применимы ко всем типам, включая text', () => {
    for (const type of ['text', 'shape', 'image', 'group'] as const) {
      const keys = styleFieldsFor(type).map((field) => field.key);
      expect(keys).toContain('background');
      expect(keys).toContain('border-radius');
    }
  });

  it('у text ровно восемь применимых полей — весь набор', () => {
    expect(styleFieldsFor('text')).toHaveLength(8);
  });

  it('у shape и image ровно два применимых поля — background и border-radius', () => {
    expect(styleFieldsFor('shape').map((f) => f.key)).toEqual(['background', 'border-radius']);
    expect(styleFieldsFor('image').map((f) => f.key)).toEqual(['background', 'border-radius']);
  });
});

describe('круговой проход: значение → строка → значение — главный тест модуля', () => {
  it.each(STYLE_FIELDS.map((field) => field.key))('поле «%s» с авторским значением', (key) => {
    const sample = SAMPLES[key];
    const style = setStyleValue({}, key, sample);
    expect(getStyleValue(style, key)).toEqual(parsed(sample));
  });

  it.each(STYLE_FIELDS.map((field) => field.key))('поле «%s» со значением по умолчанию', (key) => {
    const field = STYLE_FIELDS.find((f) => f.key === key)!;
    const style = setStyleValue({}, key, field.default);
    expect(getStyleValue(style, key)).toEqual(parsed(field.default));
  });

  it('отсутствующий в style ключ читается как значение по умолчанию поля', () => {
    for (const field of STYLE_FIELDS) {
      expect(getStyleValue({}, field.key)).toEqual(parsed(field.default));
    }
  });

  it('числовая длина без единиц ("36") разбирается так же, как с "px"', () => {
    expect(getStyleValue({ 'font-size': '36' }, 'font-size')).toEqual(parsed(36));
    expect(getStyleValue({ 'font-size': '36px' }, 'font-size')).toEqual(parsed(36));
  });

  it('border-radius: круговой проход одинаково работает для px и для %', () => {
    const pxStyle = setStyleValue({}, 'border-radius', { amount: 28, unit: 'px' });
    expect(pxStyle).toEqual({ 'border-radius': '28px' });
    expect(getStyleValue(pxStyle, 'border-radius')).toEqual(parsed({ amount: 28, unit: 'px' }));

    const pctStyle = setStyleValue({}, 'border-radius', { amount: 50, unit: '%' });
    expect(pctStyle).toEqual({ 'border-radius': '50%' });
    expect(getStyleValue(pctStyle, 'border-radius')).toEqual(parsed({ amount: 50, unit: '%' }));
  });

  it('border-radius принимает и строку с единицей напрямую ("50%"), не только объект', () => {
    const style = setStyleValue({}, 'border-radius', '50%');
    expect(getStyleValue(style, 'border-radius')).toEqual(parsed({ amount: 50, unit: '%' }));
  });
});

describe('setStyleValue: сброс удаляет ключ, не пишет пустую строку', () => {
  it('пустая строка удаляет существующий ключ', () => {
    const style: ElementStyle = { color: '#ffffff' };
    const next = setStyleValue(style, 'color', '');
    expect(Object.prototype.hasOwnProperty.call(next, 'color')).toBe(false);
  });

  it('undefined и null тоже удаляют ключ', () => {
    const style: ElementStyle = { 'font-size': '36px' };
    expect(setStyleValue(style, 'font-size', undefined)).toEqual({});
    expect(setStyleValue(style, 'font-size', null)).toEqual({});
  });

  it('пробельная строка тоже считается сбросом', () => {
    const style: ElementStyle = { color: '#ffffff' };
    expect(setStyleValue(style, 'color', '   ')).toEqual({});
  });

  it('сброс отсутствующего ключа — no-op, тот же объект style по ссылке', () => {
    const style: ElementStyle = { background: '#000000' };
    const next = setStyleValue(style, 'color', '');
    expect(next).toBe(style);
  });
});

describe('ссылочная целостность: без изменений — тот же объект по ссылке', () => {
  it('запись уже сохранённого значения возвращает тот же объект style', () => {
    const style: ElementStyle = { color: '#9fb0c4' };
    expect(setStyleValue(style, 'color', '#9fb0c4')).toBe(style);
  });

  it('эквивалентное представление длины (число 36 vs строка "36px") не создаёт новый объект', () => {
    const style: ElementStyle = { 'font-size': '36px' };
    expect(setStyleValue(style, 'font-size', 36)).toBe(style);
  });

  it('изменение одного поля не трогает значения соседних ключей', () => {
    const style: ElementStyle = { color: '#111111', background: '#222222' };
    const next = setStyleValue(style, 'color', '#333333');
    expect(next).not.toBe(style);
    expect(next.background).toBe('#222222');
  });

  it('чужой ключ style (например, opacity под управлением анимации) остаётся нетронутым', () => {
    const style: ElementStyle = { opacity: '0', color: '#111111' };
    const next = setStyleValue(style, 'color', '#222222');
    expect(next.opacity).toBe('0');
  });

  it('раскладка не разбираемого значения известного поля не теряется при записи соседнего', () => {
    // font-weight: 'толстый' — не из закрытого списка, но это данные, а не повод падать (см. ниже).
    // Запись color не должна тронуть этот "raw" ключ.
    const style: ElementStyle = { 'font-weight': 'толстый', color: '#111111' };
    const next = setStyleValue(style, 'color', '#222222');
    expect(next['font-weight']).toBe('толстый');
  });
});

describe('чтение значения, которого модуль не понимает, — raw, а не throw', () => {
  it('getStyleValue: значение choice-поля вне закрытого списка читается как raw', () => {
    expect(getStyleValue({ 'font-weight': 'толстый' }, 'font-weight')).toEqual({
      kind: 'raw',
      text: 'толстый',
    });
  });

  it('getStyleValue: нечисловая длина читается как raw', () => {
    expect(getStyleValue({ 'font-size': 'большой' }, 'font-size')).toEqual({
      kind: 'raw',
      text: 'большой',
    });
  });

  it('getStyleValue: нечисловое значение number-поля читается как raw', () => {
    expect(getStyleValue({ 'line-height': 'normal' }, 'line-height')).toEqual({
      kind: 'raw',
      text: 'normal',
    });
  });

  it('getStyleValue: border-radius в неизвестной единице читается как raw', () => {
    expect(getStyleValue({ 'border-radius': '2em' }, 'border-radius')).toEqual({
      kind: 'raw',
      text: '2em',
    });
  });

  it('readStyleEntry: то же поведение, что у getStyleValue, для известных ключей', () => {
    expect(readStyleEntry({ 'font-weight': 'толстый' }, 'font-weight')).toEqual({
      kind: 'raw',
      text: 'толстый',
    });
  });

  it('readStyleEntry: незнакомый ключ (вне STYLE_FIELDS) не бросает — это ожидаемый случай, не баг', () => {
    expect(readStyleEntry({ opacity: '0' }, 'opacity')).toEqual({ kind: 'raw', text: '0' });
    expect(readStyleEntry({ border: '2px solid #2c3a4d' }, 'border')).toEqual({
      kind: 'raw',
      text: '2px solid #2c3a4d',
    });
  });

  it('readStyleEntry: отсутствующий незнакомый ключ — raw с пустым текстом, тоже не бросает', () => {
    expect(readStyleEntry({}, 'filter')).toEqual({ kind: 'raw', text: '' });
  });
});

describe('ошибки — громкие и по-русски, только там, где это баг вызывающего', () => {
  it('getStyleValue: неизвестное поле стиля — баг вызывающего, бросает', () => {
    expect(() => getStyleValue({}, 'padding' as StyleFieldKey)).toThrow(/восьми/);
  });

  it('setStyleValue: неизвестное поле стиля — баг вызывающего, бросает', () => {
    expect(() => setStyleValue({}, 'padding' as StyleFieldKey, '1px')).toThrow(/восьми/);
  });

  it('setStyleValue: значение вне списка для choice-поля бросает ошибку', () => {
    expect(() => setStyleValue({}, 'text-align', 'diagonal')).toThrow(/список/);
  });

  it('setStyleValue: нечисловая длина бросает ошибку', () => {
    expect(() => setStyleValue({}, 'font-size', 'большой')).toThrow(/длину/);
  });

  it('setStyleValue: border-radius с недопустимой единицей бросает ошибку', () => {
    expect(() => setStyleValue({}, 'border-radius', { amount: 10, unit: 'em' as '%' })).toThrow(
      /border-radius/,
    );
  });

  it('setStyleValue: объект там, где ждут скаляр (например, color), бросает явную ошибку', () => {
    expect(() => setStyleValue({}, 'color', { amount: 1, unit: 'px' } as unknown as string)).toThrow(
      /объект/,
    );
  });
});

describe('demo.json: обход каждого элемента и каждого ключа style не бросает', () => {
  const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

  function loadDemoElements(): { id: string; style: Record<string, string | number> }[] {
    const raw = JSON.parse(readFileSync(join(FIXTURES, 'demo.json'), 'utf8')) as {
      scene: { elements: { id: string; style: Record<string, string | number> }[] };
    };
    return raw.scene.elements;
  }

  it('readStyleEntry не бросает ни на одном ключе style реального проекта — эталонная фикстура не роняет панель', () => {
    const elements = loadDemoElements();
    let sawRaw = false;
    let sawParsed = false;

    for (const element of elements) {
      for (const key of Object.keys(element.style)) {
        expect(() => readStyleEntry(element.style, key)).not.toThrow();
        const result = readStyleEntry(element.style, key);
        if (result.kind === 'raw') sawRaw = true;
        if (result.kind === 'parsed') sawParsed = true;
      }
    }

    // Тест не должен быть пустым: в demo.json реально встречаются оба случая.
    expect(sawRaw).toBe(true); // opacity, border — ключи вне набора восьми
    expect(sawParsed).toBe(true); // color, font-size и т. п. — известные поля
  });

  it('opacity под управлением анимации — не в наборе восьми — читается как raw, не бросает', () => {
    const title = loadDemoElements().find((e) => e.id === 'title')!;
    expect(readStyleEntry(title.style, 'opacity')).toEqual({ kind: 'raw', text: '0' });
  });

  it('border, вписанный руками в card, — не в наборе восьми — читается как raw, не бросает', () => {
    const card = loadDemoElements().find((e) => e.id === 'card')!;
    expect(readStyleEntry(card.style, 'border')).toEqual({ kind: 'raw', text: '2px solid #2c3a4d' });
  });

  it('border-radius: 50% у элемента dot теперь честно разбирается, а не падает и не остаётся raw', () => {
    const dot = loadDemoElements().find((e) => e.id === 'dot')!;
    expect(getStyleValue(dot.style, 'border-radius')).toEqual(parsed({ amount: 50, unit: '%' }));
  });
});

describe('интеграция со схемой: результат подставляется в элемент и проходит loadProject', () => {
  function baseProject(): Project {
    return {
      schemaVersion: 2,
      meta: { title: 'Стиль: тест', stageWidth: 1920, stageHeight: 1080 },
      entry: 'node-1',
      nodes: [
        {
          id: 'node-1',
          title: '',
          audio: { src: 'audio/test.mp3', duration: 10, words: [] },
          scene: {
            elements: [
              {
                id: 'headline',
                type: 'text',
                x: 0,
                y: 0,
                width: 400,
                height: 100,
                rotation: 0,
                zIndex: 0,
                style: {},
                content: 'Заголовок',
              },
              {
                id: 'panel',
                type: 'shape',
                x: 0,
                y: 0,
                width: 200,
                height: 200,
                rotation: 0,
                zIndex: 0,
                style: {},
                content: '',
              },
            ],
            cues: [],
            gates: [],
          },
          edges: [],
        },
      ],
    };
  }

  it('стиль, собранный через setStyleValue для всех применимых полей text и shape, проходит валидацию схемы', () => {
    const project = baseProject();
    const [headline, panel] = project.nodes[0]!.scene.elements;

    let headlineStyle: ElementStyle = headline!.style;
    for (const field of styleFieldsFor('text')) {
      headlineStyle = setStyleValue(headlineStyle, field.key, SAMPLES[field.key]);
    }

    let panelStyle: ElementStyle = panel!.style;
    for (const field of styleFieldsFor('shape')) {
      panelStyle = setStyleValue(panelStyle, field.key, SAMPLES[field.key]);
    }

    const next: Project = {
      ...project,
      nodes: [
        {
          ...project.nodes[0]!,
          scene: {
            ...project.nodes[0]!.scene,
            elements: [
              { ...headline!, style: headlineStyle },
              { ...panel!, style: panelStyle },
            ],
          },
        },
      ],
    };

    const loaded = loadProject(next);
    expect(loaded.nodes[0]!.scene.elements[0]!.style).toEqual(headlineStyle);
    expect(loaded.nodes[0]!.scene.elements[1]!.style).toEqual(panelStyle);

    // И обратно: то, что реально загрузила схема, читается этим же модулем без ошибок.
    for (const field of styleFieldsFor('text')) {
      expect(getStyleValue(loaded.nodes[0]!.scene.elements[0]!.style, field.key)).toEqual(parsed(SAMPLES[field.key]));
    }
  });
});

/**
 * Библиотека заготовок — тесты того, что каталог действительно ДАННЫЕ,
 * а не код (см. state/library.ts и docs/planning.md).
 *
 * Ключевой тест здесь — «пополнение не требует правок в React»: он не может
 * быть зелёным впустую, потому что читает исходник InsertPanel.tsx
 * с диска (как это уже делает packages/core/test/invariants.test.ts) и
 * проваливается, если label или id заготовки встречаются в разметке
 * компонента, — то есть каталог оказался продублирован в JSX, а не
 * прочитан из ELEMENT_LIBRARY.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ElementSchema, ElementStateSchema, ProjectSchema, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { ElementState, Gate, Segment } from '@player/core';

import { createElement } from '../src/state/elements.js';
import { ANIMATION_PRESETS, ELEMENT_LIBRARY, libraryItem } from '../src/state/library.js';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);
const STAGE = { width: 1920, height: 1080 };

function segment(): Segment {
  return {
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };
}

function emptyStates(): Record<string, ElementState> {
  return {};
}

describe('ELEMENT_LIBRARY: каждая заготовка даёт элемент и состояние, принятые настоящей схемой', () => {
  for (const item of ELEMENT_LIBRARY) {
    it(`«${item.id}» проходит ElementSchema.parse и ElementStateSchema.parse`, () => {
      const { element, state } = createElement(item, segment(), emptyStates(), STAGE);
      // Через настоящую схему, а не самодельную проверку: у писателя
      // и читателя одной и той же реализации была бы одна и та же
      // возможная ошибка (CLAUDE.md, «своим парсером свой формат не
      // проверяется»).
      expect(() => ElementSchema.parse(element)).not.toThrow();
      expect(() => ElementStateSchema.parse(state)).not.toThrow();
    });
  }
});

describe('ELEMENT_LIBRARY: первые три заготовки не изменили поведение', () => {
  it('text: 600×120, стиль и заглушка как раньше', () => {
    const { state, element } = createElement(libraryItem('text'), segment(), emptyStates(), STAGE);
    expect(state.width).toBe(600);
    expect(state.height).toBe(120);
    expect(state.style).toEqual({
      'font-family': 'system-ui, sans-serif',
      'font-size': '36px',
      color: '#9fb0c4',
      'line-height': '1.5',
    });
    expect(element.content).toBe('Новый текст');
  });

  it('shape: 300×300, стиль как раньше, содержимого нет', () => {
    const { state, element } = createElement(libraryItem('shape'), segment(), emptyStates(), STAGE);
    expect(state.width).toBe(300);
    expect(state.height).toBe(300);
    expect(state.style).toEqual({ background: '#1b2430', 'border-radius': '28px' });
    expect(element.content).toBe('');
  });

  it('image: 480×320, стиль пустой, содержимое пустое', () => {
    const { state, element } = createElement(libraryItem('image'), segment(), emptyStates(), STAGE);
    expect(state.width).toBe(480);
    expect(state.height).toBe(320);
    expect(state.style).toEqual({});
    expect(element.content).toBe('');
  });
});

describe('createElement: id элемента берётся из id заготовки', () => {
  it('круг даёт id circle-1, а не shape-4', () => {
    const { element } = createElement(libraryItem('circle'), segment(), emptyStates(), STAGE);
    expect(element.id).toBe('circle-1');
  });

  it('второй круг на том же сегменте — circle-2', () => {
    const first = createElement(libraryItem('circle'), segment(), emptyStates(), STAGE);
    const seg = { ...segment(), elements: [first.element] };
    const second = createElement(libraryItem('circle'), seg, { [first.element.id]: first.state }, STAGE);
    expect(second.element.id).toBe('circle-2');
  });
});

describe('libraryItem: поиск по id', () => {
  it('находит заготовку', () => {
    expect(libraryItem('arrow').label).toBe('Стрелка');
  });

  it('бросает громкую ошибку на неизвестном id', () => {
    expect(() => libraryItem('нет-такой')).toThrow(/нет-такой/);
  });
});

describe('ELEMENT_LIBRARY: категория делит каталог между тремя панелями вставки', () => {
  const VALID_CATEGORIES = ['shape', 'text', 'own'];

  for (const item of ELEMENT_LIBRARY) {
    it(`«${item.id}» имеет одну из трёх допустимых категорий`, () => {
      expect(VALID_CATEGORIES).toContain(item.category);
    });
  }

  for (const category of VALID_CATEGORIES) {
    it(`в категории «${category}» есть хотя бы одна заготовка`, () => {
      expect(ELEMENT_LIBRARY.some((item) => item.category === category)).toBe(true);
    });
  }
});

describe('ELEMENT_LIBRARY: уникальность', () => {
  it('id заготовок не повторяются', () => {
    const ids = ELEMENT_LIBRARY.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('label заготовок не повторяются', () => {
    const labels = ELEMENT_LIBRARY.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('пополнение ELEMENT_LIBRARY не требует правок в React', () => {
  const insertPanelSource = readFileSync(
    join(ROOT, 'packages', 'editor', 'src', 'panels', 'InsertPanel.tsx'),
    'utf8',
  );

  const added = ELEMENT_LIBRARY.filter(
    (item) => !['text', 'shape', 'image'].includes(item.id),
  );

  it('каталог действительно пополнен сверх исходных трёх — иначе проверка ничего не проверяет', () => {
    expect(added.length).toBeGreaterThan(0);
  });

  for (const item of added) {
    it(`id «${item.id}» не встречается в исходнике InsertPanel.tsx`, () => {
      expect(insertPanelSource).not.toContain(`'${item.id}'`);
      expect(insertPanelSource).not.toContain(`"${item.id}"`);
    });

    it(`label «${item.label}» не встречается в исходнике InsertPanel.tsx`, () => {
      expect(insertPanelSource).not.toContain(item.label);
    });
  }

  it('сам компонент не содержит списка заготовок — только чтение ELEMENT_LIBRARY', () => {
    expect(insertPanelSource).toContain('ELEMENT_LIBRARY');
    expect(insertPanelSource).not.toMatch(/const ITEMS/);
  });
});

describe('ANIMATION_PRESETS: заготовки появления', () => {
  it('id заготовок не повторяются', () => {
    const ids = ANIMATION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('label заготовок не повторяются', () => {
    const labels = ANIMATION_PRESETS.map((preset) => preset.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('у каждой заготовки задан хотя бы один патч появления', () => {
    for (const preset of ANIMATION_PRESETS) {
      const hasPatch =
        preset.hiddenAtStart === true || preset.dx !== undefined || preset.dy !== undefined || preset.growFrom !== undefined;
      expect(hasPatch, `заготовка «${preset.id}» не меняет ничего в начальном состоянии`).toBe(true);
    }
  });

  it('growFrom, если задан, — «both» или «width»', () => {
    for (const preset of ANIMATION_PRESETS) {
      if (preset.growFrom !== undefined) {
        expect(['both', 'width']).toContain(preset.growFrom);
      }
    }
  });
});

/**
 * Фигура из библиотеки — обычный элемент сцены, значит она может быть
 * вариантом ответа наравне с текстом (ADR-011: вариант гейта ссылается
 * на элемент по id, а тип элемента в этой связи не участвует).
 *
 * Утверждение звучит очевидно, и именно поэтому проверяется прогоном:
 * «вариант — это элемент» держится на том, что `option.id` совпадает с id
 * элемента, а не на типе, и сломать это можно, не заметив.
 */
describe('фигура библиотеки может быть вариантом ответа', () => {
  it('гейт с вариантами-фигурами проходит настоящий валидатор', () => {
    const stage = { width: 1920, height: 1080 };
    let seg = segment();
    let states: Record<string, ElementState> = {};

    const yes = createElement(libraryItem('circle'), seg, states, stage);
    seg = { ...seg, elements: [...seg.elements, yes.element] };
    states = { ...states, [yes.element.id]: yes.state };

    const no = createElement(libraryItem('frame'), seg, states, stage);
    seg = { ...seg, elements: [...seg.elements, no.element] };
    states = { ...states, [no.element.id]: no.state };

    // Оба варианта — фигуры, ни одного текста в сцене нет вовсе.
    expect(seg.elements.every((element) => element.type === 'shape')).toBe(true);

    const gate: Gate = {
      id: 'gate-1',
      at: { kind: 'seconds', t: 1 },
      config: {
        kind: 'choice',
        prompt: 'Выбери фигуру',
        options: [
          { id: yes.element.id, label: 'Круг' },
          { id: no.element.id, label: 'Рамка' },
        ],
        correctId: yes.element.id,
      },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'gate-1',
    };

    const project = {
      schemaVersion: SCHEMA_VERSION,
      meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
      entry: 'seg-1',
      segments: [
        {
          ...seg,
          slides: [{ id: 'slide-1', at: { kind: 'seconds' as const, t: 0 }, transition: 'morph' as const, transitionSeconds: 0.6, states }],
          gates: [gate],
          exit: { rules: [], default: null },
        },
      ],
    };

    const parsed = ProjectSchema.safeParse(project);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });
});

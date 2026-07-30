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

import { ANIMATABLE, ElementSchema } from '@player/core';

import { EASINGS } from '../src/state/animation.js';
import { createElement } from '../src/state/elements.js';
import { ANIMATION_PRESETS, ELEMENT_LIBRARY, libraryItem } from '../src/state/library.js';
import { ProjectSchema } from '@player/core';
import type { Gate, Scene } from '@player/core';

const ROOT = new URL('../../../', import.meta.url).pathname.slice(1);
const STAGE = { width: 1920, height: 1080 };

function scene() {
  return { elements: [], cues: [], gates: [] };
}

describe('ELEMENT_LIBRARY: каждая заготовка даёт элемент, принятый настоящей схемой', () => {
  for (const item of ELEMENT_LIBRARY) {
    it(`«${item.id}» проходит ElementSchema.parse`, () => {
      const element = createElement(item, scene(), STAGE);
      // Через настоящую схему, а не самодельную проверку: у писателя
      // и читателя одной и той же реализации была бы одна и та же
      // возможная ошибка (CLAUDE.md, «своим парсером свой формат не
      // проверяется»).
      expect(() => ElementSchema.parse(element)).not.toThrow();
    });
  }
});

describe('ELEMENT_LIBRARY: первые три заготовки не изменили поведение', () => {
  it('text: 600×120, стиль и заглушка как раньше в DEFAULT_STYLE/TEXT_PLACEHOLDER', () => {
    const element = createElement(libraryItem('text'), scene(), STAGE);
    expect(element.width).toBe(600);
    expect(element.height).toBe(120);
    expect(element.style).toEqual({
      'font-family': 'system-ui, sans-serif',
      'font-size': '36px',
      color: '#9fb0c4',
      'line-height': '1.5',
    });
    expect(element.content).toBe('Новый текст');
  });

  it('shape: 300×300, стиль как раньше в DEFAULT_STYLE, содержимого нет', () => {
    const element = createElement(libraryItem('shape'), scene(), STAGE);
    expect(element.width).toBe(300);
    expect(element.height).toBe(300);
    expect(element.style).toEqual({ background: '#1b2430', 'border-radius': '28px' });
    expect(element.content).toBe('');
  });

  it('image: 480×320, стиль пустой, содержимое пустое', () => {
    const element = createElement(libraryItem('image'), scene(), STAGE);
    expect(element.width).toBe(480);
    expect(element.height).toBe(320);
    expect(element.style).toEqual({});
    expect(element.content).toBe('');
  });
});

describe('createElement: id элемента берётся из id заготовки', () => {
  it('круг даёт id circle-1, а не shape-4', () => {
    const element = createElement(libraryItem('circle'), scene(), STAGE);
    expect(element.id).toBe('circle-1');
  });

  it('второй круг на той же сцене — circle-2', () => {
    const first = createElement(libraryItem('circle'), scene(), STAGE);
    const second = createElement(libraryItem('circle'), { ...scene(), elements: [first] }, STAGE);
    expect(second.id).toBe('circle-2');
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

  // Заготовки, добавленные этим срезом сверх исходных трёх (text/shape/image
  // упоминались в компоненте и раньше — они формировали единственный жёстко
  // заданный список ITEMS). Проверяем именно новые записи: их id и label
  // не имеют права появиться в исходнике компонента, иначе панель вставки
  // продолжает знать о конкретных фигурах, а не читать каталог целиком.
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
    // Прежний захардкоженный список (для примера — константа ITEMS
    // с типом и подписью прямо в JSX) не должен вернуться.
    expect(insertPanelSource).not.toMatch(/const ITEMS/);
  });
});

describe('ANIMATION_PRESETS: заготовки анимации', () => {
  it('ease каждой заготовки — из EASINGS (иначе anime.js молча поставит linear)', () => {
    for (const preset of ANIMATION_PRESETS) {
      expect(EASINGS, `плавность «${preset.ease}» заготовки «${preset.id}»`).toContain(preset.ease);
    }
  });

  it('property каждой заготовки — из ANIMATABLE', () => {
    for (const preset of ANIMATION_PRESETS) {
      expect(ANIMATABLE as readonly string[]).toContain(preset.property);
    }
  });

  it('id заготовок не повторяются', () => {
    const ids = ANIMATION_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('label заготовок не повторяются', () => {
    const labels = ANIMATION_PRESETS.map((preset) => preset.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('durationMs — положительное конечное число, как того требует схема AnimationSpec', () => {
    for (const preset of ANIMATION_PRESETS) {
      expect(Number.isFinite(preset.durationMs)).toBe(true);
      expect(preset.durationMs).toBeGreaterThan(0);
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
    let scene: Scene = { elements: [], cues: [], gates: [] };

    const yes = createElement(libraryItem('circle'), scene, stage);
    scene = { ...scene, elements: [...scene.elements, yes] };
    const no = createElement(libraryItem('frame'), scene, stage);
    scene = { ...scene, elements: [...scene.elements, no] };

    // Оба варианта — фигуры, ни одного текста в сцене нет вовсе.
    expect(scene.elements.every((element) => element.type === 'shape')).toBe(true);

    const gate: Gate = {
      id: 'gate-1',
      at: { kind: 'seconds', t: 1 },
      config: {
        kind: 'choice',
        prompt: 'Выбери фигуру',
        options: [
          { id: yes.id, label: 'Круг' },
          { id: no.id, label: 'Рамка' },
        ],
        correctId: yes.id,
      },
      onWrong: 'continue',
      maxAttempts: null,
    };

    const project = {
      schemaVersion: 2 as const,
      meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
      entry: 'n1',
      nodes: [
        {
          id: 'n1',
          title: '',
          audio: { src: 'a.mp3', duration: 10, words: [] },
          scene: { ...scene, gates: [gate] },
          edges: [],
        },
      ],
    };

    const parsed = ProjectSchema.safeParse(project);
    expect(
      parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe('ok');
  });
});

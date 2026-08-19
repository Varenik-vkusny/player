/**
 * Схема на плитке каталога обязана показывать ТО, ЧТО ЛЯЖЕТ.
 *
 * Это единственное, ради чего плитка затевалась: подписи «Заголовок» и
 * «Заголовок и текст» на 152 px неразличимы, и всю работу делает рисунок.
 * Рисунок, разошедшийся с тем, что кладёт `applyTemplate`, хуже подписи —
 * он врёт уверенно.
 *
 * Что должно сломаться, чтобы тест покраснел: любое расхождение между
 * `templateShapes` (рисует) и `applyTemplate` (кладёт) — знак `dy`, потеря
 * `width`/`height` заготовки, отсчёт от угла сцены вместо центра. Проверено
 * сломом, см. отчёт Сессии 52.
 *
 * Откуда взято то, с чем сравниваю: НЕ из `templateShapes` и не из его копии,
 * а из настоящего `applyTemplate`, прогнанного на настоящей схеме сегмента.
 * Второй вопрос после «что сломается» — «откуда взято ожидаемое», и здесь
 * ответ такой: из другого модуля, который об этом тесте ничего не знает.
 */
import { describe, expect, it } from 'vitest';

import type { Segment } from '@player/core';

import { ELEMENT_LIBRARY } from '../src/state/library.js';
import { applyTemplate, SCENE_TEMPLATES } from '../src/state/templates.js';
import { fillOf, objectShape, radiusOf, templateShapes, toneOf } from '../src/panels/thumbShapes.js';

const STAGE = { width: 1920, height: 1080 };

function emptySegment(): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'audio/test.mp3', offset: 0, duration: 3, words: [] },
    elements: [],
    slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };
}

/** Прямоугольник в сравнимом виде: округление до сотой убирает шум float. */
function box(b: { x: number; y: number; width: number; height: number }): string {
  const n = (v: number): string => v.toFixed(2);
  return `${n(b.x)},${n(b.y)},${n(b.width)},${n(b.height)}`;
}

describe('плитка шаблона показывает то, что ляжет на сцену', () => {
  it('каталог шаблонов не пуст — иначе проверка ничего не проверяет', () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThan(0);
  });

  for (const template of SCENE_TEMPLATES) {
    it(`«${template.id}»: прямоугольники схемы совпадают с состояниями на сцене`, () => {
      const segment = applyTemplate(template, emptySegment(), STAGE);

      // Последний слайд: на нём все элементы уже появились, то есть стоят
      // в ФИНАЛЬНЫХ состояниях. На первом слайде часть из них ещё сдвинута
      // заготовкой появления, и сравнивать надо не с ней.
      const last = segment.slides[segment.slides.length - 1];
      expect(last).toBeDefined();
      const placed = Object.values(last!.states).map(box).sort();

      const drawn = templateShapes(template, STAGE).map(box).sort();

      expect(drawn).toEqual(placed);
    });
  }
});

describe('схема выводится из полей заготовки, а не из её имени', () => {
  it('«50%» даёт круг, а не скругление в пикселях', () => {
    // Ровно та ошибка, которая однажды уронила панель на эталонной фикстуре:
    // поле, сделанное «очевидно» пиксельным, круг не выражает вовсе.
    expect(radiusOf({ 'border-radius': '50%' })).toBe('round');
  });

  it('пиксельное скругление читается числом', () => {
    expect(radiusOf({ 'border-radius': '28px' })).toBe(28);
  });

  it('скругления нет — и в схеме его нет', () => {
    expect(radiusOf({})).toBeUndefined();
  });

  it('прозрачный фон даёт контур, залитый — сплошную фигуру', () => {
    expect(fillOf({ background: 'transparent' })).toBe('outline');
    expect(fillOf({ background: '#1b2430' })).toBe('solid');
  });

  it('фон делает фигуру подложкой, его отсутствие — несущей', () => {
    expect(toneOf({ background: '#1b2430' })).toBe('soft');
    expect(toneOf({})).toBe('strong');
  });
});

describe('плитка элемента сохраняет пропорции заготовки', () => {
  const FIELD = 100;

  for (const item of ELEMENT_LIBRARY) {
    it(`«${item.id}»: отношение сторон схемы равно отношению сторон заготовки`, () => {
      const shape = objectShape(item, FIELD);
      expect(shape.width / shape.height).toBeCloseTo(item.width / item.height, 5);
    });

    it(`«${item.id}»: схема целиком помещается в поле плитки`, () => {
      const shape = objectShape(item, FIELD);
      expect(shape.x).toBeGreaterThanOrEqual(0);
      expect(shape.y).toBeGreaterThanOrEqual(0);
      expect(shape.x + shape.width).toBeLessThanOrEqual(FIELD);
      expect(shape.y + shape.height).toBeLessThanOrEqual(FIELD);
    });
  }

  it('заготовки разной формы дают РАЗНЫЕ схемы — иначе рисунок ничего не сообщает', () => {
    const shapes = ELEMENT_LIBRARY.map((item) => box(objectShape(item, FIELD)));
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });
});

import { describe, expect, it } from 'vitest';
import { eases } from 'animejs';

import { loadProject, ANIMATABLE } from '@player/core';
import type { AnimationSpec, Cue, Element, Project } from '@player/core';

import {
  EASINGS,
  defaultsFor,
  setDuration,
  setEase,
  setFrom,
  setProperty,
  setTo,
} from '../src/state/animation.js';

/**
 * `EASINGS` заявлен как проверенный по фактическому API anime.js, а не по
 * памяти (CLAUDE.md). Здесь именно та проверка: `eases` — публичный экспорт
 * установленного пакета (node_modules/animejs, версия 4.5.0), а не список,
 * переписанный вручную в комментарий.
 */
describe('EASINGS: соответствует фактическому API установленной anime.js', () => {
  const known = new Set(Object.keys(eases));

  it('каждая строка списка распознаётся библиотекой', () => {
    for (const name of EASINGS) {
      expect(known.has(name)).toBe(true);
    }
  });

  it('список не пуст и не содержит дубликатов', () => {
    expect(EASINGS.length).toBeGreaterThan(0);
    expect(new Set(EASINGS).size).toBe(EASINGS.length);
  });

  it('схемный дефолт ease («inOutQuad») входит в список', () => {
    expect(EASINGS).toContain('inOutQuad');
  });
});

function baseSpec(overrides: Partial<AnimationSpec> = {}): AnimationSpec {
  return { property: 'opacity', from: 0, to: 1, duration: 300, ease: 'outQuad', ...overrides };
}

describe('defaultsFor: разумные значения для каждого свойства ANIMATABLE', () => {
  it('покрывает все восемь свойств из ANIMATABLE, ни одно не забыто', () => {
    for (const property of ANIMATABLE) {
      expect(() => defaultsFor(property)).not.toThrow();
    }
  });

  it('opacity: числа в диапазоне видимости, from < to (появление, не исчезновение)', () => {
    const { from, to } = defaultsFor('opacity');
    expect(from).toBe(0);
    expect(to).toBe(1);
  });

  it('filter: строки вида blur(Npx), а не голые числа', () => {
    const { from, to } = defaultsFor('filter');
    expect(typeof from).toBe('string');
    expect(typeof to).toBe('string');
    expect(from).toMatch(/^blur\(\d+px\)$/);
    expect(to).toMatch(/^blur\(\d+px\)$/);
  });

  it('x, y: числа-смещения, не строки', () => {
    for (const property of ['x', 'y'] as const) {
      const { from, to } = defaultsFor(property);
      expect(typeof from).toBe('number');
      expect(typeof to).toBe('number');
    }
  });

  it('scale, scaleX, scaleY: растут из нуля до единицы', () => {
    for (const property of ['scale', 'scaleX', 'scaleY'] as const) {
      expect(defaultsFor(property)).toEqual({ from: 0, to: 1 });
    }
  });

  it('rotate: числа в градусах, доезжает до 0', () => {
    const { from, to } = defaultsFor('rotate');
    expect(typeof from).toBe('number');
    expect(to).toBe(0);
  });
});

describe('setProperty: смена свойства сбрасывает from/to на дефолты нового свойства', () => {
  it('opacity → filter: from/to больше не числа, а строки blur()', () => {
    const spec = baseSpec({ property: 'opacity', from: 0, to: 1 });
    const next = setProperty(spec, 'filter');
    expect(next.property).toBe('filter');
    expect(next).toEqual({ ...spec, ...defaultsFor('filter'), property: 'filter' });
  });

  it('filter → opacity: строка blur() не переживает смену свойства', () => {
    const spec = baseSpec({ property: 'filter', from: 'blur(8px)', to: 'blur(0px)' });
    const next = setProperty(spec, 'opacity');
    expect(next.from).toBe(0);
    expect(next.to).toBe(1);
  });

  it('duration и ease смена свойства не трогает', () => {
    const spec = baseSpec({ duration: 777, ease: 'inOutBack' });
    const next = setProperty(spec, 'x');
    expect(next.duration).toBe(777);
    expect(next.ease).toBe('inOutBack');
  });

  it('смена на то же свойство — тот же объект по ссылке', () => {
    const spec = baseSpec({ property: 'opacity' });
    expect(setProperty(spec, 'opacity')).toBe(spec);
  });
});

describe('setFrom', () => {
  it('устанавливает числовое значение', () => {
    const spec = baseSpec({ from: 0 });
    expect(setFrom(spec, 5).from).toBe(5);
  });

  it('undefined — законное значение: по ADR-009 значит «взять текущее значение узла»', () => {
    const spec = baseSpec({ from: 0 });
    const next = setFrom(spec, undefined);
    expect(next.from).toBeUndefined();
  });

  it('без изменений — тот же объект по ссылке (тот же случай, включая undefined → undefined)', () => {
    const spec = baseSpec({ from: 0 });
    expect(setFrom(spec, 0)).toBe(spec);

    const withoutFrom = baseSpec({ from: undefined });
    expect(setFrom(withoutFrom, undefined)).toBe(withoutFrom);
  });
});

describe('setTo', () => {
  it('устанавливает значение', () => {
    const spec = baseSpec({ to: 1 });
    expect(setTo(spec, 0.5).to).toBe(0.5);
  });

  it('без изменений — тот же объект по ссылке', () => {
    const spec = baseSpec({ to: 1 });
    expect(setTo(spec, 1)).toBe(spec);
  });
});

describe('setDuration', () => {
  it('положительное конечное число проходит', () => {
    const spec = baseSpec({ duration: 300 });
    expect(setDuration(spec, 500).duration).toBe(500);
  });

  it('ноль бросает громкую ошибку — схема требует positive', () => {
    expect(() => setDuration(baseSpec(), 0)).toThrow(/положительн/);
  });

  it('отрицательное число бросает', () => {
    expect(() => setDuration(baseSpec(), -100)).toThrow(/положительн/);
  });

  it('NaN бросает', () => {
    expect(() => setDuration(baseSpec(), NaN)).toThrow();
  });

  it('Infinity бросает — схема требует finite', () => {
    expect(() => setDuration(baseSpec(), Infinity)).toThrow();
  });

  it('без изменений — тот же объект по ссылке', () => {
    const spec = baseSpec({ duration: 300 });
    expect(setDuration(spec, 300)).toBe(spec);
  });
});

describe('setEase', () => {
  it('значение из EASINGS проходит', () => {
    const spec = baseSpec({ ease: 'outQuad' });
    expect(setEase(spec, 'inOutBack').ease).toBe('inOutBack');
  });

  it('неизвестная строка бросает громкую ошибку с именем плавности', () => {
    expect(() => setEase(baseSpec(), 'easeOutSquiggle')).toThrow(/easeOutSquiggle/);
  });

  it('устаревший строковый синтаксис anime.js (cubicBezier/steps/...) тоже отклоняется', () => {
    // parser.js внутри anime.js на этих строках не бросает исключение, а
    // печатает console.warn и молча возвращает identity-плавность — ровно
    // тот тихий дефект, который setEase обязан превратить в громкую ошибку.
    expect(() => setEase(baseSpec(), 'cubicBezier(.5,0,.5,1)')).toThrow();
  });

  it('без изменений — тот же объект по ссылке', () => {
    const spec = baseSpec({ ease: 'outQuad' });
    expect(setEase(spec, 'outQuad')).toBe(spec);
  });
});

function element(id: string): Element {
  return {
    id,
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    style: {},
    content: '',
  };
}

function cue(id: string, targetId: string, animation: AnimationSpec): Cue {
  return { id, at: { kind: 'seconds', t: 1 }, targetId, animation };
}

function projectWith(animation: AnimationSpec): Project {
  return {
    schemaVersion: 1,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    audio: { src: 'audio/test.mp3', duration: 10, words: [] },
    scene: {
      elements: [element('target')],
      cues: [cue('cue-1', 'target', animation)],
      gates: [],
    },
  };
}

describe('охранник целостности: loadProject принимает setProperty для всех восьми ANIMATABLE', () => {
  for (const property of ANIMATABLE) {
    it(`${property}: результат setProperty проходит loadProject`, () => {
      const spec = setProperty(baseSpec(), property);
      expect(spec.property).toBe(property);

      const project = projectWith(spec);
      expect(() => loadProject(project)).not.toThrow();

      const loaded = loadProject(project);
      expect(loaded.scene.cues[0]!.animation).toEqual(spec);
    });
  }

  it('EASINGS целиком тоже проходит схему как значение ease (выборочно — линейная и по одной из каждой формы)', () => {
    for (const ease of EASINGS) {
      const spec = setEase(baseSpec(), ease);
      const project = projectWith(spec);
      expect(() => loadProject(project)).not.toThrow();
    }
  });
});

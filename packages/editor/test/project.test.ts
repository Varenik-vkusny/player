import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from '@player/core';
import type { Element, ElementState, Gate, Project, Segment, Slide } from '@player/core';

import { createElement } from '../src/state/elements.js';
import { libraryItem } from '../src/state/library.js';
import { editorReducer, initialState, segmentSlide } from '../src/state/project.js';
import { serializeProject } from '../src/state/save.js';

/**
 * Ссылочная целостность здесь не педантизм: StageView решает, пересобирать
 * сцену или обновить один элемент, сравнением ссылок, и тест обязан ловить
 * регресс тем же способом, каким его ловит браузер — через `toBe`, а не
 * через глубокое сравнение значений.
 */

function element(id: string): Element {
  return { id, type: 'shape', content: '' };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, style: {}, ...overrides };
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

function baseProject(): Project {
  return {
    schemaVersion: 3,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    entry: 'seg-1',
    segments: [
      {
        id: 'seg-1',
        title: '',
        audio: { src: 'audio/test.mp3', duration: 10, words: [] },
        elements: [element('title'), element('subtitle')],
        slides: [
          {
            id: 'slide-1',
            at: { kind: 'seconds', t: 0 },
            transition: 'morph',
            states: { title: elementState(), subtitle: elementState({ zIndex: 1 }) },
          },
        ],
        gates: [gate('gate-1')],
        exit: { rules: [], default: null },
      },
    ],
  };
}

function baseState() {
  return initialState(baseProject());
}

/** Сегмент единственного узла — в редьюсере ей и посвящена вся эта дверца. */
function segmentOf(project: Project): Segment {
  return project.segments[0]!;
}

function slideOf(project: Project): Slide {
  return segmentOf(project).slides[0]!;
}

describe('select', () => {
  it('устанавливает выделение по id существующего элемента', () => {
    const next = editorReducer(baseState(), { type: 'select', id: 'title' });
    expect(next.selectedId).toBe('title');
  });

  it('повторное выделение того же элемента не создаёт новое состояние', () => {
    const state = { ...baseState(), selectedId: 'title' };
    const next = editorReducer(state, { type: 'select', id: 'title' });
    expect(next).toBe(state);
  });

  it('id undefined снимает выделение', () => {
    const state = { ...baseState(), selectedId: 'title' };
    const next = editorReducer(state, { type: 'select', id: undefined });
    expect(next.selectedId).toBeUndefined();
  });

  it('выделение несуществующего элемента бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'select', id: 'ghost' })).toThrow(/ghost/);
  });
});

describe('replaceElement', () => {
  it('заменяет элемент; слайды и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const replaced: Element = { ...segmentOf(state.project).elements[0]!, content: 'новый текст' };

    const next = editorReducer(state, { type: 'replaceElement', element: replaced });

    expect(segmentOf(next.project).elements[0]).toBe(replaced);
    expect(segmentOf(next.project).elements).not.toBe(segmentOf(state.project).elements);
    expect(segmentOf(next.project).slides).toBe(segmentOf(state.project).slides);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = segmentOf(state.project).elements[0]!;

    const next = editorReducer(state, { type: 'replaceElement', element: same });

    expect(next).toBe(state);
  });

  it('замена несуществующего элемента бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'replaceElement', element: element('ghost') }),
    ).toThrow(/ghost/);
  });
});

describe('addElement', () => {
  it('добавляет элемент в segment.elements и его состояние на текущий слайд; gates остаётся тем же по ссылке', () => {
    const state = baseState();
    const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
    const { element: created, state: createdState } = createElement(
      libraryItem('shape'),
      segmentOf(state.project),
      slideOf(state.project).states,
      stage,
    );

    const next = editorReducer(state, { type: 'addElement', element: created, state: createdState });

    expect(segmentOf(next.project).elements).toEqual([...segmentOf(state.project).elements, created]);
    expect(slideOf(next.project).states[created.id]).toBe(createdState);
    expect(next.selectedId).toBe(created.id);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'addElement', element: element('title'), state: elementState() }),
    ).toThrow(/title/);
  });
});

describe('removeElement', () => {
  it('удаляет элемент; gates остаются тем же массивом по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', id: 'subtitle' });

    expect(segmentOf(next.project).elements.some((e) => e.id === 'subtitle')).toBe(false);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('каскадом снимает состояние удалённого элемента со слайда', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', id: 'title' });

    expect(slideOf(next.project).states.title).toBeUndefined();
  });

  it('удаление выделенного элемента снимает выделение', () => {
    const state = { ...baseState(), selectedId: 'title' };

    const next = editorReducer(state, { type: 'removeElement', id: 'title' });

    expect(next.selectedId).toBeUndefined();
  });

  it('удаление другого элемента не трогает текущее выделение', () => {
    const state = { ...baseState(), selectedId: 'title' };

    const next = editorReducer(state, { type: 'removeElement', id: 'subtitle' });

    expect(next.selectedId).toBe('title');
  });

  it('удаление несуществующего элемента бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'removeElement', id: 'ghost' })).toThrow(
      /ghost/,
    );
  });
});

describe('setElementState', () => {
  it('правит состояние элемента на текущем слайде; elements и gates остаются теми же по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 50 } });

    expect(slideOf(next.project).states.title!.x).toBe(50);
    expect(segmentOf(next.project).elements).toBe(segmentOf(state.project).elements);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('патч без изменений — состояние то же по ссылке', () => {
    const state = baseState();
    const next = editorReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 0 } });
    expect(next).toBe(state);
  });

  it('правка состояния несуществующего элемента бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'setElementState', elementId: 'ghost', patch: { x: 1 } }),
    ).toThrow(/ghost/);
  });
});

describe('addSlide / removeSlide / selectSlide', () => {
  it('addSlide вставляет новый слайд и делает его текущим', () => {
    const state = baseState();
    const next = editorReducer(state, {
      type: 'addSlide',
      afterSlideId: 'slide-1',
      at: { kind: 'seconds', t: 1 },
    });

    expect(segmentOf(next.project).slides.length).toBe(2);
    expect(next.currentSlideId).toBe(segmentOf(next.project).slides[1]!.id);
    // Новый слайд — копия предыдущего: элементы никуда не делись.
    expect(segmentOf(next.project).slides[1]!.states.title).toEqual(slideOf(state.project).states.title);
  });

  it('removeSlide удаляет слайд и возвращает currentSlideId на первый, если удалён текущий', () => {
    let state = baseState();
    state = editorReducer(state, { type: 'addSlide', afterSlideId: 'slide-1', at: { kind: 'seconds', t: 1 } });
    const addedId = state.currentSlideId;

    const next = editorReducer(state, { type: 'removeSlide', slideId: addedId });

    expect(segmentOf(next.project).slides.length).toBe(1);
    expect(next.currentSlideId).toBe(segmentOf(next.project).slides[0]!.id);
  });

  it('удаление последнего слайда бросает громкую ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'removeSlide', slideId: 'slide-1' })).toThrow(
      /последний слайд/,
    );
  });

  it('selectSlide переключает currentSlideId', () => {
    let state = baseState();
    state = editorReducer(state, { type: 'addSlide', afterSlideId: 'slide-1', at: { kind: 'seconds', t: 1 } });
    const addedId = state.currentSlideId;
    state = editorReducer(state, { type: 'selectSlide', id: 'slide-1' });

    expect(state.currentSlideId).toBe('slide-1');
    expect(addedId).not.toBe('slide-1');
  });

  it('selectSlide на несуществующий слайд бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'selectSlide', id: 'ghost' })).toThrow(/ghost/);
  });
});

describe('addGate', () => {
  it('добавляет gate; elements остаются тем же массивом по ссылке', () => {
    const state = baseState();
    const added = gate('gate-2');

    const next = editorReducer(state, { type: 'addGate', gate: added });

    expect(segmentOf(next.project).gates).toEqual([...segmentOf(state.project).gates, added]);
    expect(segmentOf(next.project).elements).toBe(segmentOf(state.project).elements);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'addGate', gate: gate('gate-1') })).toThrow(
      /gate-1/,
    );
  });
});

describe('updateGate', () => {
  it('заменяет гейт по id; elements остаются тем же массивом по ссылке', () => {
    const state = baseState();
    const updated: Gate = { ...gate('gate-1'), onWrong: 'inline-explain', maxAttempts: 2 };

    const next = editorReducer(state, { type: 'updateGate', gate: updated });

    expect(segmentOf(next.project).gates[0]).toBe(updated);
    expect(segmentOf(next.project).gates).not.toBe(segmentOf(state.project).gates);
    expect(segmentOf(next.project).elements).toBe(segmentOf(state.project).elements);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = segmentOf(state.project).gates[0]!;
    const next = editorReducer(state, { type: 'updateGate', gate: same });
    expect(next).toBe(state);
  });

  it('обновление несуществующего гейта бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'updateGate', gate: gate('ghost') }),
    ).toThrow(/ghost/);
  });
});

describe('moveMark', () => {
  it('двигает gate; elements остаются тем же массивом по ссылке', () => {
    const state = baseState();
    const next = editorReducer(state, {
      type: 'moveMark',
      kind: 'gate',
      id: 'gate-1',
      at: { kind: 'seconds', t: 6 },
    });

    expect(segmentOf(next.project).gates[0]!.at).toEqual({ kind: 'seconds', t: 6 });
    expect(segmentOf(next.project).elements).toBe(segmentOf(state.project).elements);
  });

  it('двигает слайд, отличный от первого', () => {
    let state = baseState();
    state = editorReducer(state, { type: 'addSlide', afterSlideId: 'slide-1', at: { kind: 'seconds', t: 1 } });
    const addedId = state.currentSlideId;

    const next = editorReducer(state, { type: 'moveMark', kind: 'slide', id: addedId, at: { kind: 'seconds', t: 5 } });

    expect(segmentOf(next.project).slides[1]!.at).toEqual({ kind: 'seconds', t: 5 });
  });

  it('первый слайд двигать нельзя — он обязан стоять на нуле', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'moveMark', kind: 'slide', id: 'slide-1', at: { kind: 'seconds', t: 1 } }),
    ).toThrow(/первый слайд/);
  });

  it('перемещение несуществующей метки бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'moveMark',
        kind: 'gate',
        id: 'ghost',
        at: { kind: 'seconds', t: 1 },
      }),
    ).toThrow(/ghost/);
  });
});

describe('removeMark', () => {
  it('удаляет gate', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeMark', kind: 'gate', id: 'gate-1' });

    expect(segmentOf(next.project).gates).toEqual([]);
  });

  it('удаление несуществующей метки бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'removeMark', kind: 'gate', id: 'ghost' }),
    ).toThrow(/ghost/);
  });
});

describe('редьюсер: переключение сегмента открывает его для правки', () => {
  function twoSegments(): Project {
    return {
      schemaVersion: 3,
      meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
      entry: 'seg-1',
      segments: [
        {
          id: 'seg-1',
          title: '',
          audio: { src: 'a.mp3', duration: 10, words: [] },
          elements: [],
          slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
          gates: [],
          exit: { rules: [], default: null },
        },
        {
          id: 'seg-2',
          title: '',
          audio: { src: 'a.mp3', duration: 10, words: [] },
          elements: [],
          slides: [{ id: 'slide-2', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
          gates: [],
          exit: { rules: [], default: null },
        },
      ],
    };
  }

  it('selectSegment переключает сегмент, слайд на первый слайд нового сегмента, и снимает выделение', () => {
    const state = { ...initialState(twoSegments()), selectedId: 'something' };
    const next = editorReducer(state, { type: 'selectSegment', id: 'seg-2' });
    expect(next.currentSegmentId).toBe('seg-2');
    expect(next.currentSlideId).toBe('slide-2');
    expect(next.selectedId).toBeUndefined();
  });

  it('после переключения addElement кладёт элемент в НОВЫЙ сегмент, старый не меняется', () => {
    const state = editorReducer(initialState(twoSegments()), { type: 'selectSegment', id: 'seg-2' });
    const created = element('shape-1');
    const createdState = elementState();
    const next = editorReducer(state, { type: 'addElement', element: created, state: createdState });

    expect(next.project.segments.find((s) => s.id === 'seg-2')!.elements).toContain(created);
    const originalSeg1 = state.project.segments.find((s) => s.id === 'seg-1')!;
    expect(next.project.segments.find((s) => s.id === 'seg-1')).toBe(originalSeg1);
  });

  it('переключение на несуществующий сегмент бросает', () => {
    expect(() =>
      editorReducer(initialState(twoSegments()), { type: 'selectSegment', id: 'ghost' }),
    ).toThrow(/ghost/);
  });

  it('переключение на тот же сегмент — состояние то же по ссылке', () => {
    const state = initialState(twoSegments());
    const next = editorReducer(state, { type: 'selectSegment', id: 'seg-1' });
    expect(next).toBe(state);
  });
});

describe('segmentSlide', () => {
  it('возвращает слайд по (project, segmentId, slideId)', () => {
    const project = baseProject();
    expect(segmentSlide(project, 'seg-1', 'slide-1').id).toBe('slide-1');
  });

  it('бросает, если слайда нет', () => {
    expect(() => segmentSlide(baseProject(), 'seg-1', 'ghost')).toThrow(/ghost/);
  });

  it('бросает, если сегмента нет', () => {
    expect(() => segmentSlide(baseProject(), 'ghost', 'slide-1')).toThrow(/ghost/);
  });
});

describe('охранник целостности: серия правок остаётся валидным проектом', () => {
  const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

  it('добавить элемент → удалить элемент — итог грузится loadProject', () => {
    const project = loadProject(JSON.parse(readFileSync(join(FIXTURES, 'minimal.json'), 'utf8')));
    let state = initialState(project);

    const stage = { width: project.meta.stageWidth, height: project.meta.stageHeight };
    const created = createElement(
      libraryItem('text'),
      segmentOf(state.project),
      slideOf(state.project).states,
      stage,
    );
    state = editorReducer(state, { type: 'addElement', element: created.element, state: created.state });

    state = editorReducer(state, { type: 'removeElement', id: created.element.id });

    // Каскад обязан снять состояние вместе с элементом — иначе serializeProject
    // упадёт на ссылке в никуда.
    expect(slideOf(state.project).states[created.element.id]).toBeUndefined();

    expect(() => serializeProject(state.project)).not.toThrow();

    const reloaded = loadProject(JSON.parse(serializeProject(state.project)));
    expect(segmentOf(reloaded).elements.some((e) => e.id === created.element.id)).toBe(false);
  });
});

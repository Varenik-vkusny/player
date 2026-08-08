import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Element, ElementState, Gate, Project, Segment, Slide, Word } from '@player/core';

import { createElement } from '../src/state/elements.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import { libraryItem } from '../src/state/library.js';
import { editorReducer, initialState, segmentSlide, type EditorState } from '../src/state/project.js';
import { serializeProject } from '../src/state/save.js';
import { timeRefAt } from '../src/track/marks.js';

/**
 * Ссылочная целостность здесь не педантизм: StageView решает, пересобирать
 * сцену или обновить один элемент, сравнением ссылок, и тест обязан ловить
 * регресс тем же способом, каким его ловит браузер — через `toBe`, а не
 * через глубокое сравнение значений.
 */

function element(id: string): Element {
  return { id, type: 'shape', content: '', locked: false };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides };
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
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 'seg-1',
    segments: [
      {
        id: 'seg-1',
        title: '',
        description: '',
        audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
        elements: [element('title'), element('subtitle')],
        slides: [
          {
            id: 'slide-1',
            at: { kind: 'seconds', t: 0 },
            transition: 'morph', transitionSeconds: 0.6,
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

/** Сегмент, который редьюсер считает текущим у ДАННОГО состояния. */
function currentSegmentOf(state: EditorState): Segment {
  return state.project.segments.find((candidate) => candidate.id === state.currentSegmentId)!;
}

function slideOf(project: Project): Slide {
  return segmentOf(project).slides[0]!;
}

describe('select', () => {
  it('устанавливает выделение по id существующего элемента', () => {
    const next = editorReducer(baseState(), { type: 'select', id: 'title' });
    expect(next.selectedIds).toEqual(['title']);
  });

  it('повторное выделение того же элемента не создаёт новое состояние', () => {
    const state = { ...baseState(), selectedIds: ['title'] };
    const next = editorReducer(state, { type: 'select', id: 'title' });
    expect(next).toBe(state);
  });

  it('id undefined снимает выделение', () => {
    const state = { ...baseState(), selectedIds: ['title'] };
    const next = editorReducer(state, { type: 'select', id: undefined });
    expect(next.selectedIds).toEqual([]);
  });

  it('mode toggle добавляет к выделению, сохраняя порядок', () => {
    // Порядок — не косметика: на него обопрётся выравнивание «по первому
    // выделенному». Слом: класть в начало вместо конца.
    const state = { ...baseState(), selectedIds: ['title'] };
    const next = editorReducer(state, { type: 'select', id: 'subtitle', mode: 'toggle' });
    expect(next.selectedIds).toEqual(['title', 'subtitle']);
  });

  it('mode toggle по уже выделенному убирает его из выделения', () => {
    const state = { ...baseState(), selectedIds: ['title', 'subtitle'] };
    const next = editorReducer(state, { type: 'select', id: 'title', mode: 'toggle' });
    expect(next.selectedIds).toEqual(['subtitle']);
  });

  it('обычный клик по одному из выделенных схлопывает выделение до него', () => {
    // Отличие от toggle. Без этого Shift был бы неотличим от его отсутствия.
    const state = { ...baseState(), selectedIds: ['title', 'subtitle'] };
    const next = editorReducer(state, { type: 'select', id: 'title' });
    expect(next.selectedIds).toEqual(['title']);
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

    const next = editorReducer(state, {
      type: 'addElement',
      element: created,
      state: createdState,
      at: { kind: 'seconds', t: 0 },
    });

    expect(segmentOf(next.project).elements).toEqual([...segmentOf(state.project).elements, created]);
    expect(slideOf(next.project).states[created.id]).toBe(createdState);
    expect(next.selectedIds).toEqual([created.id]);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'addElement',
        element: element('title'),
        state: elementState(),
        at: { kind: 'seconds', t: 0 },
      }),
    ).toThrow(/title/);
  });
});

describe('removeElement', () => {
  it('удаляет элемент; gates остаются тем же массивом по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', ids: ['subtitle'] });

    expect(segmentOf(next.project).elements.some((e) => e.id === 'subtitle')).toBe(false);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('каскадом снимает состояние удалённого элемента со слайда', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', ids: ['title'] });

    expect(slideOf(next.project).states.title).toBeUndefined();
  });

  it('удаление выделенного элемента снимает выделение', () => {
    const state = { ...baseState(), selectedIds: ['title'] };

    const next = editorReducer(state, { type: 'removeElement', ids: ['title'] });

    expect(next.selectedIds).toEqual([]);
  });

  it('удаление другого элемента не трогает текущее выделение', () => {
    const state = { ...baseState(), selectedIds: ['title'] };

    const next = editorReducer(state, { type: 'removeElement', ids: ['subtitle'] });

    expect(next.selectedIds).toEqual(['title']);
  });

  it('удаление несуществующего элемента бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'removeElement', ids: ['ghost'] })).toThrow(
      /ghost/,
    );
  });

  it('удаляет пачку за ОДИН вызов: оба исчезают и выделение снимается с обоих', () => {
    // Что должно сломаться, чтобы покраснел: удаление по одному элементу
    // за действие. Тогда второй остался бы в сегменте. Один вызов = один
    // шаг истории, значит Ctrl+Z вернёт обоих разом (см. редьюсер).
    const state = { ...baseState(), selectedIds: ['title', 'subtitle'] };

    const next = editorReducer(state, { type: 'removeElement', ids: ['title', 'subtitle'] });

    expect(segmentOf(next.project).elements.map((e) => e.id)).not.toContain('title');
    expect(segmentOf(next.project).elements.map((e) => e.id)).not.toContain('subtitle');
    expect(next.selectedIds).toEqual([]);
  });
});

describe('setElementState', () => {
  it('правит состояние элемента на текущем слайде; elements и gates остаются теми же по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 50 },
      at: { kind: 'seconds', t: 0 },
    });

    expect(slideOf(next.project).states.title!.x).toBe(50);
    expect(segmentOf(next.project).elements).toBe(segmentOf(state.project).elements);
    expect(segmentOf(next.project).gates).toBe(segmentOf(state.project).gates);
  });

  it('патч без изменений — состояние то же по ссылке', () => {
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 0 },
      at: { kind: 'seconds', t: 0 },
    });
    expect(next).toBe(state);
  });

  it('правка состояния несуществующего элемента бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'setElementState',
        elementId: 'ghost',
        patch: { x: 1 },
        at: { kind: 'seconds', t: 0 },
      }),
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
    // Текст сообщения — из cutProblem (state/slides.ts, задание Сессии 18):
    // «Единственный слайд вырезать нельзя...», а не прежнее «последний слайд»
    // (removeSlide теперь зовёт cutProblem, а не несёт своё сообщение).
    expect(() => editorReducer(baseState(), { type: 'removeSlide', slideId: 'slide-1' })).toThrow(
      /Единственный слайд/,
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

/**
 * ADR-025: «слайд переносит состояние, а не момент». Буфер живёт в
 * EditorState рядом с lastRetarget (см. комментарий поля `slideClipboard`),
 * поэтому проверки на этом уровне — про сам редьюсер, а не про историю
 * (та часть — в editorHistory.test.ts).
 */
describe('буфер обмена слайдов: copySlide / cutSlide / pasteSlide / duplicateSlide', () => {
  /** Состояние с двумя слайдами: slide-1 на 0 с, второй — только что вставленный на 1 с. */
  function twoSlideState(): EditorState {
    return editorReducer(baseState(), {
      type: 'addSlide',
      afterSlideId: 'slide-1',
      at: { kind: 'seconds', t: 1 },
    });
  }

  it('copySlide наполняет буфер и НЕ меняет проект', () => {
    const state = twoSlideState();
    const slideId = state.currentSlideId;

    const next = editorReducer(state, { type: 'copySlide', slideId });

    expect(next.project).toBe(state.project);
    expect(next.slideClipboard).toBeDefined();
    expect(next.slideClipboard!.transition).toBe('morph');
  });

  it('pasteSlide вставляет слайд из буфера и делает его текущим', () => {
    let state = twoSlideState();
    const slideId = state.currentSlideId;
    state = editorReducer(state, { type: 'copySlide', slideId });
    const slidesBefore = segmentOf(state.project).slides.length;

    const next = editorReducer(state, { type: 'pasteSlide', at: { kind: 'seconds', t: 5 } });

    expect(segmentOf(next.project).slides.length).toBe(slidesBefore + 1);
    expect(segmentOf(next.project).slides.some((slide) => slide.id === next.currentSlideId)).toBe(true);
    expect(next.currentSlideId).not.toBe(state.currentSlideId);
  });

  it('pasteSlide при пустом буфере возвращает ТОТ ЖЕ объект состояния', () => {
    const state = twoSlideState(); // slideClipboard всё ещё undefined
    const next = editorReducer(state, { type: 'pasteSlide', at: { kind: 'seconds', t: 5 } });
    expect(next).toBe(state);
  });

  it('pasteSlide НЕ опустошает буфер: две вставки подряд дают два новых слайда', () => {
    let state = twoSlideState();
    const slideId = state.currentSlideId;
    state = editorReducer(state, { type: 'copySlide', slideId });
    const slidesBefore = segmentOf(state.project).slides.length;

    state = editorReducer(state, { type: 'pasteSlide', at: { kind: 'seconds', t: 5 } });
    state = editorReducer(state, { type: 'pasteSlide', at: { kind: 'seconds', t: 7 } });

    expect(segmentOf(state.project).slides.length).toBe(slidesBefore + 2);
  });

  it('duplicateSlide не трогает буфер: скопировали одно, дублировали другое — в буфере прежнее', () => {
    let state = twoSlideState();
    // Буфер наполнен копией ПЕРВОГО слайда.
    state = editorReducer(state, { type: 'copySlide', slideId: 'slide-1' });
    const clipboardBefore = state.slideClipboard;

    // Дублируем ВТОРОЙ слайд — буфер обязан остаться прежним.
    const secondSlideId = segmentOf(state.project).slides[1]!.id;
    const next = editorReducer(state, {
      type: 'duplicateSlide',
      slideId: secondSlideId,
      at: { kind: 'seconds', t: 6 },
    });

    expect(next.slideClipboard).toBe(clipboardBefore);
  });
});

/**
 * Долг §12.4, закрытый в Сессии 17.
 *
 * Непрерывность держалась копированием состояний при создании слайда, поэтому
 * элемент, созданный на третьем слайде, есть на третьем и дальше. Осознанный
 * приход «пусть появится ВОТ ЗДЕСЬ, а раньше его не было» выразить было нечем,
 * хотя ради него и заведено различие «нет в states» против `visible: false`.
 */
describe('элемент на слайде: поместить и убрать (§12.4)', () => {
  /** Состояние с двумя слайдами, где на втором элемента «subtitle» нет. */
  function twoSlides() {
    const project = baseProject();
    const segment = project.segments[0]!;
    project.segments[0] = {
      ...segment,
      slides: [
        segment.slides[0]!,
        {
          id: 'slide-2',
          at: { kind: 'seconds', t: 4 },
          transition: 'morph', transitionSeconds: 0.6,
          states: { title: elementState({ x: 100 }) },
        },
      ],
    };
    return initialState(project);
  }

  it('убрать со слайда — элемент уходит из states, но остаётся в части', () => {
    const state = editorReducer(baseState(), { type: 'removeElementFromSlide', elementId: 'subtitle' });
    const segment = currentSegmentOf(state);

    expect(segment.slides[0]!.states).not.toHaveProperty('subtitle');
    // Главное отличие от removeElement: сам элемент никуда не делся.
    expect(segment.elements.map((element) => element.id)).toContain('subtitle');
  });

  it('убранный элемент перестаёт быть выделенным: свойств у него в этом кадре нет', () => {
    const selected = editorReducer(baseState(), { type: 'select', id: 'subtitle' });
    const next = editorReducer(selected, { type: 'removeElementFromSlide', elementId: 'subtitle' });
    expect(next.selectedIds).toEqual([]);
  });

  it('поместить на слайд — вид берётся с ближайшего слайда, где элемент известен', () => {
    let state = twoSlides();
    state = editorReducer(state, { type: 'selectSlide', id: 'slide-2' });
    state = editorReducer(state, { type: 'putElementOnSlide', elementId: 'subtitle' });

    const second = currentSegmentOf(state).slides[1]!;
    expect(second.states['subtitle']).toBeDefined();
    // Сосед слева — первый слайд, где subtitle стоит с zIndex 1.
    expect(second.states['subtitle']!.zIndex).toBe(1);
  });

  it('вид берётся и СПРАВА, когда слева элемента ещё нет', () => {
    // Элемент приходит только на втором слайде — ровно тот случай, ради
    // которого различие «нет в states» и `visible: false` заведено. Помещаем
    // его на ПЕРВЫЙ: слева соседа нет, значит вид обязан прийти справа.
    const project = baseProject();
    const segment = project.segments[0]!;
    project.segments[0] = {
      ...segment,
      slides: [
        { ...segment.slides[0]!, states: { title: elementState() } },
        {
          id: 'slide-2',
          at: { kind: 'seconds', t: 4 },
          transition: 'morph', transitionSeconds: 0.6,
          states: { title: elementState(), subtitle: elementState({ zIndex: 7 }) },
        },
      ],
    };

    const state = editorReducer(initialState(project), {
      type: 'putElementOnSlide',
      elementId: 'subtitle',
    });

    expect(currentSegmentOf(state).slides[0]!.states['subtitle']?.zIndex).toBe(7);
  });

  it('элемента нет в части — действие падает громко, а не создаёт его молча', () => {
    expect(() => editorReducer(baseState(), { type: 'putElementOnSlide', elementId: 'нет-такого' }))
      .toThrow(/нет в проекте/);
  });

  it('повторное «убрать» — не ошибка, а повтор: состояние то же по ссылке', () => {
    const once = editorReducer(baseState(), { type: 'removeElementFromSlide', elementId: 'subtitle' });
    const twice = editorReducer(once, { type: 'removeElementFromSlide', elementId: 'subtitle' });
    expect(twice.project).toBe(once.project);
  });

  it('серия «убрать → поместить» оставляет проект, который грузится', () => {
    // Судит настоящий валидатор, а не представление о его правилах: элемент
    // без состояния на части слайдов — законное состояние схемы, и проект
    // после такой пары правок обязан открываться.
    let state = twoSlides();
    state = editorReducer(state, { type: 'removeElementFromSlide', elementId: 'subtitle' });
    expect(() => loadProject(state.project)).not.toThrow();

    state = editorReducer(state, { type: 'selectSlide', id: 'slide-2' });
    state = editorReducer(state, { type: 'putElementOnSlide', elementId: 'title' });
    expect(() => loadProject(state.project)).not.toThrow();
  });
});

describe('setSlideTransition', () => {
  /** Слайд, вставленный вторым: у первого перехода нет по построению. */
  function stateWithSecondSlide(): { state: ReturnType<typeof baseState>; id: string } {
    let state = baseState();
    state = editorReducer(state, { type: 'addSlide', afterSlideId: 'slide-1', at: { kind: 'seconds', t: 1 } });
    return { state, id: state.currentSlideId };
  }

  it('переключает переход на резкий и обратно на плавный', () => {
    const { state, id } = stateWithSecondSlide();

    const cut = editorReducer(state, { type: 'setSlideTransition', slideId: id, transition: 'cut' });
    expect(segmentOf(cut.project).slides[1]!.transition).toBe('cut');

    const back = editorReducer(cut, { type: 'setSlideTransition', slideId: id, transition: 'morph' });
    expect(segmentOf(back.project).slides[1]!.transition).toBe('morph');
  });

  it('новый слайд по умолчанию плавный — дефолт схемы менять не пришлось', () => {
    const { state } = stateWithSecondSlide();
    expect(segmentOf(state.project).slides[1]!.transition).toBe('morph');
  });

  it('соседний слайд остаётся тем же объектом по ссылке', () => {
    const { state, id } = stateWithSecondSlide();
    const before = segmentOf(state.project).slides[0]!;

    const next = editorReducer(state, { type: 'setSlideTransition', slideId: id, transition: 'cut' });

    expect(segmentOf(next.project).slides[0]).toBe(before);
  });

  it('первый слайд отвергается громко: ехать в него неоткуда', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'setSlideTransition', slideId: 'slide-1', transition: 'cut' }),
    ).toThrow(/первого слайда нет перехода/);
  });

  it('несуществующий слайд отвергается громко', () => {
    const { state } = stateWithSecondSlide();
    expect(() =>
      editorReducer(state, { type: 'setSlideTransition', slideId: 'ghost', transition: 'cut' }),
    ).toThrow(/ghost/);
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
      schemaVersion: SCHEMA_VERSION,
      meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
      entry: 'seg-1',
      segments: [
        {
          id: 'seg-1',
          title: '',
          description: '',
          audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
          elements: [],
          slides: [{ id: 'slide-1', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
          gates: [],
          exit: { rules: [], default: null },
        },
        {
          id: 'seg-2',
          title: '',
          description: '',
          audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
          elements: [],
          slides: [{ id: 'slide-2', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
          gates: [],
          exit: { rules: [], default: null },
        },
      ],
    };
  }

  it('selectSegment переключает сегмент, слайд на первый слайд нового сегмента, и снимает выделение', () => {
    const state = { ...initialState(twoSegments()), selectedIds: ['something'] };
    const next = editorReducer(state, { type: 'selectSegment', id: 'seg-2' });
    expect(next.currentSegmentId).toBe('seg-2');
    expect(next.currentSlideId).toBe('slide-2');
    expect(next.selectedIds).toEqual([]);
  });

  it('после переключения addElement кладёт элемент в НОВЫЙ сегмент, старый не меняется', () => {
    const state = editorReducer(initialState(twoSegments()), { type: 'selectSegment', id: 'seg-2' });
    const created = element('shape-1');
    const createdState = elementState();
    const next = editorReducer(state, {
      type: 'addElement',
      element: created,
      state: createdState,
      at: { kind: 'seconds', t: 0 },
    });

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
    state = editorReducer(state, {
      type: 'addElement',
      element: created.element,
      state: created.state,
      at: { kind: 'seconds', t: 0 },
    });

    state = editorReducer(state, { type: 'removeElement', ids: [created.element.id] });

    // Каскад обязан снять состояние вместе с элементом — иначе serializeProject
    // упадёт на ссылке в никуда.
    expect(slideOf(state.project).states[created.element.id]).toBeUndefined();

    expect(() => serializeProject(state.project)).not.toThrow();

    const reloaded = loadProject(JSON.parse(serializeProject(state.project)));
    expect(segmentOf(reloaded).elements.some((e) => e.id === created.element.id)).toBe(false);
  });
});

/**
 * §14.9: автор может идти вторым путём — сначала содержимое, потом метка.
 *
 * До этой сессии второй путь ТЕРЯЛСЯ: правка на голом месте дорожки ложилась
 * в слайд, чья метка стоит раньше, и молча портила картинку на всём отрезке
 * между метками. Владелец выбрал вариант (а) — слайд рождается сам.
 */
describe('слайд рождается при правке на голом месте дорожки', () => {
  it('правка на секунде без метки создаёт слайд и делает его текущим', () => {
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 4 },
    });

    const slides = segmentOf(next.project).slides;
    expect(slides).toHaveLength(2);
    expect(slides[1]!.at).toEqual({ kind: 'seconds', t: 4 });
    expect(next.currentSlideId).toBe(slides[1]!.id);
    expect(slides[1]!.states['title']!.x).toBe(500);
  });

  it('прежний слайд правку НЕ получает — ради этого всё и делалось', () => {
    const state = baseState();
    const before = slideOf(state.project);
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 4 },
    });

    expect(segmentOf(next.project).slides[0]).toBe(before);
  });

  it('рождённый слайд начинается копией предыдущего, а не пустым', () => {
    // Без копирования КАЖДЫЙ элемент сцены на новом слайде считался бы
    // «только что прибывшим» (ADR-015), и сцена обнулялась бы при правке.
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 4 },
    });

    const born = segmentOf(next.project).slides[1]!;
    expect(Object.keys(born.states).sort()).toEqual(['subtitle', 'title']);
    expect(born.states['subtitle']!.zIndex).toBe(1);
  });

  /**
   * Главный страх владельца: «слайды плодятся». Он слабее, чем кажется,
   * ровно потому, что вторая правка при неподвижной головке попадает
   * в уже рождённый слайд.
   */
  it('десять правок при неподвижной головке дают ОДИН слайд', () => {
    let state = baseState();
    for (let i = 0; i < 10; i += 1) {
      state = editorReducer(state, {
        type: 'setElementState',
        elementId: 'title',
        patch: { x: 100 + i },
        at: { kind: 'seconds', t: 4 },
      });
    }

    expect(segmentOf(state.project).slides).toHaveLength(2);
    expect(segmentOf(state.project).slides[1]!.states['title']!.x).toBe(109);
  });

  it('правка ровно на метке существующего слайда слайда не рождает', () => {
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 0 },
    });

    expect(segmentOf(next.project).slides).toHaveLength(1);
    expect(slideOf(next.project).states['title']!.x).toBe(500);
  });

  it('головка чуть в стороне от метки попадает В НЕЁ, а не рождает соседа', () => {
    // Автор, перемотавший на 3 мс мимо метки, имел в виду эту метку.
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 0.003 },
    });

    expect(segmentOf(next.project).slides).toHaveLength(1);
  });

  it('добавление элемента на голом месте тоже рождает слайд', () => {
    const state = baseState();
    const created = createElement(
      libraryItem('shape'),
      segmentOf(state.project),
      slideOf(state.project).states,
      { width: 1920, height: 1080 },
    );
    const next = editorReducer(state, {
      type: 'addElement',
      element: created.element,
      state: created.state,
      at: { kind: 'seconds', t: 4 },
    });

    const slides = segmentOf(next.project).slides;
    expect(slides).toHaveLength(2);
    // Новый элемент появляется ТОЛЬКО на рождённом слайде: на прежнем его
    // ещё нет, и там он «отсутствует», а не «невидим» (ADR-015).
    expect(slides[0]!.states[created.element.id]).toBeUndefined();
    expect(slides[1]!.states[created.element.id]).toBeDefined();
  });

  it('рождение и правка — ОДИН шаг: отмена не оставляет осиротевший слайд', () => {
    // Проверяется на уровне данных: редьюсер обязан вернуть состояние,
    // в котором слайд и правка появились вместе. Разбей это на два
    // действия — Ctrl+Z снял бы правку и оставил пустой слайд на дорожке.
    const state = baseState();
    const next = editorReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 4 },
    });

    expect(segmentOf(next.project).slides).toHaveLength(2);
    expect(segmentOf(next.project).slides[1]!.states['title']!.x).toBe(500);
    expect(segmentOf(state.project).slides).toHaveLength(1);
  });
});

function word(text: string, start: number, end: number): Word {
  return { text, start, end, source: 'alignment' };
}

const WORDS: readonly Word[] = [
  word('Привет', 1.0, 1.5),
  word('мир', 1.5, 1.9),
  word('дальше', 5.0, 5.4),
];

/** Проект с реальной расшифровкой: слайд №2 и гейт стоят на слове, а не на секунде. */
function projectWithWords(): Project {
  const base = baseProject();
  const segment = base.segments[0]!;
  return {
    ...base,
    segments: [
      {
        ...segment,
        audio: { ...segment.audio, words: [...WORDS] },
        slides: [
          segment.slides[0]!,
          {
            id: 'slide-2',
            at: timeRefAt(WORDS, 1.5), // на слове «мир»
            transition: 'morph', transitionSeconds: 0.6,
            states: {},
          },
        ],
        gates: [{ ...gate('gate-1'), at: timeRefAt(WORDS, 5.0) }], // на слове «дальше»
      },
    ],
  };
}

describe('replaceSegmentAudio', () => {
  it('слова, привязанные к слову, переезжают на СЕКУНДЫ, на которых стояли', () => {
    const state = initialState(projectWithWords());

    const next = editorReducer(state, { type: 'replaceSegmentAudio', fileId: 'aud-1', duration: 20 });

    const segment = segmentOf(next.project);
    // Момент на дорожке не сдвинулся: 1.5 и 5.0 — те же секунды, на которых
    // слова стояли ДО замены (см. WORDS выше), просто это уже не привязка,
    // а число.
    expect(segment.slides[1]!.at).toEqual({ kind: 'seconds', t: 1.5 });
    expect(segment.gates[0]!.at).toEqual({ kind: 'seconds', t: 5.0 });
  });

  it('первый слайд (стоит на нуле, kind: seconds) не трогает — retargetMark на seconds→seconds no-op', () => {
    const state = initialState(projectWithWords());
    const before = segmentOf(state.project).slides[0]!;

    const next = editorReducer(state, { type: 'replaceSegmentAudio', fileId: 'aud-1', duration: 20 });

    expect(segmentOf(next.project).slides[0]).toBe(before);
  });

  it('пишет новый источник: fileId вместо src, offset 0, длительность из декодера', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'replaceSegmentAudio', fileId: 'aud-42', duration: 12.34 });

    expect(segmentOf(next.project).audio).toEqual({
      src: undefined,
      fileId: 'aud-42',
      offset: 0,
      duration: 12.34,
      words: [],
    });
  });

  it('audio.words очищается в пустой массив', () => {
    const state = initialState(projectWithWords());

    const next = editorReducer(state, { type: 'replaceSegmentAudio', fileId: 'aud-1', duration: 20 });

    expect(segmentOf(next.project).audio.words).toEqual([]);
  });

  it('метки, уже стоявшие на секунде, не меняются', () => {
    // gate-1 в baseProject уже { kind: 'seconds', t: 2 } — замена озвучки
    // не обязана его трогать, только слова.
    const state = baseState();

    const next = editorReducer(state, { type: 'replaceSegmentAudio', fileId: 'aud-1', duration: 20 });

    expect(segmentOf(next.project).gates[0]!.at).toEqual({ kind: 'seconds', t: 2 });
  });
});

describe('замена озвучки с расшифровкой', () => {
  const stateWithWordMarks = initialState(projectWithWords());
  // Тот же текст, что в WORDS («Привет», «мир», «дальше»), но на новых
  // секундах — как будто автор перезаписал ту же реплику другим голосом.
  // alignWords сопоставит их как «same»: метки обязаны переехать на слово,
  // а не остаться привязанными к старому индексу.
  const newWords: readonly Word[] = [
    word('Привет', 1.2, 1.7),
    word('мир', 1.7, 2.1),
    word('дальше', 5.3, 5.7),
  ];

  it('метки переезжают на свои слова, а не переводятся в секунды', () => {
    const next = editorReducer(stateWithWordMarks, {
      type: 'replaceSegmentAudio', fileId: 'sha-2', duration: 4, words: newWords,
    });

    const slide = currentSegmentOf(next).slides[1]!;
    expect(slide.at.kind).toBe('word');
    const gateAt = currentSegmentOf(next).gates[0]!.at;
    expect(gateAt.kind).toBe('word');
  });

  it('новая расшифровка ложится в дорожку тем же действием', () => {
    const next = editorReducer(stateWithWordMarks, {
      type: 'replaceSegmentAudio', fileId: 'sha-2', duration: 4, words: newWords,
    });

    expect(currentSegmentOf(next).audio.words).toHaveLength(newWords.length);
  });

  it('отчёт о переносе ложится в lastRetarget — оба слова сопоставились ровно', () => {
    const next = editorReducer(stateWithWordMarks, {
      type: 'replaceSegmentAudio', fileId: 'sha-2', duration: 4, words: newWords,
    });

    // Полный набор, а не toMatchObject: нули в `orphaned` и `toSeconds`
    // утверждают, что при полном совпадении расшифровок ни одна метка
    // не осиротела и ни одна не ушла в секунды.
    expect(next.lastRetarget).toEqual({
      moved: 2, check: 0, orphaned: 0, recovered: 0, toSeconds: 0,
    });
  });

  it('без расшифровки — прежнее поведение: метки в секунды, отчёта нет', () => {
    const next = editorReducer(stateWithWordMarks, {
      type: 'replaceSegmentAudio', fileId: 'sha-2', duration: 4,
    });

    expect(currentSegmentOf(next).slides[1]!.at.kind).toBe('seconds');
    expect(currentSegmentOf(next).audio.words).toEqual([]);
    expect(next.lastRetarget).toBeUndefined();
  });

  it('замена — ОДИН шаг истории, а не два', () => {
    const history = initialHistoryState(projectWithWords());
    const before = history.history.past.length;

    const next = historyReducer(history, {
      type: 'replaceSegmentAudio', fileId: 'sha-2', duration: 4, words: newWords,
    });

    expect(next.history.past.length).toBe(before + 1);
    // Отчёт о переносе доходит и до состояния поверх истории — сообщение
    // автору живёт рядом с selectedIds/currentSlideId, а не только внутри
    // одного вызова editorReducer.
    // Полный набор, а не toMatchObject: нули в `orphaned` и `toSeconds`
    // утверждают, что при полном совпадении расшифровок ни одна метка
    // не осиротела и ни одна не ушла в секунды.
    expect(next.lastRetarget).toEqual({
      moved: 2, check: 0, orphaned: 0, recovered: 0, toSeconds: 0,
    });
  });
});

describe('setSegmentWords', () => {
  it('кладёт слова в audio.words как есть, без поправки таймингов', () => {
    const state = baseState();
    const asrWords: readonly Word[] = [
      { text: 'Привет', start: 0.3, end: 0.9, source: 'asr', confidence: 0.98 },
    ];

    const next = editorReducer(state, { type: 'setSegmentWords', words: asrWords });

    expect(segmentOf(next.project).audio.words).toEqual(asrWords);
  });

  it('не трогает слайды и гейты — метки перепривязывает только автор вручную', () => {
    const state = initialState(projectWithWords());
    const gatesBefore = segmentOf(state.project).gates;
    const slidesBefore = segmentOf(state.project).slides;

    const next = editorReducer(state, { type: 'setSegmentWords', words: [] });

    expect(segmentOf(next.project).gates).toBe(gatesBefore);
    expect(segmentOf(next.project).slides).toBe(slidesBefore);
  });
});

describe('текст озвучки', () => {
  it('записывается в текущий кусок', () => {
    const state = baseState();
    const next = editorReducer(state, { type: 'setSpeech', text: 'Часы это позиция.' });
    expect(currentSegmentOf(next).speech).toBe('Часы это позиция.');
  });

  it('пустая строка стирает поле, а не кладёт пустоту', () => {
    const state = baseState();
    const filled = editorReducer(state, { type: 'setSpeech', text: 'Что-то' });
    const cleared = editorReducer(filled, { type: 'setSpeech', text: '   ' });
    expect(currentSegmentOf(cleared).speech).toBeUndefined();
  });

  it('текст живёт на куске, а не на дорожке: замена озвучки его не трогает', () => {
    const state = baseState();
    const filled = editorReducer(state, { type: 'setSpeech', text: 'Часы это позиция.' });
    const replaced = editorReducer(filled, {
      type: 'replaceSegmentAudio', fileId: 'sha-1', duration: 3,
    });
    expect(currentSegmentOf(replaced).speech).toBe('Часы это позиция.');
  });
});

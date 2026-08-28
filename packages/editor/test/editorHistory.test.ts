import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Element, ElementState, Gate, Project } from '@player/core';

import { HISTORY_LIMIT } from '../src/state/history.js';
import {
  historyReducer,
  initialHistoryState,
  canRedoState,
  canUndoState,
  type HistoryState,
} from '../src/state/editorHistory.js';

/**
 * Три правила задания сессии, каждое — набор тестов ниже:
 * 1. `select`/`selectSegment`/`selectSlide` не создают шаг истории.
 * 2. Жест (`commit: false` ... `commit`) даёт РОВНО один шаг, а не по шагу
 *    на каждое промежуточное событие.
 * 3. Отмена/повтор не трогают ничего, кроме `history` и вида — время
 *    сцены им не принадлежит вовсе (см. комментарий модуля).
 */

function element(id: string): Element {
  return { id, type: 'shape', content: '', locked: false };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides };
}

function baseProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 'seg-1',
    styles: [],
    fonts: [],
    segments: [
      {
        authorSpans: [],
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
            states: { title: elementState({ x: 0 }), subtitle: elementState({ x: 50 }) },
          },
        ],
        gates: [],
        exit: { rules: [], default: null },
      },
    ],
  };
}

function gate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
    recordAs: id,
  };
}

function baseState(): HistoryState {
  return initialHistoryState(baseProject());
}

describe('initialHistoryState', () => {
  it('пустая история: present — исходный проект, нечего ни отменить, ни повторить', () => {
    const project = baseProject();
    const state = initialHistoryState(project);

    expect(state.history.present).toBe(project);
    expect(state.selectedIds).toEqual([]);
    expect(state.currentSegmentId).toBe('seg-1');
    expect(state.currentSlideId).toBe('slide-1');
    expect(state.gestureOpen).toBe(false);
    expect(canUndoState(state)).toBe(false);
    expect(canRedoState(state)).toBe(false);
  });
});

describe('правило 1: select/selectSegment/selectSlide в историю не пишутся', () => {
  it('select меняет selectedIds, history остаётся тем же объектом по ссылке', () => {
    const state = baseState();
    const next = historyReducer(state, { type: 'select', id: 'title' });

    expect(next.selectedIds).toEqual(['title']);
    expect(next.history).toBe(state.history);
    expect(canUndoState(next)).toBe(false);
  });

  it('повторный select того же id — состояние то же по ссылке целиком', () => {
    const selected = historyReducer(baseState(), { type: 'select', id: 'title' });
    const next = historyReducer(selected, { type: 'select', id: 'title' });
    expect(next).toBe(selected);
  });

  it('select несуществующего id бросает ошибку так же, как editorReducer', () => {
    expect(() => historyReducer(baseState(), { type: 'select', id: 'ghost' })).toThrow(/ghost/);
  });

  it('selectSlide меняет currentSlideId, history остаётся тем же объектом по ссылке', () => {
    let state = historyReducer(baseState(), {
      type: 'addSlide',
      afterSlideId: 'slide-1',
      at: { kind: 'seconds', t: 1 },
    });
    const historyAfterAdd = state.history;
    state = historyReducer(state, { type: 'selectSlide', id: 'slide-1' });
    expect(state.currentSlideId).toBe('slide-1');
    expect(state.history).toBe(historyAfterAdd);
  });
});

describe('одиночные действия: по шагу на вызов', () => {
  it('addElement — один шаг, present меняется, past растёт на один', () => {
    const state = baseState();
    const created = element('new-shape');

    const next = historyReducer(state, {
      type: 'addElement',
      element: created,
      state: elementState({ x: 200 }),
      at: { kind: 'seconds', t: 0 },
    });

    expect(next.history.present).not.toBe(state.history.present);
    expect(next.history.past).toEqual([state.history.present]);
    expect(next.selectedIds).toEqual(['new-shape']);
    expect(canUndoState(next)).toBe(true);
  });

  it('несколько одиночных setElementState подряд (без commit) — по шагу на каждый, без склейки', () => {
    let state = baseState();

    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
      at: { kind: 'seconds', t: 0 },
    });
    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 20 },
      at: { kind: 'seconds', t: 0 },
    });

    // Два самостоятельных шага: отмена возвращает СНАЧАЛА x=10, потом
    // исходное состояние — а не перепрыгивает через первый шаг целиком.
    expect(state.history.past.length).toBe(2);
    const afterOneUndo = historyReducer(state, { type: 'undo' });
    expect(afterOneUndo.history.present.segments[0]!.slides[0]!.states.title!.x).toBe(10);
  });

  it('setElementState патчем без изменений (no-op editorReducer) не создаёт шаг', () => {
    const state = baseState();
    const next = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 0 },
      at: { kind: 'seconds', t: 0 },
    });
    expect(next).toBe(state);
  });

  it('updateGate — тоже одиночный шаг (используется панелью меток)', () => {
    let state = baseState();
    state = historyReducer(state, { type: 'addGate', gate: gate('gate-1') });
    expect(canUndoState(state)).toBe(true);
    const pastAfterAdd = state.history.past.length;

    const updated: Gate = { ...gate('gate-1'), onWrong: 'inline-explain' };
    state = historyReducer(state, { type: 'updateGate', gate: updated });

    expect(state.history.past.length).toBe(pastAfterAdd + 1);
    expect(state.history.present.segments[0]!.gates[0]!.onWrong).toBe('inline-explain');
  });
});

describe('правило 2: жест — один шаг истории', () => {
  it('серия commit:false + commit даёт РОВНО один шаг, present — финальное значение', () => {
    const state = baseState();
    const before = state.history.present;

    let s = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    expect(s.gestureOpen).toBe(true);
    // Первое живое событие уже открыло шаг: past вырос ровно на один.
    expect(s.history.past).toEqual([before]);

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 20 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    // Второе живое событие НЕ создаёт второй шаг — past не растёт.
    expect(s.history.past).toEqual([before]);
    expect(s.gestureOpen).toBe(true);

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 30 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    expect(s.history.past).toEqual([before]);

    s = historyReducer(s, { type: 'commit' });
    expect(s.gestureOpen).toBe(false);
    // commit не меняет данные — верхушка уже несёт финальное значение.
    expect(s.history.present.segments[0]!.slides[0]!.states.title!.x).toBe(30);
    expect(s.history.past).toEqual([before]);

    // Один Ctrl+Z должен вернуть СРАЗУ исходное значение, а не x=20 и не x=10:
    // это и есть «жест = один шаг», а не десятки.
    const undone = historyReducer(s, { type: 'undo' });
    expect(undone.history.present).toBe(before);
    expect(canUndoState(undone)).toBe(false);
  });

  it('то же самое для moveMark (перетаскивание метки по дорожке)', () => {
    let state = historyReducer(baseState(), { type: 'addGate', gate: gate('g') });
    const pastBeforeDrag = state.history.past; // [исходный проект без гейта]
    const beforeDrag = state.history.present; // проект с только что добавленным гейтом

    state = historyReducer(state, {
      type: 'moveMark',
      kind: 'gate',
      id: 'g',
      at: { kind: 'seconds', t: 2 },
      commit: false,
    });
    state = historyReducer(state, {
      type: 'moveMark',
      kind: 'gate',
      id: 'g',
      at: { kind: 'seconds', t: 3 },
      commit: false,
    });
    state = historyReducer(state, {
      type: 'moveMark',
      kind: 'gate',
      id: 'g',
      at: { kind: 'seconds', t: 4 },
      commit: false,
    });
    // Живые события жеста добавили РОВНО одну запись (beforeDrag) поверх
    // того, что уже было в past после addGate, — не три.
    expect(state.history.past).toEqual([...pastBeforeDrag, beforeDrag]);

    state = historyReducer(state, { type: 'commit' });
    expect(state.history.present.segments[0]!.gates[0]!.at).toEqual({ kind: 'seconds', t: 4 });

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.history.present).toBe(beforeDrag);
  });

  it('commit без открытого жеста — безопасный no-op', () => {
    const state = baseState();
    const next = historyReducer(state, { type: 'commit' });
    expect(next).toBe(state);
  });

  it('две последовательные серии (drag → commit → drag → commit) — два раздельных шага', () => {
    const state = baseState();
    const p0 = state.history.present;

    let s = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    s = historyReducer(s, { type: 'commit' });
    const p1 = s.history.present;

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 99 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    s = historyReducer(s, { type: 'commit' });
    const p2 = s.history.present;

    expect(s.history.past).toEqual([p0, p1]);
    expect(p2).toBe(s.history.present);

    const undoneOnce = historyReducer(s, { type: 'undo' });
    expect(undoneOnce.history.present).toBe(p1);
    const undoneTwice = historyReducer(undoneOnce, { type: 'undo' });
    expect(undoneTwice.history.present).toBe(p0);
  });

  it('жёсткое действие посреди незакрытого жеста закрывает его сам (защита от потерянного commit)', () => {
    const state = baseState();
    const p0 = state.history.present;

    let s = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    expect(s.gestureOpen).toBe(true);
    const liveTip = s.history.present;

    // commit потерян (например, pointerup не долетел) — но addElement всё
    // равно обязан стать самостоятельным шагом поверх живого значения,
    // а не потерять его и не слиться с ним в одну запись.
    const created = element('new-one');
    s = historyReducer(s, {
      type: 'addElement',
      element: created,
      state: elementState({ x: 500 }),
      at: { kind: 'seconds', t: 0 },
    });

    expect(s.gestureOpen).toBe(false);
    expect(s.history.past).toEqual([p0, liveTip]);
  });
});

describe('правило 3: отмена/повтор не берут на себя ничего, кроме history и вида', () => {
  it('undo/redo на границе — тот же объект state по ссылке, не бросают', () => {
    const state = baseState();
    expect(() => historyReducer(state, { type: 'undo' })).not.toThrow();
    expect(historyReducer(state, { type: 'undo' })).toBe(state);
    expect(historyReducer(state, { type: 'redo' })).toBe(state);
  });

  it('после undo выделение снимается, если выделенного элемента больше нет в восстановленном проекте', () => {
    const state = baseState();
    // addElement сразу выделяет созданный элемент.
    const withNew = historyReducer(state, {
      type: 'addElement',
      element: element('shape-1'),
      state: elementState({ x: 300 }),
      at: { kind: 'seconds', t: 0 },
    });
    expect(withNew.selectedIds).toEqual(['shape-1']);

    const undone = historyReducer(withNew, { type: 'undo' });
    // shape-1 отменой убран из проекта — выделение обязано слететь.
    expect(undone.history.present.segments[0]!.elements.some((e) => e.id === 'shape-1')).toBe(false);
    expect(undone.selectedIds).toEqual([]);
  });

  it('после undo выделение остаётся, если выделенный элемент в восстановленном проекте всё ещё есть', () => {
    let state = baseState();
    state = historyReducer(state, { type: 'select', id: 'subtitle' });
    // Правка другого элемента — subtitle остаётся на месте в обоих снимках.
    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 77 },
      at: { kind: 'seconds', t: 0 },
    });

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.selectedIds).toEqual(['subtitle']);
  });

  it('redo не восстанавливает выделение само по себе — оно снаружи истории', () => {
    const state = baseState();
    const withNew = historyReducer(state, {
      type: 'addElement',
      element: element('shape-1'),
      state: elementState({ x: 300 }),
      at: { kind: 'seconds', t: 0 },
    });
    const undone = historyReducer(withNew, { type: 'undo' });
    expect(undone.selectedIds).toEqual([]);

    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.history.present.segments[0]!.elements.some((e) => e.id === 'shape-1')).toBe(true);
    // Выделение НЕ подтягивается обратно автоматически — snapshot истории
    // не хранит selectedIds по определению (правило 1).
    expect(redone.selectedIds).toEqual([]);
  });

  it('undo сбрасывает незакрытый жест (защитный случай)', () => {
    let state = baseState();
    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
      at: { kind: 'seconds', t: 0 },
      commit: false,
    });
    expect(state.gestureOpen).toBe(true);

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.gestureOpen).toBe(false);
  });

  it('undo, откатывающий addSlide, возвращает currentSlideId на первый слайд сегмента', () => {
    let state = baseState();
    state = historyReducer(state, {
      type: 'addSlide',
      afterSlideId: 'slide-1',
      at: { kind: 'seconds', t: 1 },
    });
    expect(state.currentSlideId).not.toBe('slide-1');

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.currentSlideId).toBe('slide-1');
  });
});

/**
 * ADR-025: буфер обмена слайдов — состояние вида, вне History<Project>
 * (см. комментарий поля `slideClipboard` в HistoryState). Три ловушки,
 * которые этот файл обязан ловить молча иначе: (а) отдельная ветка для
 * copySlide в historyReducer, (б) поле slideClipboard в общем возврате,
 * (в) сохранение буфера в afterNav при undo/redo.
 */
describe('буфер обмена слайдов (ADR-025)', () => {
  /** Состояние с двумя слайдами: slide-1 на 0 с, второй — родом от addSlide на 1 с. */
  function twoSlideState(): HistoryState {
    return historyReducer(baseState(), {
      type: 'addSlide',
      afterSlideId: 'slide-1',
      at: { kind: 'seconds', t: 1 },
    });
  }

  it('copySlide наполняет буфер, пройдя через historyReducer', () => {
    const state = twoSlideState();
    const slideId = state.currentSlideId;

    const next = historyReducer(state, { type: 'copySlide', slideId });

    expect(next.slideClipboard).toBeDefined();
  });

  it('copySlide не создаёт шаг истории', () => {
    const state = twoSlideState();
    const slideId = state.currentSlideId;

    const next = historyReducer(state, { type: 'copySlide', slideId });

    expect(next.history).toBe(state.history);
    expect(canUndoState(next)).toBe(canUndoState(state));
  });

  it('cutSlide = ОДИН шаг истории: один Ctrl+Z возвращает слайд целиком', () => {
    const state = twoSlideState();
    const slideId = state.currentSlideId;
    const slidesBefore = state.history.present.segments[0]!.slides.length;
    const pastBefore = state.history.past.length;

    const cut = historyReducer(state, { type: 'cutSlide', slideId });
    expect(cut.history.present.segments[0]!.slides.length).toBe(slidesBefore - 1);
    // Ровно один новый шаг — не два (copySlide отдельно + removeSlide отдельно).
    expect(cut.history.past.length).toBe(pastBefore + 1);

    const undone = historyReducer(cut, { type: 'undo' });
    // Один Ctrl+Z возвращает СРАЗУ снимок до вырезания, целиком, по ссылке —
    // не промежуточное «слайд ещё жив, буфер уже пуст» состояние.
    expect(undone.history.present).toBe(state.history.present);
    expect(undone.history.present.segments[0]!.slides.length).toBe(slidesBefore);
  });

  it('cutSlide кладёт слайд в буфер, пройдя через historyReducer', () => {
    const state = twoSlideState();
    const slideId = state.currentSlideId;

    const cut = historyReducer(state, { type: 'cutSlide', slideId });

    expect(cut.slideClipboard).toBeDefined();
  });

  it('буфер переживает undo и redo', () => {
    let state = twoSlideState();
    const slideId = state.currentSlideId;
    state = historyReducer(state, { type: 'copySlide', slideId });
    const clipboard = state.slideClipboard;
    expect(clipboard).toBeDefined();

    // Самостоятельный шаг истории поверх наполненного буфера — есть что отменять.
    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 42 },
      at: { kind: 'seconds', t: 0 },
    });

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.slideClipboard).toBe(clipboard);

    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.slideClipboard).toBe(clipboard);
  });
});

describe('охранник переполнения: 60 одиночных правок дают ровно 50 доступных отмен', () => {
  it('делегирует в history.ts без искажений', () => {
    let state = baseState();
    for (let i = 1; i <= 60; i += 1) {
      state = historyReducer(state, {
        type: 'setElementState',
        elementId: 'title',
        patch: { x: i },
        at: { kind: 'seconds', t: 0 },
      });
    }
    expect(state.history.past.length).toBe(HISTORY_LIMIT);

    let steps = 0;
    while (canUndoState(state)) {
      state = historyReducer(state, { type: 'undo' });
      steps += 1;
    }
    expect(steps).toBe(HISTORY_LIMIT);
  });
});

/**
 * §14.9: рождение слайда и правка, которая его вызвала, обязаны быть ОДНИМ
 * шагом истории. Разбей их на два действия — Ctrl+Z снял бы правку и оставил
 * на дорожке пустой слайд, которого автор не ставил и не поймёт, откуда он.
 */
describe('рождение слайда — один шаг отмены вместе с правкой', () => {
  it('отмена убирает и правку, и рождённый слайд разом', () => {
    const state = baseState();
    const slidesBefore = state.history.present.segments[0]!.slides.length;

    const edited = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 500 },
      at: { kind: 'seconds', t: 4 },
    });
    expect(edited.history.present.segments[0]!.slides).toHaveLength(slidesBefore + 1);
    expect(canUndoState(edited)).toBe(true);

    const undone = historyReducer(edited, { type: 'undo' });
    expect(undone.history.present.segments[0]!.slides).toHaveLength(slidesBefore);
    // Ровно один шаг: после него отменять больше нечего.
    expect(canUndoState(undone)).toBe(false);
  });

  it('жест целиком — тоже один шаг: слайд родился один раз и снялся один раз', () => {
    let state: HistoryState = baseState();
    const slidesBefore = state.history.present.segments[0]!.slides.length;

    for (let i = 0; i < 5; i += 1) {
      state = historyReducer(state, {
        type: 'setElementState',
        elementId: 'title',
        patch: { x: 100 + i },
        at: { kind: 'seconds', t: 4 },
        commit: false,
      });
    }
    state = historyReducer(state, { type: 'commit' });

    expect(state.history.present.segments[0]!.slides).toHaveLength(slidesBefore + 1);

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.history.present.segments[0]!.slides).toHaveLength(slidesBefore);
    expect(canUndoState(undone)).toBe(false);
  });
});

describe('duplicateElements: пачка — ОДИН шаг истории', () => {
  it('копия двух элементов даёт один шаг, и одна отмена убирает обе копии', () => {
    /**
     * Несущий тест среза. Краснеет, если копию пачкой собрать циклом
     * из `addElement`: `past` вырос бы на два, и автору пришлось бы жать
     * Ctrl+Z дважды, чтобы отменить ОДИН свой жест.
     *
     * Проверяется именно длина `past`, а не только итоговый проект:
     * по конечному состоянию сцены цикл и одно действие неотличимы.
     */
    const state = baseState();

    const next = historyReducer(state, {
      type: 'duplicateElements',
      ids: ['title', 'subtitle'],
      at: { kind: 'seconds', t: 0 },
    });

    expect(next.history.past).toEqual([state.history.present]);
    expect(next.history.present.segments[0]!.elements).toHaveLength(4);
    // Выделение переходит на копии — их две, и это не оригиналы.
    expect(next.selectedIds).toHaveLength(2);
    expect(next.selectedIds).not.toContain('title');

    const undone = historyReducer(next, { type: 'undo' });
    expect(undone.history.present.segments[0]!.elements).toHaveLength(2);
    expect(canUndoState(undone)).toBe(false);
  });

  it('копировать нечего — состояние ТО ЖЕ по ссылке, пустого шага в истории нет', () => {
    /**
     * Краснеет, если пересобирать сегмент до проверки «что-нибудь вышло»:
     * в историю лёг бы шаг, ничего не изменивший, и первый Ctrl+Z автора
     * не отменил бы ничего видимого — выглядит как «отмена сломалась».
     *
     * Выделить элемент не с текущего слайда автор может: ElementList
     * показывает все элементы сегмента, а не только лежащие на слайде.
     */
    let state = baseState();
    state = historyReducer(state, { type: 'removeElementFromSlide', elementId: 'subtitle' });
    const before = state;

    const next = historyReducer(state, {
      type: 'duplicateElements',
      ids: ['subtitle'],
      at: { kind: 'seconds', t: 0 },
    });

    expect(next).toBe(before);
  });
});

/**
 * Буфер обмена ЭЛЕМЕНТОВ (Сессия 33) — те же три ловушки, что у буфера
 * слайдов выше, и каждая теряет буфер МОЛЧА: автор нажимает «Копировать»,
 * ошибки нет нигде, а «Вставить» остаётся недоступным.
 */
describe('буфер обмена элементов', () => {
  it('copyElements наполняет буфер, пройдя через historyReducer', () => {
    // Ловушка (а): без отдельной ветки сработал бы generic-путь
    // `after.project === before.project`, который переносит только selectedIds.
    const state = baseState();
    const next = historyReducer(state, { type: 'copyElements', ids: ['title'] });
    expect(next.elementClipboard).toBeDefined();
  });

  it('copyElements не создаёт шаг истории', () => {
    const state = baseState();
    const next = historyReducer(state, { type: 'copyElements', ids: ['title'] });
    expect(next.history).toBe(state.history);
    expect(canUndoState(next)).toBe(canUndoState(state));
  });

  it('cutElements = ОДИН шаг истории: один Ctrl+Z возвращает объект целиком', () => {
    /*
     * Ловушка (б): `cutElements` И меняет проект, И наполняет буфер за один
     * вызов, поэтому уходит на общий возврат — и без поля там буфер потерялся
     * бы именно на нём.
     *
     * Разложить вырезание на copy + remove нельзя: Ctrl+Z отдал бы автору
     * полуразрезанное состояние — буфер уже полон, объект ещё жив.
     */
    const state = baseState();
    const pastBefore = state.history.past.length;

    const cut = historyReducer(state, { type: 'cutElements', ids: ['title'] });

    expect(cut.elementClipboard!.items[0]!.element.id).toBe('title');
    expect(cut.history.present.segments[0]!.elements.map((item) => item.id)).toEqual(['subtitle']);
    expect(cut.history.past.length).toBe(pastBefore + 1);

    const undone = historyReducer(cut, { type: 'undo' });
    expect(undone.history.present).toBe(state.history.present);
  });

  it('буфер ПЕРЕЖИВАЕТ отмену: вырезал, отменил, вставить всё ещё можно', () => {
    /*
     * Ловушка (в): `afterNav` собирает состояние заново и сбрасывает
     * `lastRetarget`. Буфер сбрасывать нельзя — это предмет в руке автора,
     * а не отчёт о правке, от которой он отошёл. Потерять его при Ctrl+Z
     * значило бы наказывать автора за отмену.
     */
    const cut = historyReducer(baseState(), { type: 'cutElements', ids: ['title'] });
    const undone = historyReducer(cut, { type: 'undo' });

    expect(undone.elementClipboard).toBe(cut.elementClipboard);
  });
});

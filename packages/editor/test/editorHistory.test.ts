import { describe, expect, it } from 'vitest';

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
  return { id, type: 'shape', content: '' };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return { x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0, opacity: 1, visible: true, style: {}, ...overrides };
}

function baseProject(): Project {
  return {
    schemaVersion: 5,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    entry: 'seg-1',
    segments: [
      {
        id: 'seg-1',
        title: '',
        audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
        elements: [element('title'), element('subtitle')],
        slides: [
          {
            id: 'slide-1',
            at: { kind: 'seconds', t: 0 },
            transition: 'morph',
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
    expect(state.selectedId).toBeUndefined();
    expect(state.currentSegmentId).toBe('seg-1');
    expect(state.currentSlideId).toBe('slide-1');
    expect(state.gestureOpen).toBe(false);
    expect(canUndoState(state)).toBe(false);
    expect(canRedoState(state)).toBe(false);
  });
});

describe('правило 1: select/selectSegment/selectSlide в историю не пишутся', () => {
  it('select меняет selectedId, history остаётся тем же объектом по ссылке', () => {
    const state = baseState();
    const next = historyReducer(state, { type: 'select', id: 'title' });

    expect(next.selectedId).toBe('title');
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
    });

    expect(next.history.present).not.toBe(state.history.present);
    expect(next.history.past).toEqual([state.history.present]);
    expect(next.selectedId).toBe('new-shape');
    expect(canUndoState(next)).toBe(true);
  });

  it('несколько одиночных setElementState подряд (без commit) — по шагу на каждый, без склейки', () => {
    let state = baseState();

    state = historyReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 10 } });
    state = historyReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 20 } });

    // Два самостоятельных шага: отмена возвращает СНАЧАЛА x=10, потом
    // исходное состояние — а не перепрыгивает через первый шаг целиком.
    expect(state.history.past.length).toBe(2);
    const afterOneUndo = historyReducer(state, { type: 'undo' });
    expect(afterOneUndo.history.present.segments[0]!.slides[0]!.states.title!.x).toBe(10);
  });

  it('setElementState патчем без изменений (no-op editorReducer) не создаёт шаг', () => {
    const state = baseState();
    const next = historyReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 0 } });
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
      commit: false,
    });
    expect(s.gestureOpen).toBe(true);
    // Первое живое событие уже открыло шаг: past вырос ровно на один.
    expect(s.history.past).toEqual([before]);

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 20 },
      commit: false,
    });
    // Второе живое событие НЕ создаёт второй шаг — past не растёт.
    expect(s.history.past).toEqual([before]);
    expect(s.gestureOpen).toBe(true);

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 30 },
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
      commit: false,
    });
    s = historyReducer(s, { type: 'commit' });
    const p1 = s.history.present;

    s = historyReducer(s, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 99 },
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
      commit: false,
    });
    expect(s.gestureOpen).toBe(true);
    const liveTip = s.history.present;

    // commit потерян (например, pointerup не долетел) — но addElement всё
    // равно обязан стать самостоятельным шагом поверх живого значения,
    // а не потерять его и не слиться с ним в одну запись.
    const created = element('new-one');
    s = historyReducer(s, { type: 'addElement', element: created, state: elementState({ x: 500 }) });

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
    });
    expect(withNew.selectedId).toBe('shape-1');

    const undone = historyReducer(withNew, { type: 'undo' });
    // shape-1 отменой убран из проекта — выделение обязано слететь.
    expect(undone.history.present.segments[0]!.elements.some((e) => e.id === 'shape-1')).toBe(false);
    expect(undone.selectedId).toBeUndefined();
  });

  it('после undo выделение остаётся, если выделенный элемент в восстановленном проекте всё ещё есть', () => {
    let state = baseState();
    state = historyReducer(state, { type: 'select', id: 'subtitle' });
    // Правка другого элемента — subtitle остаётся на месте в обоих снимках.
    state = historyReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: 77 } });

    const undone = historyReducer(state, { type: 'undo' });
    expect(undone.selectedId).toBe('subtitle');
  });

  it('redo не восстанавливает выделение само по себе — оно снаружи истории', () => {
    const state = baseState();
    const withNew = historyReducer(state, {
      type: 'addElement',
      element: element('shape-1'),
      state: elementState({ x: 300 }),
    });
    const undone = historyReducer(withNew, { type: 'undo' });
    expect(undone.selectedId).toBeUndefined();

    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.history.present.segments[0]!.elements.some((e) => e.id === 'shape-1')).toBe(true);
    // Выделение НЕ подтягивается обратно автоматически — snapshot истории
    // не хранит selectedId по определению (правило 1).
    expect(redone.selectedId).toBeUndefined();
  });

  it('undo сбрасывает незакрытый жест (защитный случай)', () => {
    let state = baseState();
    state = historyReducer(state, {
      type: 'setElementState',
      elementId: 'title',
      patch: { x: 10 },
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

describe('охранник переполнения: 60 одиночных правок дают ровно 50 доступных отмен', () => {
  it('делегирует в history.ts без искажений', () => {
    let state = baseState();
    for (let i = 1; i <= 60; i += 1) {
      state = historyReducer(state, { type: 'setElementState', elementId: 'title', patch: { x: i } });
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

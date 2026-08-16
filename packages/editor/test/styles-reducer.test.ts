import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Element, ElementState, Project, Style } from '@player/core';

import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import { editorReducer, initialState, type EditorState } from '../src/state/project.js';

/**
 * Действия `addStyle`/`updateStyle`/`removeStyle` (схема v12, ADR-029).
 *
 * Ссылочная целостность проверяется тем же способом, что и в `project.test.ts`:
 * `toBe`, а не глубокое сравнение — StageView решает, что перерисовывать,
 * сравнением ссылок, и тест обязан ловить регресс тем же способом.
 */

function element(id: string, type: Element['type'] = 'text'): Element {
  return { id, type, content: '', locked: false };
}

function elementState(overrides: Partial<ElementState> = {}): ElementState {
  return {
    x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 0,
    opacity: 1, visible: true, flipX: false, flipY: false, style: {}, ...overrides,
  };
}

const heading: Style = {
  id: 'heading',
  name: 'Главный',
  type: 'text',
  props: { 'font-size': '96px', color: '#4c8dff' },
};

/**
 * `title` идёт по стилю без единой ручной правки, `sub` отцеплен по кеглю
 * (правил рукой), `plate-1` — фигура без стиля вовсе, с собственным ключом
 * вне набора восьми (`letter-spacing`) — та же ситуация, что `border`
 * у `card` в demo.json (state/style.ts): панель обязана его не трогать.
 */
function baseProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 'seg-1',
    styles: [heading],
    segments: [
      {
        authorSpans: [],
        id: 'seg-1',
        title: '',
        description: '',
        audio: { src: 'audio/test.mp3', offset: 0, duration: 10, words: [] },
        elements: [element('title'), element('sub'), element('plate-1', 'shape')],
        slides: [
          {
            id: 'slide-1',
            at: { kind: 'seconds', t: 0 },
            transition: 'morph', transitionSeconds: 0.6,
            states: {
              title: elementState({ styleId: 'heading', style: {} }),
              sub: elementState({ styleId: 'heading', style: { 'font-size': '48px' } }),
              'plate-1': elementState({ style: { background: '#111111', 'letter-spacing': '2px' } }),
            },
          },
        ],
        gates: [],
        exit: { rules: [], default: null },
      },
    ],
  };
}

function baseState(): EditorState {
  return initialState(baseProject());
}

function segmentOf(project: Project) {
  return project.segments[0]!;
}

describe('addStyle', () => {
  it('кладёт новый стиль в project.styles', () => {
    const state = baseState();
    const plate: Style = { id: 'plate', name: 'Плашка', type: 'shape', props: { background: '#111111' } };

    const next = editorReducer(state, { type: 'addStyle', style: plate, sourceElementId: 'plate-1' });

    expect(next.project.styles).toEqual([heading, plate]);
  });

  it('переводит источник на новый стиль и вычищает ушедшие ключи из его собственной карты', () => {
    const state = baseState();
    const plate: Style = { id: 'plate', name: 'Плашка', type: 'shape', props: { background: '#111111' } };

    const next = editorReducer(state, { type: 'addStyle', style: plate, sourceElementId: 'plate-1' });
    const nextState = segmentOf(next.project).slides[0]!.states['plate-1']!;

    expect(nextState.styleId).toBe('plate');
    // background ушёл в стиль — снят из собственной карты элемента.
    expect('background' in nextState.style).toBe(false);
    // letter-spacing вне набора восьми (ADR-012) и не входит в новый стиль —
    // остаётся собственным ключом элемента, панель его не трогает.
    expect(nextState.style).toEqual({ 'letter-spacing': '2px' });
  });

  it('дублирующийся id стиля бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'addStyle',
        style: { id: 'heading', name: 'Дубль', type: 'text', props: {} },
        sourceElementId: 'title',
      }),
    ).toThrow(/heading/);
  });

  it('элемент без состояния на текущем слайде — сохранять нечего, ошибка', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'addStyle',
        style: { id: 'ghost-style', name: 'Призрак', type: 'text', props: {} },
        sourceElementId: 'ghost',
      }),
    ).toThrow(/ghost/);
  });
});

describe('updateStyle', () => {
  it('заменяет стиль по id', () => {
    const state = baseState();
    const renamed: Style = { ...heading, name: 'Переименован' };

    const next = editorReducer(state, { type: 'updateStyle', style: renamed });

    expect(next.project.styles).toEqual([renamed]);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = state.project.styles[0]!;

    const next = editorReducer(state, { type: 'updateStyle', style: same });

    expect(next).toBe(state);
  });

  it('обновление несуществующего стиля бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'updateStyle',
        style: { id: 'ghost', name: 'x', type: 'text', props: {} },
      }),
    ).toThrow(/ghost/);
  });
});

describe('removeStyle', () => {
  it('впечатывает значения стиля в затронутые состояния и снимает styleId', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeStyle', styleId: 'heading' });

    expect(next.project.styles).toEqual([]);

    const titleState = segmentOf(next.project).slides[0]!.states['title']!;
    expect(titleState.styleId).toBeUndefined();
    expect(titleState.style).toEqual({ 'font-size': '96px', color: '#4c8dff' });
  });

  it('НЕ трогает собственные ключи элемента: они были сильнее и остаются', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeStyle', styleId: 'heading' });

    const subState = segmentOf(next.project).slides[0]!.states['sub']!;
    expect(subState.styleId).toBeUndefined();
    // font-size — собственная ручная правка (§48px), она СИЛЬНЕЕ и остаётся;
    // color пришёл из стиля, потому что sub его не трогал.
    expect(subState.style).toEqual({ 'font-size': '48px', color: '#4c8dff' });
  });

  it('состояние, не ссылавшееся на удаляемый стиль, остаётся тем же объектом по ссылке', () => {
    const state = baseState();
    const before = segmentOf(state.project).slides[0]!.states['plate-1'];

    const next = editorReducer(state, { type: 'removeStyle', styleId: 'heading' });

    expect(segmentOf(next.project).slides[0]!.states['plate-1']).toBe(before);
  });

  it('удаление несуществующего стиля бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'removeStyle', styleId: 'ghost' })).toThrow(/ghost/);
  });
});

describe('отмена (Ctrl+Z) действий со стилями — historyReducer', () => {
  it('отмена удаления стиля возвращает стиль и ссылки обратно ОДНИМ шагом', () => {
    let state = initialHistoryState(baseProject());
    state = historyReducer(state, { type: 'removeStyle', styleId: 'heading' });
    expect(state.history.present.styles).toEqual([]);
    expect(segmentOf(state.history.present).slides[0]!.states['title']!.styleId).toBeUndefined();

    const undone = historyReducer(state, { type: 'undo' });

    expect(undone.history.present.styles).toEqual([heading]);
    expect(segmentOf(undone.history.present).slides[0]!.states['title']!.styleId).toBe('heading');
    expect(segmentOf(undone.history.present).slides[0]!.states['sub']!.style).toEqual({ 'font-size': '48px' });
  });

  it('отмена добавления стиля убирает его и снимает ссылку у источника', () => {
    let state = initialHistoryState(baseProject());
    const plate: Style = { id: 'plate', name: 'Плашка', type: 'shape', props: { background: '#111111' } };
    state = historyReducer(state, { type: 'addStyle', style: plate, sourceElementId: 'plate-1' });
    expect(state.history.present.styles).toHaveLength(2);
    expect(segmentOf(state.history.present).slides[0]!.states['plate-1']!.styleId).toBe('plate');

    const undone = historyReducer(state, { type: 'undo' });

    expect(undone.history.present.styles).toEqual([heading]);
    expect(segmentOf(undone.history.present).slides[0]!.states['plate-1']!.styleId).toBeUndefined();
    expect(segmentOf(undone.history.present).slides[0]!.states['plate-1']!.style).toEqual({
      background: '#111111',
      'letter-spacing': '2px',
    });
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from '@player/core';
import type { Cue, Element, Gate, Project, Scene, TimeRef } from '@player/core';

import { createElement } from '../src/state/elements.js';
import { libraryItem } from '../src/state/library.js';
import { editorReducer, initialState } from '../src/state/project.js';
import { serializeProject } from '../src/state/save.js';

/**
 * `state/project.ts` до этой сессии не имел юнит-тестов вообще (см. план
 * сессии 3) — только e2e. Ссылочная целостность здесь не педантизм:
 * StageView решает, пересобирать сцену или обновить один узел, сравнением
 * ссылок, и тест обязан ловить регресс тем же способом, каким его ловит
 * браузер — через `toBe`, а не через глубокое сравнение значений.
 */

function element(id: string, zIndex = 0): Element {
  return {
    id,
    type: 'shape',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex,
    style: {},
    content: '',
  };
}

function cue(id: string, targetId: string): Cue {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    targetId,
    animation: { property: 'opacity', from: 0, to: 1, duration: 300, ease: 'outQuad' },
  };
}

function gate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 2 },
    config: { kind: 'continue', label: 'Дальше' },
    onWrong: 'retry',
    maxAttempts: null,
  };
}

function baseProject(): Project {
  return {
    schemaVersion: 2,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    entry: 'node-1',
    nodes: [
      {
        id: 'node-1',
        title: '',
        audio: { src: 'audio/test.mp3', duration: 10, words: [] },
        scene: {
          elements: [element('title'), element('subtitle', 1)],
          cues: [cue('cue-1', 'title')],
          gates: [gate('gate-1')],
        },
        edges: [],
      },
    ],
  };
}

function baseState() {
  return initialState(baseProject());
}

/** Сцена единственного узла — в редьюсере ей и посвящена вся эта дверца. */
function sceneOf(project: Project): Scene {
  return project.nodes[0]!.scene;
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
  it('заменяет элемент; cues и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const replaced: Element = { ...sceneOf(state.project).elements[0]!, x: 50 };

    const next = editorReducer(state, { type: 'replaceElement', element: replaced });

    expect(sceneOf(next.project).elements[0]).toBe(replaced);
    expect(sceneOf(next.project).elements).not.toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = sceneOf(state.project).elements[0]!;

    const next = editorReducer(state, { type: 'replaceElement', element: same });

    expect(next).toBe(state);
  });

  it('замена несуществующего элемента бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'replaceElement', element: element('ghost') }),
    ).toThrow(/ghost/);
  });
});

describe('addCue', () => {
  it('добавляет cue; elements и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const added = cue('cue-2', 'subtitle');

    const next = editorReducer(state, { type: 'addCue', cue: added });

    expect(sceneOf(next.project).cues).toEqual([...sceneOf(state.project).cues, added]);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'addCue', cue: cue('cue-1', 'subtitle') }),
    ).toThrow(/cue-1/);
  });

  it('cue на несуществующий элемент бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'addCue', cue: cue('cue-2', 'ghost') }),
    ).toThrow(/ghost/);
  });
});

describe('addGate', () => {
  it('добавляет gate; elements и cues остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const added = gate('gate-2');

    const next = editorReducer(state, { type: 'addGate', gate: added });

    expect(sceneOf(next.project).gates).toEqual([...sceneOf(state.project).gates, added]);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() => editorReducer(baseState(), { type: 'addGate', gate: gate('gate-1') })).toThrow(
      /gate-1/,
    );
  });
});

describe('moveMark', () => {
  it('двигает cue; elements и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const at: TimeRef = { kind: 'seconds', t: 5 };

    const next = editorReducer(state, { type: 'moveMark', kind: 'cue', id: 'cue-1', at });

    expect(sceneOf(next.project).cues[0]!.at).toEqual(at);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('двигает gate; elements и cues остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const at: TimeRef = { kind: 'seconds', t: 6 };

    const next = editorReducer(state, { type: 'moveMark', kind: 'gate', id: 'gate-1', at });

    expect(sceneOf(next.project).gates[0]!.at).toEqual(at);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
  });

  it('перемещение несуществующей метки бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), {
        type: 'moveMark',
        kind: 'cue',
        id: 'ghost',
        at: { kind: 'seconds', t: 1 },
      }),
    ).toThrow(/ghost/);
  });
});

describe('removeMark', () => {
  it('удаляет cue; elements и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeMark', kind: 'cue', id: 'cue-1' });

    expect(sceneOf(next.project).cues).toEqual([]);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('удаляет gate; elements и cues остаются теми же массивами по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeMark', kind: 'gate', id: 'gate-1' });

    expect(sceneOf(next.project).gates).toEqual([]);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
  });

  it('удаление несуществующей метки бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'removeMark', kind: 'cue', id: 'ghost' }),
    ).toThrow(/ghost/);
  });
});

describe('addElement', () => {
  it('добавляет элемент, сразу его выделяет; cues и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
    const created = createElement(libraryItem('shape'), sceneOf(state.project), stage);

    const next = editorReducer(state, { type: 'addElement', element: created });

    expect(sceneOf(next.project).elements).toEqual([...sceneOf(state.project).elements, created]);
    expect(next.selectedId).toBe(created.id);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('дублирующийся id бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'addElement', element: element('title') }),
    ).toThrow(/title/);
  });
});

describe('removeElement', () => {
  it('удаляет элемент; gates остаются тем же массивом по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', id: 'subtitle' });

    expect(sceneOf(next.project).elements.some((e) => e.id === 'subtitle')).toBe(false);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('каскадом удаляет cues, нацеленные на удалённый элемент', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', id: 'title' });

    expect(sceneOf(next.project).cues).toEqual([]);
  });

  it('если удаление не задело cues — массив cues остаётся тем же по ссылке', () => {
    const state = baseState();

    const next = editorReducer(state, { type: 'removeElement', id: 'subtitle' });

    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
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

describe('updateGate', () => {
  it('заменяет гейт по id; elements и cues остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const updated: Gate = { ...gate('gate-1'), onWrong: 'reveal', maxAttempts: 2 };

    const next = editorReducer(state, { type: 'updateGate', gate: updated });

    expect(sceneOf(next.project).gates[0]).toBe(updated);
    expect(sceneOf(next.project).gates).not.toBe(sceneOf(state.project).gates);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).cues).toBe(sceneOf(state.project).cues);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = sceneOf(state.project).gates[0]!;
    const next = editorReducer(state, { type: 'updateGate', gate: same });
    expect(next).toBe(state);
  });

  it('обновление несуществующего гейта бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'updateGate', gate: gate('ghost') }),
    ).toThrow(/ghost/);
  });
});

describe('updateCue', () => {
  it('заменяет cue по id; elements и gates остаются теми же массивами по ссылке', () => {
    const state = baseState();
    const updated: Cue = {
      ...cue('cue-1', 'title'),
      animation: { property: 'opacity', from: 0, to: 1, duration: 999, ease: 'outQuad' },
    };

    const next = editorReducer(state, { type: 'updateCue', cue: updated });

    expect(sceneOf(next.project).cues[0]).toBe(updated);
    expect(sceneOf(next.project).cues).not.toBe(sceneOf(state.project).cues);
    expect(sceneOf(next.project).elements).toBe(sceneOf(state.project).elements);
    expect(sceneOf(next.project).gates).toBe(sceneOf(state.project).gates);
  });

  it('смена цели (targetId) на существующий элемент — разрешена', () => {
    const state = baseState();
    const retargeted: Cue = { ...cue('cue-1', 'subtitle') };

    const next = editorReducer(state, { type: 'updateCue', cue: retargeted });

    expect(sceneOf(next.project).cues[0]!.targetId).toBe('subtitle');
  });

  it('смена цели на несуществующий элемент бросает ошибку — та же проверка, что и у addCue', () => {
    const state = baseState();
    expect(() =>
      editorReducer(state, { type: 'updateCue', cue: cue('cue-1', 'ghost') }),
    ).toThrow(/ghost/);
  });

  it('замена тем же объектом — no-op, состояние то же по ссылке', () => {
    const state = baseState();
    const same = sceneOf(state.project).cues[0]!;
    const next = editorReducer(state, { type: 'updateCue', cue: same });
    expect(next).toBe(state);
  });

  it('обновление несуществующей анимации бросает ошибку', () => {
    expect(() =>
      editorReducer(baseState(), { type: 'updateCue', cue: cue('ghost', 'title') }),
    ).toThrow(/ghost/);
  });
});

describe('охранник целостности: серия правок остаётся валидным проектом', () => {
  // fileURLToPath, а не .pathname.slice(1) из marks.test.ts: последнее
  // работает на Windows случайно и разваливается на POSIX-путях без диска.
  const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

  it('добавить элемент → повесить на него анимацию → удалить элемент — итог грузится loadProject', () => {
    const project = loadProject(JSON.parse(readFileSync(join(FIXTURES, 'minimal.json'), 'utf8')));
    let state = initialState(project);

    const stage = { width: project.meta.stageWidth, height: project.meta.stageHeight };
    const created = createElement(libraryItem('text'), sceneOf(state.project), stage);
    state = editorReducer(state, { type: 'addElement', element: created });

    const attached = cue('cue-guard', created.id);
    state = editorReducer(state, { type: 'addCue', cue: attached });

    state = editorReducer(state, { type: 'removeElement', id: created.id });

    // Каскад обязан снять и cue вместе с элементом — иначе serializeProject
    // упадёт на ссылке в никуда, и это ровно тот класс дефектов, который
    // должен ловить этот тест, а не единичный сценарий.
    expect(sceneOf(state.project).cues.some((c) => c.id === 'cue-guard')).toBe(false);

    expect(() => serializeProject(state.project)).not.toThrow();

    const reloaded = loadProject(JSON.parse(serializeProject(state.project)));
    expect(sceneOf(reloaded).elements.some((e) => e.id === created.id)).toBe(false);
  });
});

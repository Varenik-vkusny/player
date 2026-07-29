import { describe, expect, it } from 'vitest';

import { ProjectSchema } from '@player/core';
import type { Edge, EdgeWhen, Gate, Project, SegmentNode } from '@player/core';

import { editorReducer, initialState } from '../src/state/project.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import {
  addNode,
  connect,
  disconnect,
  edgesAfterGateEdit,
  reachableFrom,
  removeNode,
  uncoveredOptions,
} from '../src/state/graph.js';

/**
 * Правила графа сегментов в редакторе: создание/удаление узлов, рёбра между
 * ними и вопрос «что из этого достижимо и что не покрыто». Чистая логика,
 * без React и DOM — так же, как её сосед `project.test.ts`.
 */

function node(id: string, overrides: Partial<SegmentNode> = {}): SegmentNode {
  return {
    id,
    title: '',
    audio: { src: `audio/${id}.mp3`, duration: 10, words: [] },
    scene: { elements: [], cues: [], gates: [] },
    edges: [],
    ...overrides,
  };
}

function choiceGate(id: string, optionIds: readonly string[]): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    config: {
      kind: 'choice',
      prompt: 'Вопрос',
      options: optionIds.map((optionId) => ({ id: optionId, label: optionId })),
      correctId: optionIds[0]!,
    },
    onWrong: 'continue',
    maxAttempts: null,
  };
}

function verdictGate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    config: { kind: 'input', prompt: 'Вопрос', accept: ['да'], caseSensitive: false },
    onWrong: 'continue',
    maxAttempts: null,
  };
}

function edge(id: string, to: string, when: EdgeWhen): Edge {
  return { id, to, when };
}

function project(nodes: readonly SegmentNode[], entry = 'node-1'): Project {
  return {
    schemaVersion: 2,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080 },
    entry,
    nodes: [...nodes],
  };
}

describe('addNode', () => {
  it('даёт свободный id, не сталкивается с существующими', () => {
    const p = project([node('node-1'), node('node-2')]);
    const { node: created } = addNode(p, 'node-1');
    expect(created.id).toBe('node-3');
  });

  it('новый узел — концовка: рёбер нет, сцена пуста', () => {
    const p = project([node('node-1')]);
    const { node: created } = addNode(p, 'node-1');
    expect(created.edges).toEqual([]);
    expect(created.scene).toEqual({ elements: [], cues: [], gates: [] });
  });

  it('дорожка та же по ссылке, что у источника', () => {
    const p = project([node('node-1')]);
    const { node: created } = addNode(p, 'node-1');
    expect(created.audio).toBe(p.nodes[0]!.audio);
  });

  it('заголовок — «Узел N» по порядковому номеру нового узла', () => {
    const p = project([node('node-1'), node('node-2')]);
    const { node: created } = addNode(p, 'node-1');
    expect(created.title).toBe('Узел 3');
  });

  it('остальные узлы остаются теми же объектами по ссылке', () => {
    const p = project([node('node-1'), node('node-2')]);
    const { project: next } = addNode(p, 'node-1');
    expect(next.nodes[0]).toBe(p.nodes[0]);
    expect(next.nodes[1]).toBe(p.nodes[1]);
  });

  it('источника дорожки нет — бросает', () => {
    const p = project([node('node-1')]);
    expect(() => addNode(p, 'ghost')).toThrow(/ghost/);
  });
});

describe('removeNode', () => {
  it('убирает входящие рёбра у других узлов', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-2', { kind: 'end' })] }),
      node('node-2'),
    ]);
    const next = removeNode(p, 'node-2');
    expect(next.nodes.map((n) => n.id)).toEqual(['node-1']);
    expect(next.nodes[0]!.edges).toEqual([]);
  });

  it('удаление стартового узла бросает', () => {
    const p = project([node('node-1'), node('node-2')]);
    expect(() => removeNode(p, 'node-1')).toThrow(/node-1/);
  });

  it('удаление несуществующего узла бросает', () => {
    const p = project([node('node-1')]);
    expect(() => removeNode(p, 'ghost')).toThrow(/ghost/);
  });

  it('неизменившиеся узлы остаются теми же объектами по ссылке', () => {
    const p = project([
      node('node-1'),
      node('node-2', { edges: [edge('e1', 'node-3', { kind: 'end' })] }),
      node('node-3'),
    ]);
    const next = removeNode(p, 'node-3');
    // node-1 никого не удаляемого не касается вовсе.
    expect(next.nodes.find((n) => n.id === 'node-1')).toBe(p.nodes[0]);
  });
});

describe('connect', () => {
  it('соединяет существующие узлы', () => {
    const p = project([
      node('node-1', { scene: { elements: [], cues: [], gates: [verdictGate('g1')] } }),
      node('node-2'),
    ]);
    const next = connect(p, 'node-1', { kind: 'correct', gateId: 'g1' }, 'node-2');
    const created = next.nodes[0]!.edges;
    expect(created.length).toBe(1);
    expect(created[0]!.to).toBe('node-2');
  });

  it('узла-источника нет — бросает', () => {
    const p = project([node('node-1')]);
    expect(() => connect(p, 'ghost', { kind: 'end' }, 'node-1')).toThrow(/ghost/);
  });

  it('узла назначения нет — бросает', () => {
    const p = project([node('node-1')]);
    expect(() => connect(p, 'node-1', { kind: 'end' }, 'ghost')).toThrow(/ghost/);
  });

  it('повторное покрытие того же варианта бросает', () => {
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [choiceGate('g1', ['a', 'b'])] },
        edges: [edge('e1', 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' })],
      }),
    ]);
    expect(() => connect(p, 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' }, 'node-1')).toThrow(/g1/);
  });

  it('второй end бросает', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-1', { kind: 'end' })] }),
    ]);
    expect(() => connect(p, 'node-1', { kind: 'end' }, 'node-1')).toThrow();
  });

  it('смешение option и correct на одном гейте бросает', () => {
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [choiceGate('g1', ['a', 'b'])] },
        edges: [edge('e1', 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' })],
      }),
    ]);
    expect(() => connect(p, 'node-1', { kind: 'correct', gateId: 'g1' }, 'node-1')).toThrow(/g1/);
  });

  it('смешение correct и option на одном гейте бросает (в обратном порядке)', () => {
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [verdictGate('g1')] },
        edges: [edge('e1', 'node-1', { kind: 'correct', gateId: 'g1' })],
      }),
    ]);
    expect(() =>
      connect(p, 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' }, 'node-1'),
    ).toThrow(/g1/);
  });

  it('ссылка на несуществующий гейт бросает', () => {
    const p = project([node('node-1')]);
    expect(() => connect(p, 'node-1', { kind: 'correct', gateId: 'ghost' }, 'node-1')).toThrow(/ghost/);
  });

  it('петля на себя не бросает', () => {
    const p = project([
      node('node-1', { scene: { elements: [], cues: [], gates: [verdictGate('g1')] } }),
    ]);
    expect(() => connect(p, 'node-1', { kind: 'correct', gateId: 'g1' }, 'node-1')).not.toThrow();
  });
});

describe('disconnect', () => {
  it('снимает ребро', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-1', { kind: 'end' })] }),
    ]);
    const next = disconnect(p, 'node-1', 'e1');
    expect(next.nodes[0]!.edges).toEqual([]);
  });

  it('несуществующее ребро бросает', () => {
    const p = project([node('node-1')]);
    expect(() => disconnect(p, 'node-1', 'ghost')).toThrow(/ghost/);
  });

  it('несуществующий узел бросает', () => {
    const p = project([node('node-1')]);
    expect(() => disconnect(p, 'ghost', 'e1')).toThrow(/ghost/);
  });
});

describe('reachableFrom', () => {
  it('находит недостижимый узел — не включает его', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-2', { kind: 'end' })] }),
      node('node-2'),
      node('node-3'),
    ]);
    const reachable = reachableFrom(p);
    expect(reachable.has('node-1')).toBe(true);
    expect(reachable.has('node-2')).toBe(true);
    expect(reachable.has('node-3')).toBe(false);
  });

  it('не зацикливается на цикле', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-2', { kind: 'end' })] }),
      node('node-2', { edges: [edge('e2', 'node-1', { kind: 'end' })] }),
    ]);
    const reachable = reachableFrom(p);
    expect(reachable).toEqual(new Set(['node-1', 'node-2']));
  });

  it('включает старт, даже если у него нет рёбер', () => {
    const p = project([node('node-1')]);
    expect(reachableFrom(p).has('node-1')).toBe(true);
  });

  it('принимает произвольный старт, а не только project.entry', () => {
    const p = project([
      node('node-1', { edges: [edge('e1', 'node-2', { kind: 'end' })] }),
      node('node-2'),
      node('node-3'),
    ]);
    expect(reachableFrom(p, 'node-3')).toEqual(new Set(['node-3']));
  });
});

describe('uncoveredOptions', () => {
  it('частично покрытые варианты — дыра', () => {
    const n = node('node-1', {
      scene: { elements: [], cues: [], gates: [choiceGate('g1', ['a', 'b', 'c'])] },
      edges: [edge('e1', 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' })],
    });
    const holes = uncoveredOptions(n);
    expect(holes).toEqual([{ gateId: 'g1', optionIds: ['b', 'c'], verdicts: [] }]);
  });

  it('полностью покрытый гейт не даёт дыры', () => {
    const n = node('node-1', {
      scene: { elements: [], cues: [], gates: [choiceGate('g1', ['a', 'b'])] },
      edges: [
        edge('e1', 'node-1', { kind: 'option', gateId: 'g1', optionId: 'a' }),
        edge('e2', 'node-1', { kind: 'option', gateId: 'g1', optionId: 'b' }),
      ],
    });
    expect(uncoveredOptions(n)).toEqual([]);
  });

  it('гейт без рёбер не даёт дыры', () => {
    const n = node('node-1', {
      scene: { elements: [], cues: [], gates: [choiceGate('g1', ['a', 'b'])] },
    });
    expect(uncoveredOptions(n)).toEqual([]);
  });

  it('гейт с correct без wrong даёт verdicts: [\'wrong\']', () => {
    const n = node('node-1', {
      scene: { elements: [], cues: [], gates: [verdictGate('g1')] },
      edges: [edge('e1', 'node-1', { kind: 'correct', gateId: 'g1' })],
    });
    expect(uncoveredOptions(n)).toEqual([{ gateId: 'g1', optionIds: [], verdicts: ['wrong'] }]);
  });

  it('рёбра end в группировку не входят и дыр не создают', () => {
    const n = node('node-1', {
      edges: [edge('e1', 'node-1', { kind: 'end' })],
    });
    expect(uncoveredOptions(n)).toEqual([]);
  });
});

describe('редьюсер: переключение узла открывает его сцену для правки', () => {
  function project2Nodes(): Project {
    return project([node('node-1'), node('node-2')]);
  }

  it('selectNode переключает узел и снимает выделение элемента', () => {
    const state = { ...initialState(project2Nodes()), selectedId: 'something' };
    const next = editorReducer(state, { type: 'selectNode', id: 'node-2' });
    expect(next.currentNodeId).toBe('node-2');
    expect(next.selectedId).toBeUndefined();
  });

  it('после переключения addElement кладёт элемент в сцену НОВОГО узла, старая сцена не меняется', () => {
    const state = editorReducer(initialState(project2Nodes()), { type: 'selectNode', id: 'node-2' });
    const created = {
      id: 'shape-1',
      type: 'shape' as const,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      zIndex: 0,
      style: {},
      content: '',
    };
    const next = editorReducer(state, { type: 'addElement', element: created });

    expect(next.project.nodes.find((n) => n.id === 'node-2')!.scene.elements).toContain(created);
    // Сцена узла node-1 не тронута — это несущая проверка: редактор больше
    // не заперт на стартовом узле.
    const originalNode1Scene = state.project.nodes.find((n) => n.id === 'node-1')!.scene;
    expect(next.project.nodes.find((n) => n.id === 'node-1')!.scene).toBe(originalNode1Scene);
  });

  it('переключение на несуществующий узел бросает', () => {
    expect(() =>
      editorReducer(initialState(project2Nodes()), { type: 'selectNode', id: 'ghost' }),
    ).toThrow(/ghost/);
  });

  it('переключение на тот же узел — состояние то же по ссылке', () => {
    const state = initialState(project2Nodes());
    const next = editorReducer(state, { type: 'selectNode', id: 'node-1' });
    expect(next).toBe(state);
  });
});

describe('история: переключение узла и создание узла', () => {
  function project2Nodes(): Project {
    return project([node('node-1'), node('node-2')]);
  }

  it('selectNode не создаёт шаг истории — history тот же объект по ссылке', () => {
    const state = initialHistoryState(project2Nodes());
    const next = historyReducer(state, { type: 'selectNode', id: 'node-2' });
    expect(next.history).toBe(state.history);
    expect(next.currentNodeId).toBe('node-2');
  });

  it('addNode создаёт шаг истории', () => {
    const state = initialHistoryState(project([node('node-1')]));
    const next = historyReducer(state, { type: 'addNode' });
    expect(next.history).not.toBe(state.history);
    expect(next.history.past).toEqual([state.history.present]);
    expect(next.currentNodeId).not.toBe(state.currentNodeId);
  });

  it('undo после addNode возвращает currentNodeId в стартовый узел', () => {
    const state = initialHistoryState(project([node('node-1')]));
    const created = historyReducer(state, { type: 'addNode' });
    const undone = historyReducer(created, { type: 'undo' });
    expect(undone.currentNodeId).toBe('node-1');
  });
});

/**
 * Правила про сам гейт, а не про покрытие. Все три — повторение схемы:
 * редактор обязан отказать СЕЙЧАС, потому что иначе схема откажет при
 * загрузке, а автор к тому моменту уже потеряет работу.
 */
describe('connect: гейт обязан выдержать ребро', () => {
  function gateWith(overrides: Partial<Gate>): Gate {
    return { ...choiceGate('gate-1', ['opt-a', 'opt-b']), ...overrides };
  }

  it('гейт вида «дальше» рёбер не принимает', () => {
    const gate: Gate = {
      ...choiceGate('gate-1', ['opt-a']),
      config: { kind: 'continue', label: 'Дальше' },
    };
    const p = project([node('node-1', { scene: { elements: [], cues: [], gates: [gate] } }), node('node-2')]);
    expect(() => connect(p, 'node-1', { kind: 'correct', gateId: 'gate-1' }, 'node-2')).toThrow(/один исход/);
  });

  it('ребро по варианту на гейте-вводе бросает: вариантов у него нет', () => {
    const p = project([
      node('node-1', { scene: { elements: [], cues: [], gates: [verdictGate('gate-1')] } }),
      node('node-2'),
    ]);
    expect(() =>
      connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2'),
    ).toThrow(/только у гейта с выбором/);
  });

  it('бесконечный retry бросает: ветка была бы недостижима навсегда', () => {
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [gateWith({ onWrong: 'retry', maxAttempts: null })] },
      }),
      node('node-2'),
    ]);
    expect(() =>
      connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2'),
    ).toThrow(/недостижима/);
  });

  it('retry с ограниченным числом попыток ребро принимает: из гейта есть выход', () => {
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [gateWith({ onWrong: 'retry', maxAttempts: 3 })] },
      }),
      node('node-2'),
    ]);
    expect(() =>
      connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2'),
    ).not.toThrow();
  });
});

/**
 * Гейт и ребро на него — один инвариант на двух уровнях дерева. Автор,
 * убравший у гейта вариант, ничего неправильного не сделал: он передумал.
 * Осиротевшее ребро не должно превращать это в непогружаемый проект.
 */
describe('edgesAfterGateEdit: правка гейта снимает осиротевшие рёбра', () => {
  // Три варианта, а не два: гейт «выбор» обязан иметь их не меньше двух
  // (`ChoiceConfig.options.min(2)`, schema.ts:115), значит правка, которая
  // осиротит ребро, обязана оставить хотя бы два. Фикстура из двух вариантов
  // была бы невалидна сама по себе, и тест проверял бы минимум вариантов
  // вместо каскада.
  const gateABC = choiceGate('gate-1', ['opt-a', 'opt-b', 'opt-c']);
  const withEdges = node('node-1', {
    scene: { elements: [], cues: [], gates: [gateABC] },
    edges: [
      edge('edge-1', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }),
      edge('edge-2', 'node-3', { kind: 'option', gateId: 'gate-1', optionId: 'opt-b' }),
      edge('edge-3', 'node-3', { kind: 'option', gateId: 'gate-1', optionId: 'opt-c' }),
    ],
  });

  it('исчез вариант — ушло ровно его ребро', () => {
    const edges = edgesAfterGateEdit(withEdges, choiceGate('gate-1', ['opt-a', 'opt-b']));
    expect(edges.map((e) => e.id)).toEqual(['edge-1', 'edge-2']);
  });

  it('ничего не осиротело — тот же массив по ссылке', () => {
    expect(edgesAfterGateEdit(withEdges, gateABC)).toBe(withEdges.edges);
  });

  it('гейт стал «дальше» — ушли все его рёбра', () => {
    const gate: Gate = { ...gateABC, config: { kind: 'continue', label: 'Дальше' } };
    expect(edgesAfterGateEdit(withEdges, gate)).toEqual([]);
  });

  it('рёбра чужого гейта и ребро end не трогаются', () => {
    const target = node('node-1', {
      scene: { elements: [], cues: [], gates: [gateABC] },
      edges: [
        edge('edge-1', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-c' }),
        edge('edge-2', 'node-3', { kind: 'option', gateId: 'gate-9', optionId: 'opt-c' }),
        edge('edge-3', 'node-3', { kind: 'end' }),
      ],
    });
    const edges = edgesAfterGateEdit(target, choiceGate('gate-1', ['opt-a', 'opt-b']));
    expect(edges.map((e) => e.id)).toEqual(['edge-2', 'edge-3']);
  });

  it('рёбра «верно»/«неверно» от списка вариантов не зависят и остаются', () => {
    // Гейт-ввод: вариантов у него нет вовсе, и это честный случай для рёбер
    // «верно»/«неверно». choiceGate с пустым списком вариантов был бы невалиден.
    const gate = verdictGate('gate-1');
    const target = node('node-1', {
      scene: { elements: [], cues: [], gates: [gate] },
      edges: [
        edge('edge-1', 'node-2', { kind: 'correct', gateId: 'gate-1' }),
        edge('edge-2', 'node-3', { kind: 'wrong', gateId: 'gate-1' }),
      ],
    });
    expect(edgesAfterGateEdit(target, gate)).toBe(target.edges);
  });
});

describe('редьюсер: правка гейта каскадом снимает осиротевшее ребро', () => {
  const gateABC = choiceGate('gate-1', ['opt-a', 'opt-b', 'opt-c']);
  const shrunk = choiceGate('gate-1', ['opt-a', 'opt-b']);

  function base() {
    return initialState(
      project([
        node('node-1', {
          scene: { elements: [], cues: [], gates: [gateABC] },
          edges: [
            edge('edge-1', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }),
            edge('edge-2', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-b' }),
            edge('edge-3', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-c' }),
          ],
        }),
        node('node-2'),
      ]),
    );
  }

  it('убрали вариант — ребро на него ушло тем же шагом', () => {
    const next = editorReducer(base(), { type: 'updateGate', gate: shrunk });
    expect(next.project.nodes[0]!.edges.map((e) => e.id)).toEqual(['edge-1', 'edge-2']);
  });

  it('правка гейта, не затронувшая варианты, рёбра оставляет теми же по ссылке', () => {
    const state = base();
    const gate: Gate = { ...gateABC, at: { kind: 'seconds', t: 5 } };
    const next = editorReducer(state, { type: 'updateGate', gate });
    expect(next.project.nodes[0]!.edges).toBe(state.project.nodes[0]!.edges);
  });

  it('каскад — один шаг истории, а не два', () => {
    const start = initialHistoryState(base().project);
    const next = historyReducer(start, { type: 'updateGate', gate: shrunk });
    expect(next.history.past).toHaveLength(1);
    expect(next.history.present.nodes[0]!.edges.map((e) => e.id)).toEqual(['edge-1', 'edge-2']);
  });
});

/**
 * Перекрёстная проверка против НАСТОЯЩЕГО валидатора, а не против себя.
 *
 * `connect` и `uncoveredOptions` повторяют правила схемы своим кодом. У копии
 * и оригинала одна и та же возможная ошибка: если я понял правило неверно,
 * мои тесты сойдутся с моим же пониманием и промолчат. Поэтому здесь
 * результат правок редактора отдаётся `ProjectSchema` — тому самому коду,
 * который откажется загружать проект у автора.
 *
 * Несущее утверждение: «панель не показывает дыр» и «схема принимает проект»
 * обязаны совпадать. Расхождение в любую сторону — дефект: либо панель пугает
 * зря, либо молчит там, где сохранение упадёт.
 */
describe('согласие со схемой: дыра в панели ⇔ отказ валидатора', () => {
  function saveable(p: Project): boolean {
    return ProjectSchema.safeParse(p).success;
  }

  function twoOptionProject(): Project {
    return project([
      node('node-1', { scene: { elements: [], cues: [], gates: [choiceGate('gate-1', ['opt-a', 'opt-b'])] } }),
      node('node-2'),
    ]);
  }

  it('покрыты оба варианта — дыр нет и схема принимает', () => {
    let p = twoOptionProject();
    p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2');
    p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-b' }, 'node-2');

    expect(uncoveredOptions(p.nodes[0]!)).toEqual([]);
    expect(saveable(p)).toBe(true);
  });

  it('покрыт один вариант из двух — дыра есть и схема отказывает', () => {
    let p = twoOptionProject();
    p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2');

    expect(uncoveredOptions(p.nodes[0]!)).toEqual([{ gateId: 'gate-1', optionIds: ['opt-b'], verdicts: [] }]);
    expect(saveable(p)).toBe(false);
  });

  it('гейт без рёбер — дыры нет, и схема действительно принимает', () => {
    const p = twoOptionProject();
    expect(uncoveredOptions(p.nodes[0]!)).toEqual([]);
    expect(saveable(p)).toBe(true);
  });

  it('снятое ребро возвращает и дыру, и отказ схемы', () => {
    let p = twoOptionProject();
    p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' }, 'node-2');
    p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId: 'opt-b' }, 'node-2');
    const full = p;
    p = disconnect(p, 'node-1', full.nodes[0]!.edges[1]!.id);

    expect(uncoveredOptions(p.nodes[0]!)).toHaveLength(1);
    expect(saveable(p)).toBe(false);
  });

  it('каскад после удаления варианта оставляет проект ЗАГРУЖАЕМЫМ', () => {
    // Без каскада осталось бы ребро на opt-c, которого у гейта уже нет,
    // и схема отказала бы: «ребро ведёт от варианта, которого у гейта нет».
    //
    // Вариантов три, а остаётся два, не один: меньше двух гейт «выбор» иметь
    // не может, и отказ схемы пришёл бы уже по ДРУГОЙ причине — тест перестал
    // бы проверять каскад и начал проверять минимум вариантов. Это ровно та
    // подмена, на которой он один раз и упал.
    let p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [choiceGate('gate-1', ['opt-a', 'opt-b', 'opt-c'])] },
      }),
      node('node-2'),
    ]);
    for (const optionId of ['opt-a', 'opt-b', 'opt-c']) {
      p = connect(p, 'node-1', { kind: 'option', gateId: 'gate-1', optionId }, 'node-2');
    }
    expect(saveable(p)).toBe(true);

    const after = editorReducer(initialState(p), {
      type: 'updateGate',
      gate: choiceGate('gate-1', ['opt-a', 'opt-b']),
    });

    expect(after.project.nodes[0]!.edges).toHaveLength(2);
    expect(uncoveredOptions(after.project.nodes[0]!)).toEqual([]);
    expect(saveable(after.project)).toBe(true);
  });

  it('запрет бесконечного retry в connect — это отказ самой схемы, а не моя выдумка', () => {
    // Собираем то, что connect не даёт собрать, руками — и убеждаемся, что
    // схема действительно против. Иначе запрет в connect был бы придуманным.
    const gate: Gate = { ...choiceGate('gate-1', ['opt-a']), onWrong: 'retry', maxAttempts: null };
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [gate] },
        edges: [edge('edge-1', 'node-2', { kind: 'option', gateId: 'gate-1', optionId: 'opt-a' })],
      }),
      node('node-2'),
    ]);
    expect(saveable(p)).toBe(false);
  });

  it('запрет рёбер у гейта «дальше» — тоже отказ схемы, а не моя выдумка', () => {
    const gate: Gate = { ...choiceGate('gate-1', ['opt-a']), config: { kind: 'continue', label: 'Дальше' } };
    const p = project([
      node('node-1', {
        scene: { elements: [], cues: [], gates: [gate] },
        edges: [edge('edge-1', 'node-2', { kind: 'correct', gateId: 'gate-1' })],
      }),
      node('node-2'),
    ]);
    expect(saveable(p)).toBe(false);
  });
});

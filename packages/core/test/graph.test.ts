import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadProject,
  nextNodeAfterGate,
  nextNodeAtEnd,
  nodeOf,
  preloadTargetsOfGate,
  type SegmentNode,
} from '../src/index.js';

/** Узел с развилкой по вариантам и сквозным ребром на конец. */
function branching(): SegmentNode {
  return {
    id: 'n1',
    title: 'Первый',
    audio: { src: 'a.wav', duration: 10, words: [] },
    scene: { elements: [], cues: [], gates: [] },
    edges: [
      { id: 'e1', to: 'yes', when: { kind: 'option', gateId: 'g1', optionId: 'o1' } },
      { id: 'e2', to: 'no', when: { kind: 'option', gateId: 'g1', optionId: 'o2' } },
      { id: 'e3', to: 'tail', when: { kind: 'end' } },
    ],
  };
}

/** Узел, который ветвится по верно/неверно, а не по варианту. */
function byVerdict(): SegmentNode {
  return {
    ...branching(),
    edges: [
      { id: 'e1', to: 'praise', when: { kind: 'correct', gateId: 'g1' } },
      { id: 'e2', to: 'explain', when: { kind: 'wrong', gateId: 'g1' } },
    ],
  };
}

describe('выбор следующего узла', () => {
  it('вариант ведёт по своему ребру', () => {
    const node = branching();
    expect(nextNodeAfterGate(node, 'g1', { optionId: 'o1', correct: true })).toBe('yes');
    expect(nextNodeAfterGate(node, 'g1', { optionId: 'o2', correct: false })).toBe('no');
  });

  it('верно и неверно ведут по своим рёбрам', () => {
    const node = byVerdict();
    expect(nextNodeAfterGate(node, 'g1', { correct: true })).toBe('praise');
    expect(nextNodeAfterGate(node, 'g1', { correct: false })).toBe('explain');
  });

  it('гейт без рёбер не уводит из узла', () => {
    // Не развилка, а обычный гейт: воспроизведение продолжается внутри узла.
    // Самый частый случай — так устроены все семь старых фикстур.
    const node = branching();
    expect(nextNodeAfterGate(node, 'g-другой', { optionId: 'o1', correct: true }))
      .toBeUndefined();
  });

  it('ребро «конец узла» не участвует в выборе по ответу', () => {
    // Иначе сквозное ребро перехватывало бы ответы на любом гейте.
    const node: SegmentNode = { ...branching(), edges: [branching().edges[2]!] };
    expect(nextNodeAfterGate(node, 'g1', { optionId: 'o1', correct: true })).toBeUndefined();
  });

  it('рёбра есть, но ответ ни под одно не подошёл — падает громко', () => {
    // Схема обязана поймать это при загрузке правилом полного покрытия.
    // Если дошло до сюда, молчать нельзя: тихий выбор «первого попавшегося»
    // увёл бы зрителя не туда, и никто бы не узнал.
    const node = branching();
    expect(() => nextNodeAfterGate(node, 'g1', { optionId: 'нет-такого', correct: false }))
      .toThrow(/ни одно не подошло/);
  });
});

describe('конец узла', () => {
  it('ведёт по ребру end', () => {
    expect(nextNodeAtEnd(branching())).toBe('tail');
  });

  it('узел без ребра end завершает объяснение', () => {
    expect(nextNodeAtEnd(byVerdict())).toBeUndefined();
  });
});

describe('что греть на гейте', () => {
  it('цели всех рёбер этого гейта, без повторов', () => {
    expect(preloadTargetsOfGate(branching(), 'g1').sort()).toEqual(['no', 'yes']);
  });

  it('ребро end не греется на гейте: оно сработает не сейчас', () => {
    expect(preloadTargetsOfGate(branching(), 'g1')).not.toContain('tail');
  });

  it('у гейта без рёбер греть нечего', () => {
    expect(preloadTargetsOfGate(branching(), 'g-другой')).toEqual([]);
  });

  it('две ветки в один узел дают одну цель', () => {
    const node: SegmentNode = {
      ...branching(),
      edges: [
        { id: 'e1', to: 'same', when: { kind: 'option', gateId: 'g1', optionId: 'o1' } },
        { id: 'e2', to: 'same', when: { kind: 'option', gateId: 'g1', optionId: 'o2' } },
      ],
    };
    expect(preloadTargetsOfGate(node, 'g1')).toEqual(['same']);
  });
});

describe('поиск узла', () => {
  const project = loadProject(
    JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'projects', 'branching.json'), 'utf8')),
  );

  it('находит узел по идентификатору', () => {
    expect(nodeOf(project, 'n-yes').audio.src).toBe('/audio/branch-yes.wav');
  });

  it('несуществующий узел — громкая ошибка, а не undefined', () => {
    expect(() => nodeOf(project, 'нет-такого')).toThrow(/нет-такого/);
  });

  it('фикстура развилки ходится целиком от стартового узла', () => {
    const start = nodeOf(project, project.entry);
    const yes = nextNodeAfterGate(start, 'gate-start', { optionId: 'opt-yes', correct: true });
    const no = nextNodeAfterGate(start, 'gate-start', { optionId: 'opt-no', correct: false });
    expect(yes).toBe('n-yes');
    expect(no).toBe('n-no');
    // Обе ветки — концовки: объяснение завершается, а не падает.
    expect(nextNodeAtEnd(nodeOf(project, yes!))).toBeUndefined();
    expect(nextNodeAtEnd(nodeOf(project, no!))).toBeUndefined();
  });
});

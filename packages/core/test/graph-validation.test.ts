import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadProject } from '../src/index.js';

/**
 * Заведомо ломаемый черновик проекта.
 *
 * Тип `any` здесь не заглушка компилятора, а признание: каждый тест ниже
 * деформирует объект так, чтобы он перестал быть валидным проектом, и кормит
 * его `loadProject(input: unknown)`. Строгий тип запрещал бы ровно то, что
 * проверяется, — у системы типов нет полезного мнения о намеренно битых данных.
 *
 * Цена известна: опечатку в самом эталоне компилятор не поймает. Её ловит
 * первый тест — «эталон валиден». Без него всё, что ниже, зелено впустую.
 */
function twoNodes(): any {
  const audio = { src: 'a.mp3', duration: 10, words: [] };
  const gate = {
    id: 'g1',
    at: { kind: 'seconds', t: 5 },
    config: {
      kind: 'choice',
      prompt: 'Как думаешь?',
      options: [{ id: 'o1', label: 'Так' }, { id: 'o2', label: 'Иначе' }],
      correctId: 'o1',
    },
    // Развилка обязана быть проходима: при бесконечном retry ветка «o2»
    // была бы недостижима, потому что неверный ответ не доводит до ребра.
    onWrong: 'continue',
  };
  return {
    schemaVersion: 2,
    meta: { title: 'Тест' },
    entry: 'n1',
    nodes: [
      {
        id: 'n1', title: 'Первый', audio,
        scene: { elements: [], cues: [], gates: [gate] },
        edges: [
          { id: 'e1', to: 'n2', when: { kind: 'option', gateId: 'g1', optionId: 'o1' } },
          { id: 'e2', to: 'n2', when: { kind: 'option', gateId: 'g1', optionId: 'o2' } },
        ],
      },
      { id: 'n2', title: 'Второй', audio, scene: { elements: [], cues: [], gates: [] }, edges: [] },
    ],
  };
}

describe('целостность графа', () => {
  it('эталон валиден: иначе все проверки ниже зелены впустую', () => {
    expect(() => loadProject(twoNodes())).not.toThrow();
  });

  it('стартовый узел обязан существовать', () => {
    const p = twoNodes();
    p.entry = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/Стартовый узел/);
  });

  it('ребро в несуществующий узел не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[0].to = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/несуществующий узел/);
  });

  it('ребро на чужой гейт не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[0].when.gateId = 'g-другой';
    expect(() => loadProject(p)).toThrow(/гейт/);
  });

  it('непокрытый вариант не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges.pop();
    expect(() => loadProject(p)).toThrow(/не покрыт/);
  });

  it('два ребра на один вариант не проходят', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when.optionId = 'o1';
    expect(() => loadProject(p)).toThrow(/дважды/);
  });

  it('ребро на несуществующий вариант не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when.optionId = 'нет-такого';
    expect(() => loadProject(p)).toThrow(/варианта/);
  });

  it('смешивать варианты и верно-неверно нельзя', () => {
    const p = twoNodes();
    p.nodes[0].edges[1].when = { kind: 'wrong', gateId: 'g1' };
    expect(() => loadProject(p)).toThrow(/смешивать/);
  });

  it('верно без неверно не проходит', () => {
    const p = twoNodes();
    p.nodes[0].edges = [{ id: 'e1', to: 'n2', when: { kind: 'correct', gateId: 'g1' } }];
    expect(() => loadProject(p)).toThrow(/оба/);
  });

  it('гейт continue рёбер иметь не может', () => {
    const p = twoNodes();
    p.nodes[0].scene.gates[0].config = { kind: 'continue', label: 'Дальше' };
    expect(() => loadProject(p)).toThrow(/continue/);
  });

  it('два ребра «конец узла» не проходят', () => {
    const p = twoNodes();
    p.nodes[0].edges.push({ id: 'e3', to: 'n2', when: { kind: 'end' } });
    p.nodes[0].edges.push({ id: 'e4', to: 'n1', when: { kind: 'end' } });
    expect(() => loadProject(p)).toThrow(/конец узла/);
  });

  it('повтор идентификатора узла не проходит', () => {
    const p = twoNodes();
    p.nodes[1].id = 'n1';
    expect(() => loadProject(p)).toThrow(/повторяется/);
  });

  it('бесконечный retry на гейте с рёбрами не проходит', () => {
    // Ветка «Нет» была бы недостижима навсегда: неверный ответ не доводит
    // до выхода из гейта, а значит и до ребра. Рёбра при этом корректны.
    const p = twoNodes();
    p.nodes[0].scene.gates[0].onWrong = 'retry';
    p.nodes[0].scene.gates[0].maxAttempts = null;
    expect(() => loadProject(p)).toThrow(/бесконечный retry/);
  });

  it('retry с ограничением попыток законен: гейт всё же проходим', () => {
    const p = twoNodes();
    p.nodes[0].scene.gates[0].onWrong = 'retry';
    p.nodes[0].scene.gates[0].maxAttempts = 3;
    expect(() => loadProject(p)).not.toThrow();
  });

  it('reveal законен: continueAfterReveal доводит до ребра', () => {
    const p = twoNodes();
    p.nodes[0].scene.gates[0].onWrong = 'reveal';
    expect(() => loadProject(p)).not.toThrow();
  });

  it('бесконечный retry без рёбер законен: это обычный гейт', () => {
    // Запрет касается только развилок. Обычному гейту бесконечные попытки
    // разрешены и осмысленны — так устроены старые фикстуры.
    const p = twoNodes();
    p.nodes[0].edges = [];
    p.nodes[0].scene.gates[0].onWrong = 'retry';
    p.nodes[0].scene.gates[0].maxAttempts = null;
    expect(() => loadProject(p)).not.toThrow();
  });

  it('гейт без рёбер законен: это обычный гейт, а не развилка', () => {
    const p = twoNodes();
    p.nodes[0].edges = [];
    expect(() => loadProject(p)).not.toThrow();
  });

  it('узел без исходящих рёбер законен: это концовка', () => {
    const p = twoNodes();
    expect(loadProject(p).nodes[1]!.edges).toEqual([]);
  });

  it('фикстура развилки валидна и имеет три узла', () => {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures', 'projects', 'branching.json'), 'utf8'),
    );
    const project = loadProject(raw);
    expect(project.schemaVersion).toBe(2);
    expect(project.nodes).toHaveLength(3);
    expect(project.nodes[0]!.edges).toHaveLength(2);
    const targets = project.nodes[0]!.edges.map((edge) => edge.to);
    expect(new Set(targets).size).toBe(2);
  });
});

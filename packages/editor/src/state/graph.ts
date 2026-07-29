/**
 * Правила графа сегментов в редакторе: создание и удаление узлов, рёбра
 * между ними, вопросы «что достижимо» и «какой гейт не покрыт рёбрами».
 *
 * Чистый модуль — без React, без DOM, без побочных эффектов. Узкая дверца
 * к `project.audio`/`project.scene` — это `state/project.ts` (см. его
 * комментарий и тест инвариантов «дверца»); этот файл в белый список
 * дверцы не входит и потому обязан обращаться только к полям узла
 * (`node.audio`, `node.scene`) и структуре графа (`project.nodes`,
 * `project.entry`), а не к самому проекту как к сцене.
 */
import type { Edge, EdgeWhen, Gate, Project, SegmentNode } from '@player/core';

import { freeId } from './elements.js';

/**
 * Создаёт новый узел-концовку: рёбер нет, сцена пуста.
 *
 * Дорожка копируется у узла `audioFrom` ПО ССЫЛКЕ, не глубокой копией:
 * `Audio` — обязательное поле схемы, а своей дорожки у нового узла пока
 * взяться неоткуда (загрузка аудио — не в этой сессии). Копия объекта
 * раздула бы память проекта без всякой пользы: содержимое всё равно общее.
 */
export function addNode(project: Project, audioFrom: string): { project: Project; node: SegmentNode } {
  const source = project.nodes.find((candidate) => candidate.id === audioFrom);
  if (!source) {
    throw new Error(`Узла «${audioFrom}», у которого берётся дорожка, нет в проекте`);
  }

  const id = freeId('node', project.nodes);
  const node: SegmentNode = {
    id,
    // Порядковый номер нового узла в массиве — не id и не число узлов ДО
    // добавления, а позиция, которую узел займёт (nodes.length + 1).
    title: `Узел ${project.nodes.length + 1}`,
    audio: source.audio,
    scene: { elements: [], cues: [], gates: [] },
    edges: [],
  };

  return { project: { ...project, nodes: [...project.nodes, node] }, node };
}

/**
 * Удаляет узел и ВСЕ входящие в него рёбра у остальных узлов.
 *
 * Без каскада по рёбрам схема отказала бы при следующей загрузке: `Edge.to`
 * обязан указывать на существующий узел. Узнать об этом на сохранении,
 * а не спустя полчаса при следующем открытии, дешевле.
 */
export function removeNode(project: Project, nodeId: string): Project {
  if (nodeId === project.entry) {
    // Стартовый узел один и он обязателен схемой — удалить его значило бы
    // оставить проект без входной точки.
    throw new Error(`Стартовый узел «${nodeId}» удалить нельзя: он обязателен схемой`);
  }
  if (!project.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Узла «${nodeId}» нет в проекте`);
  }

  const nodes = project.nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => {
      const edges = node.edges.filter((edge) => edge.to !== nodeId);
      // Ничего не изменилось — та же ссылка, как и было у узла раньше:
      // на этом держится решение StageView, пересобирать сцену или нет.
      if (edges.length === node.edges.length) return node;
      return { ...node, edges };
    });

  return { ...project, nodes };
}

/** Исходящие рёбра узла, привязанные к этому гейту (без `end` — у него гейта нет). */
function edgesForGate(node: SegmentNode, gateId: string): Edge[] {
  return node.edges.filter((edge) => edge.when.kind !== 'end' && edge.when.gateId === gateId);
}

/**
 * Добавляет исходящее ребро узлу `fromId`.
 *
 * Повторяет правило полного покрытия из схемы (`schema.ts:329` и рядом) —
 * не изобретает своё: то, что здесь разрешено, обязано пройти загрузку,
 * а то, что запрещено, схема всё равно отклонит, только позже и без
 * привязки к тому, что автор только что сделал.
 */
export function connect(project: Project, fromId: string, when: EdgeWhen, toId: string): Project {
  const fromNode = project.nodes.find((node) => node.id === fromId);
  if (!fromNode) {
    throw new Error(`Узла «${fromId}» нет в проекте: не от кого вести ребро`);
  }
  if (!project.nodes.some((node) => node.id === toId)) {
    throw new Error(`Узла «${toId}» нет в проекте: ребру некуда вести`);
  }

  if (when.kind === 'end') {
    if (fromNode.edges.some((edge) => edge.when.kind === 'end')) {
      throw new Error(`У узла «${fromId}» уже есть ребро-концовка: второй «end» не бывает`);
    }
  } else {
    const gate = fromNode.scene.gates.find((candidate) => candidate.id === when.gateId);
    if (!gate) {
      throw new Error(`Гейта «${when.gateId}» нет в сцене узла «${fromId}»`);
    }

    // Дальше — три правила схемы, которые про сам гейт, а не про покрытие.
    // Они здесь не для красоты: без них редактор позволяет собрать проект,
    // который не загрузится, и автор узнает об этом на сохранении.
    if (gate.config.kind === 'continue') {
      throw new Error(`Гейт «${when.gateId}» вида «дальше» не может иметь рёбер: у него один исход`);
    }
    if (when.kind === 'option' && gate.config.kind !== 'choice') {
      throw new Error(`Гейт «${when.gateId}»: рёбра по вариантам бывают только у гейта с выбором`);
    }
    // Проходимость, а не связность. Бесконечный retry не выпускает из гейта
    // никого, кроме верно ответившего, — значит все прочие ветки недостижимы
    // навсегда, хотя рёбра корректны и покрытие полное (schema.ts:356).
    if (gate.onWrong === 'retry' && gate.maxAttempts === null) {
      throw new Error(
        `Гейт «${when.gateId}» держит бесконечный retry: ветка стала бы недостижима. `
          + 'Поставьте «продолжить» или «показать ответ», либо ограничьте число попыток.',
      );
    }

    const existing = edgesForGate(fromNode, when.gateId);
    const hasOption = existing.some((edge) => edge.when.kind === 'option');
    const hasVerdict = existing.some((edge) => edge.when.kind === 'correct' || edge.when.kind === 'wrong');

    if (when.kind === 'option') {
      if (hasVerdict) {
        throw new Error(
          `Гейт «${when.gateId}»: нельзя смешивать рёбра по вариантам и по верно/неверно`,
        );
      }
      if (existing.some((edge) => edge.when.kind === 'option' && edge.when.optionId === when.optionId)) {
        throw new Error(`Гейт «${when.gateId}»: вариант «${when.optionId}» уже покрыт ребром`);
      }
    } else {
      // 'correct' | 'wrong'
      if (hasOption) {
        throw new Error(
          `Гейт «${when.gateId}»: нельзя смешивать рёбра по вариантам и по верно/неверно`,
        );
      }
      if (existing.some((edge) => edge.when.kind === when.kind)) {
        throw new Error(`Гейт «${when.gateId}»: исход «${when.kind}» уже покрыт ребром`);
      }
    }
  }

  // Ребро на самого себя — законная петля-повтор, схема её не запрещает.
  const edge: Edge = { id: freeId('edge', fromNode.edges), to: toId, when };
  const nextNode: SegmentNode = { ...fromNode, edges: [...fromNode.edges, edge] };
  const nodes = project.nodes.map((node) => (node.id === fromId ? nextNode : node));
  return { ...project, nodes };
}

/** Снимает ребро `edgeId` с узла `fromId`. */
export function disconnect(project: Project, fromId: string, edgeId: string): Project {
  const fromNode = project.nodes.find((node) => node.id === fromId);
  if (!fromNode) {
    throw new Error(`Узла «${fromId}» нет в проекте`);
  }

  const edges = fromNode.edges.filter((edge) => edge.id !== edgeId);
  if (edges.length === fromNode.edges.length) {
    throw new Error(`У узла «${fromId}» нет ребра «${edgeId}»`);
  }

  const nextNode: SegmentNode = { ...fromNode, edges };
  const nodes = project.nodes.map((node) => (node.id === fromId ? nextNode : node));
  return { ...project, nodes };
}

/**
 * Рёбра узла после правки гейта — без тех, что правка осиротила.
 *
 * Гейт и рёбра, которые на него ссылаются, — один инвариант, разложенный
 * по двум уровням дерева: гейт лежит в `scene.gates`, ребро — в `node.edges`.
 * Пока автор не мог создавать рёбра, разойтись им было негде. Теперь может:
 * достаточно убрать у гейта вариант, который уже покрыт ребром, и схема
 * откажется загружать проект («ребро ведёт от варианта, которого нет»).
 * Автор при этом ничего неправильного не сделал — он просто передумал.
 *
 * Поэтому правка гейта снимает потерявшие смысл рёбра сама:
 * — гейт стал «дальше» (`continue`) — рёбер у него не бывает вовсе;
 * — вариант исчез или гейт перестал быть выбором — рёбра по вариантам уходят;
 * — рёбра «верно»/«неверно» остаются: они законны у любого гейта, кроме
 *   `continue`, и от списка вариантов не зависят.
 *
 * Ничего не осиротело — возвращается ТОТ ЖЕ массив по ссылке.
 */
export function edgesAfterGateEdit(node: SegmentNode, gate: Gate): readonly Edge[] {
  const optionIds = new Set(gate.config.kind === 'choice' ? gate.config.options.map((option) => option.id) : []);

  const edges = node.edges.filter((edge) => {
    if (edge.when.kind === 'end' || edge.when.gateId !== gate.id) return true;
    if (gate.config.kind === 'continue') return false;
    if (edge.when.kind !== 'option') return true;
    return optionIds.has(edge.when.optionId);
  });

  return edges.length === node.edges.length ? node.edges : edges;
}

/**
 * Узлы, достижимые из `startId` (по умолчанию — из `project.entry`),
 * включая сам старт.
 *
 * Обход в глубину по `edges[].to`. Ссылки на несуществующие узлы просто
 * пропускаются: в валидном проекте их не бывает, а бросать здесь незачем —
 * функция отвечает на вопрос «что достижимо», а не «валиден ли проект».
 */
export function reachableFrom(project: Project, startId?: string): ReadonlySet<string> {
  const start = startId ?? project.entry;
  const byId = new Map(project.nodes.map((node) => [node.id, node] as const));

  const visited = new Set<string>([start]);
  const stack = [start];

  while (stack.length > 0) {
    const id = stack.pop()!;
    const node = byId.get(id);
    if (!node) continue;
    for (const edge of node.edges) {
      if (visited.has(edge.to)) continue; // не даёт циклу зациклить обход
      visited.add(edge.to);
      stack.push(edge.to);
    }
  }

  return visited;
}

/** Дыра в покрытии одного гейта — см. комментарий `uncoveredOptions`. */
export interface UncoveredGate {
  readonly gateId: string;
  /** Варианты выбора без ребра. */
  readonly optionIds: readonly string[];
  /** Каких вердиктов не хватает: 'correct' и/или 'wrong'. */
  readonly verdicts: readonly ('correct' | 'wrong')[];
}

/**
 * Дыры в покрытии гейтов узла — то же правило, что и в схеме
 * (`schema.ts:319`-422), но как вопрос «чего не хватает», а не как отказ
 * при загрузке: автору нужно увидеть дыру ДО сохранения, а не после.
 *
 * Гейт без единого ребра дырой не считается — пустой список рёбер значит
 * «этот гейт не ветвит», и схема такое разрешает.
 */
export function uncoveredOptions(node: SegmentNode): UncoveredGate[] {
  const byGate = new Map<string, Edge[]>();
  for (const edge of node.edges) {
    if (edge.when.kind === 'end') continue; // сквозное ребро не привязано к гейту
    const list = byGate.get(edge.when.gateId) ?? [];
    list.push(edge);
    byGate.set(edge.when.gateId, list);
  }

  const holes: UncoveredGate[] = [];

  for (const [gateId, edges] of byGate) {
    const gate = node.scene.gates.find((candidate) => candidate.id === gateId);
    if (!gate) continue; // ссылка в никуда — рассинхрон, не наша забота здесь

    const hasOption = edges.some((edge) => edge.when.kind === 'option');

    if (hasOption) {
      if (gate.config.kind !== 'choice') continue; // рассинхрон схемы, не дыра покрытия
      const covered = new Set(
        edges
          .filter((edge): edge is Edge & { when: Extract<EdgeWhen, { kind: 'option' }> } => edge.when.kind === 'option')
          .map((edge) => edge.when.optionId),
      );
      const optionIds = gate.config.options.map((option) => option.id).filter((id) => !covered.has(id));
      if (optionIds.length > 0) {
        holes.push({ gateId, optionIds, verdicts: [] });
      }
      continue;
    }

    // Гейт вида continue рёбер иметь не может — если они есть, это уже
    // нарушение схемы, а не дыра покрытия: у него один исход.
    if (gate.config.kind === 'continue') continue;

    const verdicts: ('correct' | 'wrong')[] = [];
    if (!edges.some((edge) => edge.when.kind === 'correct')) verdicts.push('correct');
    if (!edges.some((edge) => edge.when.kind === 'wrong')) verdicts.push('wrong');
    if (verdicts.length > 0) {
      holes.push({ gateId, optionIds: [], verdicts });
    }
  }

  return holes;
}

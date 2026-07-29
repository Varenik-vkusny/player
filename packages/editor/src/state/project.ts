/**
 * Состояние редактора и единственный способ его менять.
 *
 * Пара к `segmentOf` из плеера: тот — единственное место, где проект читают,
 * этот — единственное, где его пишут. Когда проект станет графом сегментов
 * (docs/planning.md §5а), поменяются ровно эти две точки, а не весь редактор.
 *
 * Ссылочная целостность здесь не педантизм, а требование: сцена в браузере
 * обновляется точечно, и StageView определяет, что именно изменилось,
 * сравнением ссылок. Если редьюсер начнёт пересоздавать неизменившиеся
 * элементы, сцена будет пересобираться целиком на каждое движение мыши.
 */
import type { Cue, Element, EdgeWhen, Gate, Project, Scene, SegmentNode, TimeRef } from '@player/core';

import { removeElement as removeElementFromScene } from './elements.js';
import * as graph from './graph.js';

/**
 * `freeId` живёт в `elements.ts` — это модуль про элементы, а не про весь
 * проект. Реэкспорт здесь нужен ради обратной совместимости: редактор
 * (`Editor.tsx`) уже импортирует `freeId` из этого файла для `addCue`/`addGate`.
 */
export { freeId } from './elements.js';

export interface EditorState {
  readonly project: Project;
  /** Выделенный элемент. undefined — выделения нет. */
  readonly selectedId: string | undefined;
  /**
   * Узел, который автор сейчас правит. Не в истории: это вид, а не данные,
   * как и `selectedId` — переключение узла само по себе ничего в проекте
   * не меняет.
   */
  readonly currentNodeId: string;
}

export type EditorAction =
  | { readonly type: 'select'; readonly id: string | undefined }
  // `commit` — не про то, ЧТО меняется, а про то, стал ли этот вызов
  // отдельным шагом истории. Отсутствие (undefined) значит «да, как обычно» —
  // так ведут себя все существующие вызыватели (клавиатура, охранник
  // целостности в тестах) без единой правки. `commit: false` — сигнал
  // редьюсеру истории (`state/editorHistory.ts`), что это ОДНО из многих
  // событий одного жеста (перетаскивание, набор в числовом поле) и его нельзя
  // класть в историю отдельным шагом. Сам `editorReducer` этого поля не
  // читает — оно адресовано исключительно обёртке над историей.
  | { readonly type: 'replaceElement'; readonly element: Element; readonly commit?: boolean }
  | { readonly type: 'addElement'; readonly element: Element }
  | { readonly type: 'removeElement'; readonly id: string }
  | { readonly type: 'addCue'; readonly cue: Cue }
  | { readonly type: 'addGate'; readonly gate: Gate }
  | {
      readonly type: 'moveMark';
      readonly kind: MarkKind;
      readonly id: string;
      readonly at: TimeRef;
      readonly commit?: boolean;
    }
  | { readonly type: 'removeMark'; readonly kind: MarkKind; readonly id: string }
  | { readonly type: 'updateGate'; readonly gate: Gate }
  | { readonly type: 'updateCue'; readonly cue: Cue }
  | { readonly type: 'addNode' }
  | { readonly type: 'removeNode'; readonly id: string }
  | { readonly type: 'selectNode'; readonly id: string }
  | { readonly type: 'connect'; readonly when: EdgeWhen; readonly to: string }
  | { readonly type: 'disconnect'; readonly edgeId: string };

/** Метки на дорожке бывают двух родов, и хранятся они в разных массивах. */
export type MarkKind = 'cue' | 'gate';

export function initialState(project: Project): EditorState {
  return { project, selectedId: undefined, currentNodeId: project.entry };
}

/**
 * Узел, который сейчас правит редьюсер.
 *
 * До Задачи 8 редьюсер был жёстко привязан к стартовому узлу — теперь автор
 * может переключаться (`selectNode`), поэтому узел передаётся явно, по id
 * (`state.currentNodeId` у вызывающих внутри этого файла).
 */
function currentNode(project: Project, nodeId: string): SegmentNode {
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    // Раньше сюда попадали только в обход loadProject (схема гарантирует
    // стартовый узел при загрузке). Теперь есть и второй путь: currentNodeId
    // рассинхронизировался с проектом — например, состояние собрано в обход
    // editorReducer/historyReducer.
    throw new Error(`Текущего узла «${nodeId}» нет в проекте`);
  }
  return node;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select': {
      if (state.selectedId === action.id) return state;
      if (action.id !== undefined && !hasElement(state.project, state.currentNodeId, action.id)) {
        throw new Error(`Нельзя выделить элемент «${action.id}»: его нет в проекте`);
      }
      return { ...state, selectedId: action.id };
    }

    case 'replaceElement': {
      const elements = currentNode(state.project, state.currentNodeId).scene.elements;
      const index = elements.findIndex((element) => element.id === action.element.id);
      if (index < 0) {
        // Замена несуществующего элемента — это рассинхрон состояния
        // и того, что показано на экране. Молча добавить его сюда значило бы
        // скрыть настоящую причину.
        throw new Error(`Нельзя заменить элемент «${action.element.id}»: его нет в проекте`);
      }
      if (elements[index] === action.element) return state;

      const next = elements.slice();
      next[index] = action.element;
      return withScene(state, { elements: next });
    }

    case 'addElement': {
      if (currentNode(state.project, state.currentNodeId).scene.elements.some((element) => element.id === action.element.id)) {
        throw new Error(`Элемент «${action.element.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      // Новый элемент сразу выделен: автор только что его создал и,
      // скорее всего, тут же начнёт править — незачем кликать по нему заново.
      const next = withScene(state, { elements: [...currentNode(state.project, state.currentNodeId).scene.elements, action.element] });
      return { ...next, selectedId: action.element.id };
    }

    case 'removeElement': {
      // Каскад по cues и сохранение ссылки на неизменившиеся массивы —
      // забота elements.ts, а не редьюсера.
      const { scene } = removeElementFromScene(currentNode(state.project, state.currentNodeId).scene, action.id);
      const next = withScene(state, scene);
      if (state.selectedId !== action.id) return next;
      // Удалили то, что было выделено, — выделять больше нечего.
      return { ...next, selectedId: undefined };
    }

    case 'addCue': {
      if (currentNode(state.project, state.currentNodeId).scene.cues.some((cue) => cue.id === action.cue.id)) {
        throw new Error(`Анимация «${action.cue.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      if (!hasElement(state.project, state.currentNodeId, action.cue.targetId)) {
        // Схема это проверяет при загрузке, но узнать об этом при сохранении
        // на полчаса позже — значит потерять полчаса работы.
        throw new Error(`Анимация ссылается на элемент «${action.cue.targetId}», которого нет`);
      }
      return withScene(state, { cues: [...currentNode(state.project, state.currentNodeId).scene.cues, action.cue] });
    }

    case 'addGate': {
      if (currentNode(state.project, state.currentNodeId).scene.gates.some((gate) => gate.id === action.gate.id)) {
        throw new Error(`Гейт «${action.gate.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      return withScene(state, { gates: [...currentNode(state.project, state.currentNodeId).scene.gates, action.gate] });
    }

    case 'moveMark': {
      if (action.kind === 'cue') {
        const cues = replaceAt(currentNode(state.project, state.currentNodeId).scene.cues, action.id, (cue) => ({
          ...cue,
          at: action.at,
        }));
        return withScene(state, { cues });
      }
      const gates = replaceAt(currentNode(state.project, state.currentNodeId).scene.gates, action.id, (gate) => ({
        ...gate,
        at: action.at,
      }));
      return withScene(state, { gates });
    }

    case 'removeMark': {
      if (action.kind === 'cue') {
        const cues = currentNode(state.project, state.currentNodeId).scene.cues.filter((cue) => cue.id !== action.id);
        if (cues.length === currentNode(state.project, state.currentNodeId).scene.cues.length) {
          throw new Error(`Нечего удалять: анимации «${action.id}» нет`);
        }
        return withScene(state, { cues });
      }
      const gates = currentNode(state.project, state.currentNodeId).scene.gates.filter((gate) => gate.id !== action.id);
      if (gates.length === currentNode(state.project, state.currentNodeId).scene.gates.length) {
        throw new Error(`Нечего удалять: гейта «${action.id}» нет`);
      }
      return withScene(state, { gates });
    }

    case 'updateGate': {
      // Панель выделенной метки (срез 3) собирает новый Gate через чистые
      // функции state/gates.ts и присылает готовый объект — редьюсер лишь
      // кладёт его на место по id, как replaceElement для элементов.
      const gates = currentNode(state.project, state.currentNodeId).scene.gates;
      const index = gates.findIndex((gate) => gate.id === action.gate.id);
      if (index < 0) {
        throw new Error(`Нельзя обновить гейт «${action.gate.id}»: его нет в проекте`);
      }
      if (gates[index] === action.gate) return state;
      const next = gates.slice();
      next[index] = action.gate;
      // Правка гейта могла осиротить ребро: убрать вариант, на который ребро
      // ведёт, или сменить вид гейта на «дальше». Осиротевшее ребро — это
      // проект, который не загрузится, поэтому каскад идёт здесь же, одним
      // шагом истории с самой правкой. Подробности — в graph.ts.
      return withPrunedEdges(withScene(state, { gates: next }), action.gate);
    }

    case 'updateCue': {
      // В отличие от гейтов, у Cue есть структурная ссылка на элемент
      // (targetId) — панель анимации умеет менять цель, и её обязана
      // проверить схема (ProjectSchema.superRefine), а не только загрузка
      // на диске: та же логика, что и у addCue.
      if (!hasElement(state.project, state.currentNodeId, action.cue.targetId)) {
        throw new Error(`Анимация ссылается на элемент «${action.cue.targetId}», которого нет`);
      }
      const cues = currentNode(state.project, state.currentNodeId).scene.cues;
      const index = cues.findIndex((cue) => cue.id === action.cue.id);
      if (index < 0) {
        throw new Error(`Нельзя обновить анимацию «${action.cue.id}»: её нет в проекте`);
      }
      if (cues[index] === action.cue) return state;
      const next = cues.slice();
      next[index] = action.cue;
      return withScene(state, { cues: next });
    }

    case 'addNode': {
      // Дорожку новый узел копирует у текущего: своей автор пока загрузить
      // не может (см. state/graph.ts). Сразу становится текущим — иначе
      // автор создал бы узел и продолжил бы править прежний.
      const { project, node } = graph.addNode(state.project, state.currentNodeId);
      return { ...state, project, currentNodeId: node.id, selectedId: undefined };
    }

    case 'removeNode': {
      const project = graph.removeNode(state.project, action.id);
      if (action.id !== state.currentNodeId) return { ...state, project };
      // Текущий узел удалён из-под автора — возвращаемся на стартовый.
      return { ...state, project, currentNodeId: project.entry, selectedId: undefined };
    }

    case 'selectNode': {
      if (action.id === state.currentNodeId) return state;
      if (!state.project.nodes.some((node) => node.id === action.id)) {
        throw new Error(`Нельзя переключиться на узел «${action.id}»: его нет в проекте`);
      }
      // Выделенный элемент принадлежал сцене прежнего узла.
      return { ...state, currentNodeId: action.id, selectedId: undefined };
    }

    case 'connect': {
      const project = graph.connect(state.project, state.currentNodeId, action.when, action.to);
      return { ...state, project };
    }

    case 'disconnect': {
      const project = graph.disconnect(state.project, state.currentNodeId, action.edgeId);
      return { ...state, project };
    }
  }
}

/**
 * Собирает новое состояние с изменённой сценой текущего узла.
 *
 * Неизменившиеся массивы остаются ТЕМИ ЖЕ по ссылке — на этом держится
 * решение StageView о том, пересобирать сцену или обновить один узел.
 * Остальные узлы графа (сегодня их нет, но `nodes` уже массив) остаются
 * теми же объектами по ссылке тоже — `map` их не трогает.
 */
function withScene(state: EditorState, patch: Partial<Scene>): EditorState {
  const node = currentNode(state.project, state.currentNodeId);
  const nextNode: SegmentNode = { ...node, scene: { ...node.scene, ...patch } };
  const nodes = state.project.nodes.map((candidate) => (candidate.id === node.id ? nextNode : candidate));
  return {
    ...state,
    project: { ...state.project, nodes },
  };
}

/**
 * Снимает с текущего узла рёбра, которые осиротила правка гейта.
 *
 * Парная к `withScene`, но уровнем выше: `withScene` умеет менять только
 * сцену, а рёбра лежат на самом узле. Ровно поэтому расхождение гейта
 * и рёбер было невыразимо и не ловилось — у редьюсера не было способа
 * поменять сцену и рёбра одной правкой.
 *
 * Ничего не осиротело — состояние возвращается тем же по ссылке.
 */
function withPrunedEdges(state: EditorState, gate: Gate): EditorState {
  const node = currentNode(state.project, state.currentNodeId);
  const edges = graph.edgesAfterGateEdit(node, gate);
  if (edges === node.edges) return state;

  const nextNode: SegmentNode = { ...node, edges: [...edges] };
  const nodes = state.project.nodes.map((candidate) => (candidate.id === node.id ? nextNode : candidate));
  return { ...state, project: { ...state.project, nodes } };
}

/** Заменяет элемент массива по id. Отсутствие — рассинхрон, а не штатный случай. */
function replaceAt<T extends { id: string }>(
  items: readonly T[],
  id: string,
  update: (item: T) => T,
): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`В проекте нет метки «${id}»`);
  const next = items.slice();
  next[index] = update(items[index]!);
  return next;
}

/**
 * Экспортирована ради `state/editorHistory.ts`: у него своя, парная забота
 * (проверить, что выделенный элемент пережил undo/redo), и ей нужен тот же
 * ответ на тот же вопрос — не свежая копия того же обращения к узлу.
 */
export function hasElement(project: Project, nodeId: string, id: string): boolean {
  return currentNode(project, nodeId).scene.elements.some((element) => element.id === id);
}

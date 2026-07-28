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
import type { Cue, Element, Gate, Project, TimeRef } from '@player/core';

export interface EditorState {
  readonly project: Project;
  /** Выделенный элемент. undefined — выделения нет. */
  readonly selectedId: string | undefined;
}

export type EditorAction =
  | { readonly type: 'select'; readonly id: string | undefined }
  | { readonly type: 'replaceElement'; readonly element: Element }
  | { readonly type: 'addCue'; readonly cue: Cue }
  | { readonly type: 'addGate'; readonly gate: Gate }
  | { readonly type: 'moveMark'; readonly kind: MarkKind; readonly id: string; readonly at: TimeRef }
  | { readonly type: 'removeMark'; readonly kind: MarkKind; readonly id: string };

/** Метки на дорожке бывают двух родов, и хранятся они в разных массивах. */
export type MarkKind = 'cue' | 'gate';

export function initialState(project: Project): EditorState {
  return { project, selectedId: undefined };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select': {
      if (state.selectedId === action.id) return state;
      if (action.id !== undefined && !hasElement(state.project, action.id)) {
        throw new Error(`Нельзя выделить элемент «${action.id}»: его нет в проекте`);
      }
      return { ...state, selectedId: action.id };
    }

    case 'replaceElement': {
      const elements = state.project.scene.elements;
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

    case 'addCue': {
      if (state.project.scene.cues.some((cue) => cue.id === action.cue.id)) {
        throw new Error(`Анимация «${action.cue.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      if (!hasElement(state.project, action.cue.targetId)) {
        // Схема это проверяет при загрузке, но узнать об этом при сохранении
        // на полчаса позже — значит потерять полчаса работы.
        throw new Error(`Анимация ссылается на элемент «${action.cue.targetId}», которого нет`);
      }
      return withScene(state, { cues: [...state.project.scene.cues, action.cue] });
    }

    case 'addGate': {
      if (state.project.scene.gates.some((gate) => gate.id === action.gate.id)) {
        throw new Error(`Гейт «${action.gate.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      return withScene(state, { gates: [...state.project.scene.gates, action.gate] });
    }

    case 'moveMark': {
      if (action.kind === 'cue') {
        const cues = replaceAt(state.project.scene.cues, action.id, (cue) => ({
          ...cue,
          at: action.at,
        }));
        return withScene(state, { cues });
      }
      const gates = replaceAt(state.project.scene.gates, action.id, (gate) => ({
        ...gate,
        at: action.at,
      }));
      return withScene(state, { gates });
    }

    case 'removeMark': {
      if (action.kind === 'cue') {
        const cues = state.project.scene.cues.filter((cue) => cue.id !== action.id);
        if (cues.length === state.project.scene.cues.length) {
          throw new Error(`Нечего удалять: анимации «${action.id}» нет`);
        }
        return withScene(state, { cues });
      }
      const gates = state.project.scene.gates.filter((gate) => gate.id !== action.id);
      if (gates.length === state.project.scene.gates.length) {
        throw new Error(`Нечего удалять: гейта «${action.id}» нет`);
      }
      return withScene(state, { gates });
    }
  }
}

/**
 * Собирает новое состояние с изменённой сценой.
 *
 * Неизменившиеся массивы остаются ТЕМИ ЖЕ по ссылке — на этом держится
 * решение StageView о том, пересобирать сцену или обновить один узел.
 */
function withScene(state: EditorState, patch: Partial<Project['scene']>): EditorState {
  return {
    ...state,
    project: { ...state.project, scene: { ...state.project.scene, ...patch } },
  };
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

function hasElement(project: Project, id: string): boolean {
  return project.scene.elements.some((element) => element.id === id);
}

/**
 * Свободный идентификатор вида «gate-3».
 *
 * Не случайный: одинаковый проект и одинаковые действия обязаны давать
 * одинаковый файл, иначе сравнить два сохранения глазами невозможно.
 */
export function freeId(prefix: string, taken: readonly { id: string }[]): string {
  const used = new Set(taken.map((item) => item.id));
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

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
import type { Element, Project } from '@player/core';

export interface EditorState {
  readonly project: Project;
  /** Выделенный элемент. undefined — выделения нет. */
  readonly selectedId: string | undefined;
}

export type EditorAction =
  | { readonly type: 'select'; readonly id: string | undefined }
  | { readonly type: 'replaceElement'; readonly element: Element };

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
      return {
        ...state,
        project: { ...state.project, scene: { ...state.project.scene, elements: next } },
      };
    }
  }
}

function hasElement(project: Project, id: string): boolean {
  return project.scene.elements.some((element) => element.id === id);
}

/**
 * @player/editor — Шина команд (Command Bus).
 *
 * Предоставляет интерфейс и обработку модульных команд над состоянием редактора.
 */
import type { EditorState, EditorAction } from '../state/project.js';

export interface CommandHandler<A extends EditorAction = EditorAction> {
  execute(state: EditorState, action: A): EditorState;
}

const commandRegistry = new Map<EditorAction['type'], CommandHandler<any>>();

/** Регистрация обработчика команды по её типу. */
export function registerCommandHandler<T extends EditorAction['type']>(
  type: T,
  handler: CommandHandler<Extract<EditorAction, { type: T }>>,
): void {
  commandRegistry.set(type, handler);
}

/** Выполнение команды через шину. */
export function dispatchCommand(state: EditorState, action: EditorAction): EditorState {
  const handler = commandRegistry.get(action.type);
  if (handler) {
    return handler.execute(state, action);
  }
  return state;
}

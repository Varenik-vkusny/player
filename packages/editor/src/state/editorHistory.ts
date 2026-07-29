/**
 * Отмена и повтор поверх `editorReducer` — чистая логика, без React и DOM.
 *
 * `state/history.ts` даёт кольцевой буфер снимков и больше ничего не решает
 * («что считать шагом — решает вызывающий код в редьюсере», сказано в его
 * же комментарии). Этот модуль — тот самый вызывающий код: он оборачивает
 * `editorReducer` (`state/project.ts`) историей `Project`, отвечая на три
 * требования сессии.
 *
 * **1. `select` в историю не пишется.**
 * Секция выделения (`selectedId`) вообще не входит в снимок — история хранит
 * `History<Project>`, а не `History<EditorState>`. `select` меняет только
 * `selectedId` в возвращаемом `HistoryState`, `history` при этом остаётся
 * тем же объектом по ссылке.
 *
 * **2. Жест = один шаг, коммит-точка явная.**
 * Перетаскивание элемента (`StageView`) и перетаскивание метки (`MarksLane`)
 * шлют десятки `replaceElement`/`moveMark` за один жест; набор числа
 * в `NumberField` шлёт по вызову на каждую распознанную цифру. Склеивать их
 * по признаку «подряд идущие правки одного элемента» отвергнуто заданием
 * сессии — это молча объединило бы две осознанные правки одного поля.
 *
 * Вместо угаданной коалесценции — явный флаг у действия. `replaceElement`
 * и `moveMark` несут необязательное поле `commit`: `commit: false` значит
 * «это ОДНО из событий уже идущего жеста», обычный вызов (поле отсутствует)
 * значит «это самостоятельный шаг». Жест раскрывается так:
 *
 * - первое событие жеста (`commit: false`, `gestureOpen` ещё false) кладёт
 *   в `past` состояние ДО жеста через настоящий `push` из history.ts —
 *   это и есть коммит-точка «начало»;
 * - каждое следующее событие того же жеста заменяет только верхушку
 *   (`present`), не трогая `past`/`future` — история не растёт;
 * - явное действие `{ type: 'commit' }` жест завершает. Оно ничего не
 *   меняет в данных (последнее событие уже записало финальное значение
 *   в `present`) — только снимает флаг «жест идёт», и тем самым следующее
 *   `commit: false`-событие начнёт УЖЕ НОВЫЙ жест собственным `push`, а не
 *   продолжит старый.
 *
 * Компоненты дают ровно эти два конца: `StageView` знает `pointerup`
 * (`onCommitHistory`), `MarksLane` — свой `pointerup`, `NumberField` уже
 * коммитит на blur через паттерн черновика — туда и вешается `commit`.
 * Действия без поля `commit` (клавиатурный сдвиг стрелками, любая правка вне
 * жеста) остаются самостоятельными шагами — по одному нажатию клавиши,
 * без скрытого объединения серии, тем же явным правилом.
 *
 * **3. Отмена не двигает время.**
 * Эта задача уже решена в `StageView`: эффект пересборки сцены запускается
 * при смене ссылки на `elements`, `cues`, `gates` или `words` — а отмена
 * ВСЕГДА меняет хотя бы одну из этих ссылок (иначе отменять было бы нечего,
 * `push`/`undo` не создают шаг на no-op). Эффект уже вызывает
 * `preview.seek(positionRef.current)` при пересборке — тем самым отмена
 * автоматически проходит через тот же путь, что чинил отмотку при добавлении
 * метки в прошлой сессии, без отдельного кода здесь. Единственное, что этот
 * модуль обязан сделать сам, — не трогать `positionSeconds` вообще (он им
 * не владеет) и не пересоздавать `Project` глубже, чем меняется настоящая
 * правка, чтобы ссылочная целостность (на которой держится решение
 * StageView, пересобирать сцену или нет) не пострадала при откате.
 *
 * Выделение элемента после отмены/повтора проверяется на существование:
 * если выделенного элемента в восстановленном проекте нет, выделение
 * снимается — само `select` в снимок не входит, но раз проект откатился,
 * старое значение `selectedId` может ссылаться в никуда.
 */
import type { Project } from '@player/core';

import { canRedo, canUndo, createHistory, push, redo, undo, type History } from './history.js';
import { editorReducer, hasElement, type EditorAction, type EditorState } from './project.js';

export type { History } from './history.js';

/** Отдельные действия истории — не про данные проекта, про саму историю. */
export type HistoryNavAction = { readonly type: 'undo' } | { readonly type: 'redo' };

/** `commit` без данных: сигнал «жест закончен», см. комментарий модуля. */
export type CommitAction = { readonly type: 'commit' };

export type HistoryEditorAction = EditorAction | HistoryNavAction | CommitAction;

export interface HistoryState {
  readonly history: History<Project>;
  readonly selectedId: string | undefined;
  /**
   * Узел, который автор сейчас правит — состояние вида, как и `selectedId`:
   * снимок истории его не несёт, а после undo/redo его чинит `afterNav`
   * так же, как чинит `selectedId`.
   */
  readonly currentNodeId: string;
  /**
   * Идёт ли сейчас жест (перетаскивание, набор в числовом поле). Часть
   * состояния, а не локальная переменная снаружи: редьюсер обязан быть
   * чистым и детерминированным, а флаг обязан пережить два последовательных
   * dispatch подряд.
   */
  readonly gestureOpen: boolean;
}

export function initialHistoryState(project: Project): HistoryState {
  return {
    history: createHistory(project),
    selectedId: undefined,
    currentNodeId: project.entry,
    gestureOpen: false,
  };
}

/** Действия, которые МОГУТ дробить один жест на десятки вызовов. */
function isLiveEvent(action: EditorAction): boolean {
  return (
    (action.type === 'replaceElement' || action.type === 'moveMark') &&
    (action as { commit?: boolean }).commit === false
  );
}

/**
 * Заменяет верхушку истории, не создавая новый шаг — используется для
 * промежуточных событий уже открытого жеста. `history.ts` такой функции
 * намеренно не экспортирует (она про то, что считать шагом, а это решает
 * вызывающий код, не сам модуль истории) — здесь минимальный локальный
 * аналог, собранный из полей интерфейса `History<T>`, а не копия его логики.
 */
function replacePresent(history: History<Project>, next: Project): History<Project> {
  if (next === history.present) return history;
  return { past: history.past, present: next, future: history.future };
}

/**
 * Общий хвост undo/redo: чинит текущий узел и выделение, закрывает случайно
 * оставшийся жест.
 *
 * Undo/redo может откатить сам факт существования текущего узла (например,
 * отменить `addNode`) — тогда `currentNodeId` возвращается на стартовый узел
 * проекта, как и предписано `removeNode` в редьюсере при удалении текущего
 * узла. Проверку «выжило ли выделение» делаем уже для ПОЧИНЕННОГО узла —
 * иначе можно было бы оставить выделение элемента из сцены узла, которого
 * в починенном currentNodeId уже нет.
 */
function afterNav(state: HistoryState, history: History<Project>): HistoryState {
  if (history === state.history) return state; // граница — undo()/redo() уже no-op по ссылке
  const nodeExists = history.present.nodes.some((node) => node.id === state.currentNodeId);
  const currentNodeId = nodeExists ? state.currentNodeId : history.present.entry;
  const selectedId =
    state.selectedId !== undefined && hasElement(history.present, currentNodeId, state.selectedId)
      ? state.selectedId
      : undefined;
  return { history, currentNodeId, selectedId, gestureOpen: false };
}

export function historyReducer(state: HistoryState, action: HistoryEditorAction): HistoryState {
  if (action.type === 'undo') return afterNav(state, undo(state.history));
  if (action.type === 'redo') return afterNav(state, redo(state.history));

  if (action.type === 'commit') {
    // Данные уже на месте — последнее живое событие жеста их записало.
    // Если жеста и не было (например, поле было в фокусе, но автор ничего
    // не менял и просто ушёл с него), это безопасный no-op.
    return state.gestureOpen ? { ...state, gestureOpen: false } : state;
  }

  // Дальше — обычный EditorAction. Прогоняем через уже проверенный
  // editorReducer, подставив ЖИВОЙ project (верхушку истории) и текущее
  // выделение — эта пара и есть EditorState, которым он оперирует.
  const before: EditorState = {
    project: state.history.present,
    selectedId: state.selectedId,
    currentNodeId: state.currentNodeId,
  };
  const after = editorReducer(before, action);

  if (action.type === 'select') {
    // Правило №1: select истории не касается вовсе, даже когда меняет
    // выделение. history остаётся тем же объектом по ссылке.
    return after.selectedId === state.selectedId ? state : { ...state, selectedId: after.selectedId };
  }

  if (action.type === 'selectNode') {
    // То же правило №1, только для переключения узла: это тоже вид,
    // а не данные. Без отдельной ветки generic-путь ниже (после этой)
    // сравнил бы after.project === before.project (верно, project не менялся)
    // и перенёс бы только selectedId — новый currentNodeId потерялся бы.
    return after.currentNodeId === state.currentNodeId && after.selectedId === state.selectedId
      ? state
      : { ...state, currentNodeId: after.currentNodeId, selectedId: after.selectedId };
  }

  if (after.project === before.project) {
    // editorReducer сам решил, что правки не было (например, replaceElement
    // тем же объектом). Выделение он всё равно мог поменять
    // (removeElement снимает его) — это переносим, шага истории не создаём.
    return after.selectedId === state.selectedId ? state : { ...state, selectedId: after.selectedId };
  }

  const live = isLiveEvent(action);
  const history =
    state.gestureOpen && live ? replacePresent(state.history, after.project) : push(state.history, after.project);

  // currentNodeId переносим из after: addNode/removeNode могли его сменить,
  // остальные действия оставляют тем же значением, что и before.
  return { history, selectedId: after.selectedId, currentNodeId: after.currentNodeId, gestureOpen: live };
}

/** Для кнопок «Отменить»/«Повторить» и для тестов — тонкие реэкспорты. */
export function canUndoState(state: HistoryState): boolean {
  return canUndo(state.history);
}

export function canRedoState(state: HistoryState): boolean {
  return canRedo(state.history);
}

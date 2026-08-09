/**
 * Отмена и повтор поверх `editorReducer` — чистая логика, без React и DOM.
 *
 * `state/history.ts` даёт кольцевой буфер снимков и больше ничего не решает
 * («что считать шагом — решает вызывающий код в редьюсере», сказано в его
 * же комментарии). Этот модуль — тот самый вызывающий код: он оборачивает
 * `editorReducer` (`state/project.ts`) историей `Project`, отвечая на три
 * требования сессии.
 *
 * **1. `select`/`selectSegment`/`selectSlide` в историю не пишутся.**
 * Секция вида (`selectedIds`, `currentSegmentId`, `currentSlideId`) вообще
 * не входит в снимок — история хранит `History<Project>`, а не
 * `History<EditorState>`. Переключения меняют только вид в возвращаемом
 * `HistoryState`, `history` при этом остаётся тем же объектом по ссылке.
 *
 * **2. Жест = один шаг, коммит-точка явная.**
 * Перетаскивание элемента (`StageView`) и перетаскивание метки (`MarksLane`)
 * шлют десятки `setElementState`/`moveMark` за один жест; набор числа
 * в `NumberField` шлёт по вызову на каждую распознанную цифру. Склеивать их
 * по признаку «подряд идущие правки одного элемента» отвергнуто заданием
 * сессии — это молча объединило бы две осознанные правки одного поля.
 *
 * Вместо угаданной коалесценции — явный флаг у действия. `replaceElement`,
 * `setElementState`, `moveMark` и `setSpeech` несут необязательное поле `commit`:
 * `commit: false` значит «это ОДНО из событий уже идущего жеста», обычный
 * вызов (поле отсутствует) значит «это самостоятельный шаг». Жест
 * раскрывается так:
 *
 * - первое событие жеста (`commit: false`, `gestureOpen` ещё false) кладёт
 *   в `past` состояние ДО жеста через настоящий `push` из history.ts —
 *   это и есть коммит-точка «начало»;
 * - каждое следующее событие того же жеста заменяет только верхушку
 *   (`present`), не трогая `past`/`future` — история не растёт;
 * - явное действие `{ type: 'commit' }` жест завершает.
 *
 * **3. Отмена не двигает время.**
 * Эта задача решена в StageView: эффект пересборки сцены запускается при
 * смене ссылки на `elements`/`slides`/`gates`/`words` текущего сегмента —
 * а отмена ВСЕГДА меняет хотя бы одну из этих ссылок (иначе отменять было бы
 * нечего, `push`/`undo` не создают шаг на no-op). Единственное, что этот
 * модуль обязан сделать сам, — не трогать `positionSeconds` вообще (он им
 * не владеет) и не пересоздавать `Project` глубже, чем меняется настоящая
 * правка, чтобы ссылочная целостность не пострадала при откате.
 *
 * Выделение элемента и текущий слайд после отмены/повтора проверяются на
 * существование: если выделенного элемента или текущего слайда
 * в восстановленном проекте нет, они чинятся так же, как чинил бы их
 * обычный редьюсер (снятие выделения, возврат на первый слайд сегмента).
 */
import type { Project, Segment } from '@player/core';

import { canRedo, canUndo, createHistory, push, redo, undo, type History } from './history.js';
import { editorReducer, hasElement, type EditorAction, type EditorState } from './project.js';
import type { RetargetReport } from './retarget.js';
import type { SlideClipboard } from './slides.js';

export type { History } from './history.js';

/** Отдельные действия истории — не про данные проекта, про саму историю. */
export type HistoryNavAction = { readonly type: 'undo' } | { readonly type: 'redo' };

/** `commit` без данных: сигнал «жест закончен», см. комментарий модуля. */
export type CommitAction = { readonly type: 'commit' };

export type HistoryEditorAction = EditorAction | HistoryNavAction | CommitAction;

export interface HistoryState {
  readonly history: History<Project>;
  readonly selectedIds: readonly string[];
  /**
   * Сегмент, который автор сейчас правит — состояние вида, как и
   * `selectedIds`: снимок истории его не несёт, а после undo/redo его чинит
   * `afterNav` так же, как чинит `selectedIds`.
   */
  readonly currentSegmentId: string;
  /** Слайд текущего сегмента — тоже вид, не данные. См. `currentSegmentId`. */
  readonly currentSlideId: string;
  /**
   * Идёт ли сейчас жест (перетаскивание, набор в числовом поле). Часть
   * состояния, а не локальная переменная снаружи: редьюсер обязан быть
   * чистым и детерминированным, а флаг обязан пережить два последовательных
   * dispatch подряд.
   */
  readonly gestureOpen: boolean;
  /**
   * Отчёт о последнем переносе меток (`replaceSegmentAudio` с расшифровкой,
   * `state/project.ts`) — сообщение автору о последнем действии, а не
   * свойство проекта, поэтому живёт здесь же, рядом с `selectedIds`
   * и `currentSlideId`, вне `History<Project>`. `undefined` — либо ничего ещё
   * не переносили, либо последняя замена была без расшифровки. Undo/redo
   * сбрасывает его в `undefined`: отчёт относится к правке, от которой автор
   * только что отошёл, и после навигации по истории он уже не про текущее
   * состояние.
   */
  readonly lastRetarget: RetargetReport | undefined;
  /**
   * Буфер обмена слайдов (ADR-025) — состояние вида, как и `selectedIds`
   * и `currentSlideId`: снимок истории его не несёт. Отличие от
   * `lastRetarget`: undo/redo НЕ сбрасывает его (см. `afterNav` ниже) —
   * буфер обязан пережить отмену, это предмет в руке автора, а не отчёт
   * о правке, от которой автор отошёл.
   */
  readonly slideClipboard: SlideClipboard | undefined;
}

function firstSlideId(segment: Segment): string {
  const first = segment.slides[0];
  if (!first) throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  return first.id;
}

function requireSegment(project: Project, segmentId: string): Segment {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) throw new Error(`Текущего сегмента «${segmentId}» нет в проекте`);
  return segment;
}

/**
 * Одинаковы ли два выделения.
 *
 * Нужно затем, чтобы undo/redo не возвращал НОВЫЙ объект состояния там, где
 * выделение не изменилось: сцена в браузере обновляется точечно и решает,
 * что перерисовывать, сравнением ссылок (см. шапку `state/project.ts`).
 * До перехода на список здесь стояло обычное `===` двух строк, и оно
 * молча перестало бы работать на массивах — сравнивало бы ссылки,
 * а не содержимое, и давало бы «изменилось» на каждом шаге.
 *
 * Порядок значим: `[a, b]` и `[b, a]` — разные выделения, потому что
 * порядок выделения сохраняется намеренно.
 */
function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function initialHistoryState(project: Project): HistoryState {
  return {
    history: createHistory(project),
    selectedIds: [],
    currentSegmentId: project.entry,
    currentSlideId: firstSlideId(requireSegment(project, project.entry)),
    gestureOpen: false,
    lastRetarget: undefined,
    slideClipboard: undefined,
  };
}

/** Действия, которые МОГУТ дробить один жест на десятки вызовов. */
function isLiveEvent(action: EditorAction): boolean {
  return (
    (action.type === 'replaceElement'
      || action.type === 'setElementState'
      || action.type === 'moveMark'
      // Набор текста озвучки (AudioSourcePanel) — тот же приём, что и у
      // числовых полей Inspector.tsx: каждая буква шлёт `commit: false`,
      // коммит-точку ставит потеря фокуса поля через явное действие `commit`.
      || action.type === 'setSpeech'
      // Ползунок продолжительности перехода (`MarkPanel.tsx`, `RangeField`) —
      // тот же приём: движение шлёт `commit: false`, `pointerup`/`onBlur`
      // ползунка закрывают жест явным `commit`.
      || action.type === 'setSlideTransitionSeconds'
      // Правка роли темы (`ThemePanel.tsx`) — тот же приём: пипетка цвета
      // шлёт `commit: false` на каждое движение, потеря фокуса поля
      // закрывает жест явным `commit` (docs/design/theme-panel.md §4).
      || action.type === 'setThemeRole')
    && (action as { commit?: boolean }).commit === false
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
 * Общий хвост undo/redo: чинит текущий сегмент, текущий слайд и выделение,
 * закрывает случайно оставшийся жест.
 *
 * Undo/redo может откатить сам факт существования текущего сегмента
 * (например, отменить `addSegment`) — тогда `currentSegmentId` возвращается
 * на стартовый сегмент проекта, как и предписано `removeSegment` в редьюсере
 * при удалении текущего сегмента. Слайд чинится тем же способом на уровне
 * ниже: если `currentSlideId` не находится среди слайдов ПОЧИНЕННОГО
 * сегмента, он возвращается на первый слайд этого сегмента.
 */
function afterNav(state: HistoryState, history: History<Project>): HistoryState {
  if (history === state.history) return state; // граница — undo()/redo() уже no-op по ссылке

  const segmentExists = history.present.segments.some((segment) => segment.id === state.currentSegmentId);
  const segment = segmentExists
    ? requireSegment(history.present, state.currentSegmentId)
    : requireSegment(history.present, history.present.entry);
  const currentSegmentId = segment.id;

  const slideExists = segment.slides.some((slide) => slide.id === state.currentSlideId);
  const currentSlideId = slideExists ? state.currentSlideId : firstSlideId(segment);

  // Выделение ФИЛЬТРУЕТСЯ, а не сбрасывается целиком: undo мог убрать один
  // элемент из трёх выделенных, и снимать выделение с уцелевших двух незачем.
  const selectedIds = state.selectedIds.filter(
    (id) => hasElement(history.present, currentSegmentId, id),
  );

  // Отчёт о переносе меток сбрасывается: он про правку, от которой автор
  // только что отошёл undo/redo, а не про текущее восстановленное состояние.
  //
  // Буфер слайдов — НЕ сбрасывается, и это осознанное отличие от строки выше.
  // ADR-025, «Последствия»: отчёт о переносе относится к правке, от которой
  // автор отошёл; буфер — предмет в руке. Потерять его при Ctrl+Z значило бы
  // наказывать автора за отмену — он вырезал слайд, отменил другую правку,
  // и вставить вырезанное обязан всё ещё мочь.
  return {
    history,
    currentSegmentId,
    currentSlideId,
    selectedIds,
    gestureOpen: false,
    lastRetarget: undefined,
    slideClipboard: state.slideClipboard,
  };
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
  // editorReducer, подставив ЖИВОЙ project (верхушку истории) и текущий вид —
  // эта тройка и есть EditorState, которым он оперирует.
  const before: EditorState = {
    project: state.history.present,
    selectedIds: state.selectedIds,
    currentSegmentId: state.currentSegmentId,
    currentSlideId: state.currentSlideId,
    lastRetarget: state.lastRetarget,
    slideClipboard: state.slideClipboard,
  };
  const after = editorReducer(before, action);

  if (action.type === 'select' || action.type === 'selectMany') {
    // Правило №1: select истории не касается вовсе, даже когда меняет
    // выделение. history остаётся тем же объектом по ссылке.
    //
    // `selectMany` (резиновая рамка) — то же самое и по той же причине.
    // Отдельной ветки он не требует: generic-путь ниже увидел бы, что
    // project не изменился, и перенёс бы только `selectedIds`. Назван здесь
    // явно, чтобы правило читалось целиком в одном месте, а не собиралось
    // из «а этот, значит, попадает в общий случай».
    return sameIds(after.selectedIds, state.selectedIds) ? state : { ...state, selectedIds: after.selectedIds };
  }

  if (action.type === 'selectSegment' || action.type === 'selectSlide') {
    // То же правило №1, только для переключения вида: это тоже вид,
    // а не данные. Без отдельной ветки generic-путь ниже (после этой)
    // сравнил бы after.project === before.project (верно, project
    // не менялся) и перенёс бы только selectedIds — смена сегмента/слайда
    // потерялась бы.
    const unchanged =
      after.currentSegmentId === state.currentSegmentId &&
      after.currentSlideId === state.currentSlideId &&
      sameIds(after.selectedIds, state.selectedIds);
    return unchanged
      ? state
      : {
          ...state,
          currentSegmentId: after.currentSegmentId,
          currentSlideId: after.currentSlideId,
          selectedIds: after.selectedIds,
        };
  }

  if (action.type === 'copySlide') {
    // То же правило №1, только для буфера обмена: copySlide — тоже вид,
    // а не данные, и project он НЕ трогает вовсе (ADR-025). Без отдельной
    // ветки ниже сработал бы generic-путь `after.project === before.project`
    // (следующая ветка) — он переносит только selectedIds, а slideClipboard
    // остался бы лежать в `after` и потерялся молча: автор нажал бы
    // «Копировать», история осталась бы прежней, ошибки нигде бы не было,
    // но и буфер до HistoryState не долетел бы.
    return after.slideClipboard === state.slideClipboard
      ? state
      : { ...state, slideClipboard: after.slideClipboard };
  }

  if (after.project === before.project) {
    // editorReducer сам решил, что правки не было (например, replaceElement
    // тем же объектом). Выделение он всё равно мог поменять
    // (removeElement снимает его) — это переносим, шага истории не создаём.
    return sameIds(after.selectedIds, state.selectedIds) ? state : { ...state, selectedIds: after.selectedIds };
  }

  const live = isLiveEvent(action);
  const history =
    state.gestureOpen && live ? replacePresent(state.history, after.project) : push(state.history, after.project);

  // currentSegmentId/currentSlideId переносим из after: addSegment/
  // removeSegment/addSlide/removeSlide могли их сменить, остальные действия
  // оставляют теми же значениями, что и before.
  return {
    history,
    selectedIds: after.selectedIds,
    currentSegmentId: after.currentSegmentId,
    currentSlideId: after.currentSlideId,
    gestureOpen: live,
    lastRetarget: after.lastRetarget,
    // cutSlide И меняет проект, И наполняет буфер за один вызов editorReducer
    // — без этого поля здесь буфер попал бы в `after`, но потерялся бы
    // именно тут, на общем возврате (та же ловушка, что и в ветке copySlide
    // выше, только для действия, которое ушло дальше generic-пути).
    slideClipboard: after.slideClipboard,
  };
}

/** Для кнопок «Отменить»/«Повторить» и для тестов — тонкие реэкспорты. */
export function canUndoState(state: HistoryState): boolean {
  return canUndo(state.history);
}

export function canRedoState(state: HistoryState): boolean {
  return canRedo(state.history);
}

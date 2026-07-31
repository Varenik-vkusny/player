/**
 * Состояние редактора и единственный способ его менять.
 *
 * Пара к `findSegment`/`nextSegment` из плеера (`@player/core`): те —
 * единственное место, где проект читают на воспроизведении, этот —
 * единственное, где его пишут в редакторе. Когда схема снова изменится,
 * поменяется ровно эта дверца, а не весь редактор (см. CLAUDE.md:
 * «нельзя размазывать доступ к project.audio и project.scene по коду»).
 *
 * Ссылочная целостность здесь не педантизм, а требование: сцена в браузере
 * обновляется точечно, и StageView определяет, что именно изменилось,
 * сравнением ссылок. Если редьюсер начнёт пересоздавать неизменившиеся
 * сегменты/слайды, сцена будет пересобираться целиком на каждое движение мыши.
 */
import type { Condition, Element, ElementState, Gate, Project, Segment, Slide, TimeRef } from '@player/core';

import { removeElement as removeElementFromSegment } from './elements.js';
import * as exits from './exits.js';
import * as slidesApi from './slides.js';
import { splitSegmentAtGate } from './split.js';
import { applyTemplate as applyTemplateToSegment, type SceneTemplate } from './templates.js';

/**
 * `freeId` живёт в `elements.ts` — это модуль про элементы, а не про весь
 * проект. Реэкспорт здесь нужен ради обратной совместимости: редактор
 * (`Editor.tsx`) уже импортирует `freeId` из этого файла.
 */
export { freeId } from './elements.js';

export interface EditorState {
  readonly project: Project;
  /** Выделенный элемент. undefined — выделения нет. */
  readonly selectedId: string | undefined;
  /**
   * Сегмент, который автор сейчас правит. Не в истории: это вид, а не
   * данные, как и `selectedId` — переключение сегмента само по себе ничего
   * в проекте не меняет.
   */
  readonly currentSegmentId: string;
  /**
   * Слайд текущего сегмента, который сейчас показан в редакторе. Правки
   * геометрии/стиля элемента (`setElementState`) идут именно в него —
   * слайд, а не сегмент и не элемент, знает «где» и «как выглядит».
   */
  readonly currentSlideId: string;
}

/** Метки на дорожке, которые двигаются перетаскиванием: гейт или слайд. */
export type MarkKind = 'gate' | 'slide';

export type EditorAction =
  | { readonly type: 'select'; readonly id: string | undefined }
  // `commit` — не про то, ЧТО меняется, а про то, стал ли этот вызов
  // отдельным шагом истории. Отсутствие (undefined) значит «да, как обычно»;
  // `commit: false` — сигнал редьюсеру истории (`state/editorHistory.ts`),
  // что это ОДНО из многих событий одного жеста (перетаскивание, набор
  // в числовом поле) и его нельзя класть в историю отдельным шагом.
  | { readonly type: 'replaceElement'; readonly element: Element; readonly commit?: boolean }
  | { readonly type: 'addElement'; readonly element: Element; readonly state: ElementState }
  | { readonly type: 'removeElement'; readonly id: string }
  | {
      readonly type: 'setElementState';
      readonly elementId: string;
      readonly patch: Partial<ElementState>;
      readonly commit?: boolean;
    }
  | { readonly type: 'addSlide'; readonly afterSlideId: string; readonly at: TimeRef }
  | { readonly type: 'removeSlide'; readonly slideId: string }
  | {
      readonly type: 'setSlideTransition';
      readonly slideId: string;
      readonly transition: Slide['transition'];
    }
  | { readonly type: 'selectSlide'; readonly id: string }
  | { readonly type: 'addGate'; readonly gate: Gate }
  | { readonly type: 'updateGate'; readonly gate: Gate }
  | {
      readonly type: 'moveMark';
      readonly kind: MarkKind;
      readonly id: string;
      readonly at: TimeRef;
      readonly commit?: boolean;
    }
  | { readonly type: 'removeMark'; readonly kind: 'gate'; readonly id: string }
  // Один шаг истории на кнопку: шаблон правит elements, слайды и gates разом,
  // и это обязано остаться одной правкой (см. state/templates.ts), а не
  // отдельными addElement/addSlide/addGate, которые historyReducer положил
  // бы в историю по одному.
  | { readonly type: 'applyTemplate'; readonly template: SceneTemplate }
  | { readonly type: 'addSegment' }
  | { readonly type: 'removeSegment'; readonly id: string }
  | { readonly type: 'renameSegment'; readonly id: string; readonly title: string }
  | { readonly type: 'renameVariable'; readonly gateId: string; readonly name: string }
  | { readonly type: 'selectSegment'; readonly id: string }
  | { readonly type: 'connect'; readonly when: readonly Condition[]; readonly goto: string }
  | { readonly type: 'addCondition'; readonly ruleId: string; readonly condition: Condition }
  | { readonly type: 'removeCondition'; readonly ruleId: string; readonly index: number }
  | { readonly type: 'disconnect'; readonly ruleId: string }
  // Объявление остановки развилкой. Один шаг истории на весь разрез: он правит
  // текущую часть и рождает несколько новых, и разложить это на addSegment +
  // connect + правку гейта значило бы отдать автору полуразрезанное состояние
  // на каждом промежуточном Ctrl+Z.
  | { readonly type: 'splitAtGate'; readonly gateId: string };

export function initialState(project: Project): EditorState {
  const segment = requireSegment(project, project.entry);
  return {
    project,
    selectedId: undefined,
    currentSegmentId: project.entry,
    currentSlideId: requireFirstSlide(segment).id,
  };
}

function requireFirstSlide(segment: Segment): Slide {
  const first = segment.slides[0];
  if (!first) throw new Error(`В сегменте «${segment.id}» нет ни одного слайда`);
  return first;
}

/**
 * Сегмент, который сейчас правит редьюсер.
 *
 * Раньше сюда попадали только в обход loadProject (схема гарантирует
 * стартовый сегмент при загрузке). Теперь есть и второй путь:
 * `currentSegmentId` рассинхронизировался с проектом — например, состояние
 * собрано в обход editorReducer/historyReducer.
 */
function requireSegment(project: Project, segmentId: string): Segment {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Текущего сегмента «${segmentId}» нет в проекте`);
  }
  return segment;
}

/**
 * Слайд сегмента по id — бросает, если слайда нет.
 *
 * По (project, segmentId, slideId), а не только по (segment, slideId):
 * это узкая дверца к проекту, и остальной редактор обязан спрашивать слайд
 * через неё, а не искать его в `project.segments` напрямую.
 */
export function segmentSlide(project: Project, segmentId: string, slideId: string): Slide {
  const segment = requireSegment(project, segmentId);
  const slide = segment.slides.find((candidate) => candidate.id === slideId);
  if (!slide) {
    throw new Error(`Слайда «${slideId}» нет в сегменте «${segmentId}»`);
  }
  return slide;
}

/**
 * Экспортирована ради `state/editorHistory.ts`: у него своя, парная забота
 * (проверить, что выделенный элемент пережил undo/redo), и ей нужен тот же
 * ответ на тот же вопрос — не свежая копия того же обращения к сегменту.
 */
export function hasElement(project: Project, segmentId: string, id: string): boolean {
  return requireSegment(project, segmentId).elements.some((element) => element.id === id);
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'select': {
      if (state.selectedId === action.id) return state;
      if (action.id !== undefined && !hasElement(state.project, state.currentSegmentId, action.id)) {
        throw new Error(`Нельзя выделить элемент «${action.id}»: его нет в проекте`);
      }
      return { ...state, selectedId: action.id };
    }

    case 'replaceElement': {
      const elements = currentSegment(state).elements;
      const index = elements.findIndex((element) => element.id === action.element.id);
      if (index < 0) {
        throw new Error(`Нельзя заменить элемент «${action.element.id}»: его нет в проекте`);
      }
      if (elements[index] === action.element) return state;

      const next = elements.slice();
      next[index] = action.element;
      return replaceSegment(state, { ...currentSegment(state), elements: next });
    }

    case 'addElement': {
      const segment = currentSegment(state);
      if (segment.elements.some((element) => element.id === action.element.id)) {
        throw new Error(`Элемент «${action.element.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      const slides = segment.slides.map((slide) =>
        slide.id === state.currentSlideId
          ? { ...slide, states: { ...slide.states, [action.element.id]: action.state } }
          : slide,
      );
      const next = replaceSegment(state, {
        ...segment,
        elements: [...segment.elements, action.element],
        slides,
      });
      // Новый элемент сразу выделен: автор только что его создал и,
      // скорее всего, тут же начнёт править — незачем кликать по нему заново.
      return { ...next, selectedId: action.element.id };
    }

    case 'removeElement': {
      const nextSegment = removeElementFromSegment(currentSegment(state), action.id);
      const next = replaceSegment(state, nextSegment);
      if (state.selectedId !== action.id) return next;
      // Удалили то, что было выделено, — выделять больше нечего.
      return { ...next, selectedId: undefined };
    }

    case 'setElementState': {
      if (!hasElement(state.project, state.currentSegmentId, action.elementId)) {
        throw new Error(`Нельзя поменять состояние элемента «${action.elementId}»: его нет в проекте`);
      }
      const nextSegment = slidesApi.setElementState(
        currentSegment(state),
        state.currentSlideId,
        action.elementId,
        action.patch,
      );
      return replaceSegment(state, nextSegment);
    }

    case 'addSlide': {
      const before = currentSegment(state);
      const nextSegment = slidesApi.addSlide(before, action.afterSlideId, action.at);
      const created = nextSegment.slides.find(
        (slide) => !before.slides.some((old) => old.id === slide.id),
      )!;
      // Новый слайд сразу становится текущим — автор только что его вставил
      // и продолжит наполнять его, а не прежний.
      return { ...replaceSegment(state, nextSegment), currentSlideId: created.id };
    }

    case 'removeSlide': {
      const nextSegment = slidesApi.removeSlide(currentSegment(state), action.slideId);
      const next = replaceSegment(state, nextSegment);
      if (state.currentSlideId !== action.slideId) return next;
      // Текущий слайд удалён из-под автора — возвращаемся на первый слайд сегмента.
      return { ...next, currentSlideId: requireFirstSlide(nextSegment).id };
    }

    case 'setSlideTransition': {
      const nextSegment = slidesApi.setTransition(currentSegment(state), action.slideId, action.transition);
      return replaceSegment(state, nextSegment);
    }

    case 'selectSlide': {
      if (action.id === state.currentSlideId) return state;
      segmentSlide(state.project, state.currentSegmentId, action.id); // бросает, если слайда нет
      return { ...state, currentSlideId: action.id };
    }

    case 'addGate': {
      const segment = currentSegment(state);
      if (segment.gates.some((gate) => gate.id === action.gate.id)) {
        throw new Error(`Гейт «${action.gate.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      return replaceSegment(state, { ...segment, gates: [...segment.gates, action.gate] });
    }

    case 'updateGate': {
      // Панель выделенной метки собирает новый Gate через чистые функции
      // state/gates.ts и присылает готовый объект — редьюсер лишь кладёт
      // его на место по id, как replaceElement для элементов.
      const segment = currentSegment(state);
      const gates = segment.gates;
      const index = gates.findIndex((gate) => gate.id === action.gate.id);
      if (index < 0) {
        throw new Error(`Нельзя обновить гейт «${action.gate.id}»: его нет в проекте`);
      }
      if (gates[index] === action.gate) return state;
      const next = gates.slice();
      next[index] = action.gate;
      return replaceSegment(state, { ...segment, gates: next });
    }

    case 'moveMark': {
      const segment = currentSegment(state);
      if (action.kind === 'gate') {
        const gates = replaceAt(segment.gates, action.id, (gate) => ({ ...gate, at: action.at }));
        return replaceSegment(state, { ...segment, gates });
      }
      // kind === 'slide'
      if (segment.slides[0]?.id === action.id) {
        throw new Error('Нельзя сдвинуть первый слайд: он обязан стоять на нуле — это стартовый вид сегмента');
      }
      const slides = replaceAt(segment.slides, action.id, (slide) => ({ ...slide, at: action.at }));
      return replaceSegment(state, { ...segment, slides });
    }

    case 'removeMark': {
      // kind === 'gate' — удаление слайда идёт отдельным действием
      // (removeSlide), у него своя проверка «нельзя остаться без слайдов».
      const segment = currentSegment(state);
      const gates = segment.gates.filter((gate) => gate.id !== action.id);
      if (gates.length === segment.gates.length) {
        throw new Error(`Нечего удалять: гейта «${action.id}» нет`);
      }
      return replaceSegment(state, { ...segment, gates });
    }

    case 'applyTemplate': {
      // Размер сцены — из meta проекта, той же величины, которой уже
      // пользуется плеер, а не из состояния вида.
      const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
      const nextSegment = applyTemplateToSegment(action.template, currentSegment(state), stage);
      return replaceSegment(state, nextSegment);
    }

    case 'addSegment': {
      // Дорожку новый сегмент копирует у текущего: своей автор пока
      // загрузить не может (см. state/exits.ts). Сразу становится текущим —
      // иначе автор создал бы сегмент и продолжил бы править прежний.
      const { project, segment } = exits.addSegment(state.project, state.currentSegmentId);
      return {
        ...state,
        project,
        currentSegmentId: segment.id,
        currentSlideId: requireFirstSlide(segment).id,
        selectedId: undefined,
      };
    }

    case 'removeSegment': {
      const project = exits.removeSegment(state.project, action.id);
      if (action.id !== state.currentSegmentId) return { ...state, project };
      // Текущий сегмент удалён из-под автора — возвращаемся на стартовый.
      const entry = requireSegment(project, project.entry);
      return {
        ...state,
        project,
        currentSegmentId: project.entry,
        currentSlideId: requireFirstSlide(entry).id,
        selectedId: undefined,
      };
    }

    case 'renameSegment': {
      const project = exits.renameSegment(state.project, action.id, action.title);
      return project === state.project ? state : { ...state, project };
    }

    case 'renameVariable': {
      // Правит ВЕСЬ проект, а не текущий сегмент: правило выхода, смотрящее
      // на эту переменную, вправе лежать в любом другом сегменте.
      const project = exits.renameVariable(state.project, action.gateId, action.name);
      return project === state.project ? state : { ...state, project };
    }

    case 'selectSegment': {
      if (action.id === state.currentSegmentId) return state;
      const segment = state.project.segments.find((candidate) => candidate.id === action.id);
      if (!segment) {
        throw new Error(`Нельзя переключиться на сегмент «${action.id}»: его нет в проекте`);
      }
      // Выделенный элемент и текущий слайд принадлежали прежнему сегменту.
      return {
        ...state,
        currentSegmentId: action.id,
        currentSlideId: requireFirstSlide(segment).id,
        selectedId: undefined,
      };
    }

    case 'connect': {
      const project = exits.connect(state.project, state.currentSegmentId, action.when, action.goto);
      return { ...state, project };
    }

    case 'disconnect': {
      const project = exits.disconnect(state.project, state.currentSegmentId, action.ruleId);
      return { ...state, project };
    }

    case 'addCondition': {
      const project = exits.addCondition(
        state.project,
        state.currentSegmentId,
        action.ruleId,
        action.condition,
      );
      return { ...state, project };
    }

    case 'removeCondition': {
      const project = exits.removeCondition(
        state.project,
        state.currentSegmentId,
        action.ruleId,
        action.index,
      );
      return { ...state, project };
    }

    case 'splitAtGate': {
      const project = splitAtGate(state.project, state.currentSegmentId, action.gateId);
      const head = requireSegment(project, state.currentSegmentId);
      // Автор остаётся там, где нажал: он объявлял развилку в этой части,
      // а не просил перевести себя в новую. Слайд и выделение сбрасываются
      // не для порядка — то, что было выделено, могло уехать в продолжение.
      return {
        ...state,
        project,
        currentSlideId: requireFirstSlide(head).id,
        selectedId: undefined,
      };
    }
  }
}

/**
 * Разрезает часть по остановке: остановка становится развилкой, повествование
 * после неё уезжает в продолжение, каждый вариант ответа получает свою часть.
 *
 * Живёт здесь, а не в `split.ts`, по той же причине, что и весь этот файл:
 * собрать новый состав частей — работа стороны записи. `split.ts` знает, как
 * поделить ОДНУ часть, и намеренно не видит проекта целиком.
 *
 * Набор веток не передаётся аргументом, хотя так было бы гибче: варианты
 * ответа уже записаны в самой остановке, и второй их список можно было бы
 * рассинхронизировать с первым — а схема запрещает правилу выхода ссылаться
 * на вариант, которого у гейта нет («Эта ветка недостижима навсегда»).
 */
export function splitAtGate(project: Project, segmentId: string, gateId: string): Project {
  const segment = requireSegment(project, segmentId);
  const { head, branches, tail } = splitSegmentAtGate(segment, gateId, project.segments);

  const created: Segment[] = tail ? [...branches, tail] : [...branches];
  const segments = project.segments.flatMap((candidate) =>
    (candidate.id === head.id ? [head, ...created] : [candidate]));

  return { ...project, segments };
}

function currentSegment(state: EditorState): Segment {
  return requireSegment(state.project, state.currentSegmentId);
}

/**
 * Собирает новое состояние с изменённым текущим сегментом.
 *
 * Неизменившиеся сегменты остаются ТЕМИ ЖЕ по ссылке — на этом держится
 * решение StageView, пересобирать сцену или обновить один элемент.
 * Тот же сегмент по ссылке (правки не было) — состояние возвращается
 * тем же по ссылке целиком.
 */
function replaceSegment(state: EditorState, next: Segment): EditorState {
  if (next === currentSegment(state)) return state;
  const segments = state.project.segments.map((candidate) => (candidate.id === next.id ? next : candidate));
  return { ...state, project: { ...state.project, segments } };
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

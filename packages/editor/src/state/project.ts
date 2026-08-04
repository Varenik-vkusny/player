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
import type { Condition, Element, ElementState, Gate, Project, Segment, Slide, TimeRef, Word } from '@player/core';
import { findSegment, resolveTimeRef } from '@player/core';

import { retargetMark } from '../track/marks.js';
import { copySegment } from './duplicate.js';
import { removeElement as removeElementFromSegment } from './elements.js';
import * as exits from './exits.js';
import { retargetByAlignment, type RetargetReport } from './retarget.js';
import * as slidesApi from './slides.js';
import type { SlideClipboard } from './slides.js';
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
  /**
   * Отчёт о последнем переносе меток (`replaceSegmentAudio` с расшифровкой) —
   * сообщение автору, а не свойство проекта, поэтому живёт рядом с `selectedId`
   * и `currentSlideId`, а не внутри `project`/истории отмены. `undefined` —
   * либо ничего ещё не переносили, либо последняя замена была без расшифровки
   * (путь «без расшифровки» законен и отчёта не производит).
   */
  readonly lastRetarget: RetargetReport | undefined;
  /**
   * Буфер обмена слайдов (ADR-025: «слайд переносит состояние, а не
   * момент»). Состояние ВИДА, а не данные проекта — живёт рядом
   * с `selectedId`/`lastRetarget`, вне истории отмены. Отличие от
   * `lastRetarget`, который undo/redo сбрасывает: буфер отмену обязан
   * ПЕРЕЖИТЬ — это предмет в руке автора, а не отчёт о правке, от которой
   * он отошёл. `undefined` — буфер пуст, ничего не скопировано и не вырезано.
   */
  readonly slideClipboard: SlideClipboard | undefined;
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
  // `at` — где стоит головка дорожки. Правка сцены ложится в слайд под
  // головкой, а если метки там нет, слайд рождается (planning.md §14.9,
  // вариант (а) владельца). Поле обязательное намеренно: правки «вне
  // времени» не бывает, а необязательное поле дало бы тихий путь мимо
  // рождения — ровно тот дефект, который §14.9 и закрывает.
  | {
      readonly type: 'addElement';
      readonly element: Element;
      readonly state: ElementState;
      readonly at: TimeRef;
    }
  | { readonly type: 'removeElement'; readonly id: string }
  | {
      readonly type: 'setElementState';
      readonly elementId: string;
      readonly patch: Partial<ElementState>;
      readonly at: TimeRef;
      readonly commit?: boolean;
    }
  /**
   * Поместить существующий элемент на ТЕКУЩИЙ слайд и убрать с него (§12.4).
   *
   * Секунда не передаётся, в отличие от `setElementState`: там правка может
   * родить слайд на голом месте дорожки, а здесь речь о слайде, который автор
   * уже выбрал и видит. Родить слайд этим действием нельзя — «появись вот
   * здесь» относится к существующему кадру.
   */
  | { readonly type: 'putElementOnSlide'; readonly elementId: string }
  | { readonly type: 'removeElementFromSlide'; readonly elementId: string }
  | { readonly type: 'addSlide'; readonly afterSlideId: string; readonly at: TimeRef }
  | { readonly type: 'removeSlide'; readonly slideId: string }
  | {
      readonly type: 'setSlideTransition';
      readonly slideId: string;
      readonly transition: Slide['transition'];
    }
  | { readonly type: 'selectSlide'; readonly id: string }
  // Буфер обмена слайдов (ADR-025). `at` приходит СНАРУЖИ, как и у addSlide —
  // это положение головки дорожки, редьюсер timeRefAt сам не зовёт.
  | { readonly type: 'copySlide'; readonly slideId: string }
  | { readonly type: 'cutSlide'; readonly slideId: string }
  | { readonly type: 'pasteSlide'; readonly at: TimeRef }
  | { readonly type: 'duplicateSlide'; readonly slideId: string; readonly at: TimeRef }
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
  // Жёсткая копия куска (product.md §7, механика «копия блока» — не путать
  // с «повтором своего раздела», ребром назад по графу, и со «ссылкой
  // на общий блок», отложенной [П]). Вся логика — в duplicate.ts: несущее
  // ограничение там же (схема запрещает двум остановкам писать в одну
  // переменную по всему проекту, поэтому копия остановки получает своё имя).
  | { readonly type: 'duplicateSegment'; readonly segmentId: string }
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
  | { readonly type: 'splitAtGate'; readonly gateId: string }
  // Автор загрузил свой файл озвучки и подтвердил замену (см. state/audio.ts:
  // wordMarkCount/replaceAudioConfirmMessage — подтверждение строит вызывающий
  // ДО отправки этого действия). fileId уже лежит в хранилище плеера
  // (putAudio), duration — из декодера, а не из File и не из схемы.
  // `words` необязателен: есть расшифровка НОВОЙ озвучки — метки переезжают
  // на свои слова сопоставлением (`retargetByAlignment`); нет — законный
  // путь «кусок без расшифровки», прежнее поведение (метки в секунды). Оба
  // случая ложатся ОДНИМ шагом истории: расшифровка приходит вместе с заменой,
  // а не следующим действием, потому что старые слова, нужные для
  // сопоставления, доступны только ДО замены — между двумя действиями их
  // уже не было бы.
  | {
      readonly type: 'replaceSegmentAudio';
      readonly fileId: string;
      readonly duration: number;
      readonly words?: readonly Word[];
    }
  // Расшифровка вернула слова — кладём их как есть, без поправки таймингов
  // (S5: медиана расхождения +30 мс, вычитание «систематической» поправки
  // делает хуже). Не трогает метки: они остаются там, где стояли раньше,
  // и автор перепривязывает их к слову вручную через MarkPanel, если хочет.
  | { readonly type: 'setSegmentWords'; readonly words: readonly Word[] }
  // Текст озвучки куска — что автор произносит, а не что услышала машина
  // (это `audio.words`, отдельное поле). `commit: false` — та же семантика
  // набора, что и у `setElementState`/`moveMark`: textarea шлёт это на КАЖДУЮ
  // распознанную правку, и без флага набор строки создавал бы шаг истории
  // на каждую букву (см. `editorHistory.ts: isLiveEvent`).
  | { readonly type: 'setSpeech'; readonly text: string; readonly commit?: boolean };

export function initialState(project: Project): EditorState {
  const segment = requireSegment(project, project.entry);
  return {
    project,
    selectedId: undefined,
    currentSegmentId: project.entry,
    currentSlideId: requireFirstSlide(segment).id,
    lastRetarget: undefined,
    slideClipboard: undefined,
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
 * Почему вставку слайда в `at` сделать нельзя. `undefined` — можно.
 *
 * Узкая дверца между `pasteProblem` (`state/slides.ts`) и `Editor.tsx`.
 * `pasteProblem` ждёт МОДЕЛЬ сегмента (`segment.audio.words`,
 * `segment.audio.duration`), а `Editor.tsx` для дорожки и элементов держит
 * `segmentOf(...)` — ВИД плеера, где поля названы иначе (`segment.words`,
 * `segment.duration`, без вложенного `audio`). Это разные двери, и звать
 * `pasteProblem` из `Editor.tsx` напрямую нечем — подставить не тот вид
 * пришлось бы вручную и молча.
 *
 * `findSegment` ядра, а не `segmentOf` плеера — тот же довод, что
 * у `uncoveredOutcomes` (`state/exits.ts`): здесь нужна МОДЕЛЬ, а не готовый
 * к проигрыванию вид с построенным источником звука.
 *
 * Сигнатура `(project, segmentId, at)`, а не `(segment, at)`, — намеренно:
 * если бы функция принимала сегмент, вызвать её можно было бы и с видом
 * `segmentOf`, и с моделью `findSegment`, и оба вызова скомпилировались бы
 * (поля `words`/`duration` совпадают по имени с `Segment` плеера случайно).
 * Приняв `(project, segmentId)`, дверцу сузили до одного способа спросить.
 */
export function pasteProblemAt(project: Project, segmentId: string, at: TimeRef): string | undefined {
  const segment = findSegment(project, segmentId);
  return slidesApi.pasteProblem(segment, at);
}

/**
 * Экспортирована ради `state/editorHistory.ts`: у него своя, парная забота
 * (проверить, что выделенный элемент пережил undo/redo), и ей нужен тот же
 * ответ на тот же вопрос — не свежая копия того же обращения к сегменту.
 */
export function hasElement(project: Project, segmentId: string, id: string): boolean {
  return requireSegment(project, segmentId).elements.some((element) => element.id === id);
}

/**
 * Слайд, в который ложится правка сцены, — тот, чья метка стоит под головкой.
 *
 * Метки под головкой нет — слайд РОЖДАЕТСЯ на ней (`planning.md` §14.9,
 * вариант (а) владельца). Автор идёт двумя путями: сначала метка, потом
 * содержимое, либо наоборот; второй путь до этого терялся — правки ложились
 * в слайд, чья метка стоит раньше, и молча портили картинку на всём отрезке
 * между метками.
 *
 * Рождение возвращается вместе с сегментом, а не делается отдельным
 * действием: иначе отмена сняла бы правку и оставила осиротевший слайд.
 * Один шаг истории — одно состояние проекта.
 */
function slideForEdit(segment: Segment, at: TimeRef): { segment: Segment; slideId: string } {
  const words = segment.audio.words;
  const seconds = resolveTimeRef(at, words);

  const existing = slidesApi.slideOnMark(segment, seconds, words);
  if (existing) return { segment, slideId: existing.id };

  const anchor = slidesApi.slideAt(segment, seconds, words);
  const next = slidesApi.addSlide(segment, anchor.id, at);
  const born = next.slides.find((slide) => !segment.slides.some((old) => old.id === slide.id));
  if (!born) {
    // addSlide обязан был вернуть сегмент с новым слайдом или бросить.
    // Молчание здесь означало бы правку, ушедшую в никуда.
    throw new Error(`Слайд на ${seconds.toFixed(3)} с не родился, хотя метки там не было`);
  }
  return { segment: next, slideId: born.id };
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
      if (currentSegment(state).elements.some((element) => element.id === action.element.id)) {
        throw new Error(`Элемент «${action.element.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      // Появление элемента — такая же правка сцены, как и его перемещение:
      // на голом месте дорожки оно тоже рождает слайд.
      const { segment, slideId } = slideForEdit(currentSegment(state), action.at);
      const slides = segment.slides.map((slide) =>
        slide.id === slideId
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
      return { ...next, selectedId: action.element.id, currentSlideId: slideId };
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
      const { segment, slideId } = slideForEdit(currentSegment(state), action.at);
      const nextSegment = slidesApi.setElementState(
        segment,
        slideId,
        action.elementId,
        action.patch,
      );
      const applied = replaceSegment(state, nextSegment);
      // Патч, ничего не изменивший, обязан вернуть ТО ЖЕ состояние по ссылке.
      // Спред создал бы новый объект даже на пустой правке, а сцена решает
      // сравнением ссылок, что перерисовывать: перетаскивание, вернувшее
      // элемент на прежнее место, пересобирало бы сцену на каждый кадр.
      if (applied === state && slideId === state.currentSlideId) return state;
      // Правка идёт в слайд под головкой — он же становится текущим.
      // Иначе лента слайдов показывала бы один слайд, а сцена правила другой.
      return { ...applied, currentSlideId: slideId };
    }

    case 'putElementOnSlide': {
      if (!hasElement(state.project, state.currentSegmentId, action.elementId)) {
        throw new Error(`Нельзя поместить элемент «${action.elementId}» на слайд: его нет в проекте`);
      }
      return replaceSegment(
        state,
        slidesApi.putOnSlide(currentSegment(state), state.currentSlideId, action.elementId),
      );
    }

    case 'removeElementFromSlide': {
      if (!hasElement(state.project, state.currentSegmentId, action.elementId)) {
        throw new Error(`Нельзя убрать элемент «${action.elementId}» со слайда: его нет в проекте`);
      }
      const next = replaceSegment(
        state,
        slidesApi.removeFromSlide(currentSegment(state), state.currentSlideId, action.elementId),
      );
      // Убранный элемент больше не на сцене — держать его выделенным значило бы
      // показывать свойства того, чего в этом кадре нет.
      return next.selectedId === action.elementId ? { ...next, selectedId: undefined } : next;
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

    case 'copySlide': {
      // Только буфер вида — проект НЕ меняется (ADR-025). replaceSegment
      // здесь намеренно не зовём: project остаётся тем же объектом по ссылке.
      const clipboard = slidesApi.copySlideToClipboard(currentSegment(state), action.slideId);
      return { ...state, slideClipboard: clipboard };
    }

    case 'cutSlide': {
      // Буфер и удаление — ОДНИМ вызовом редьюсера, то есть одним шагом
      // истории: разложи их на copySlide + removeSlide, и Ctrl+Z отдал бы
      // автору полуразрезанное состояние (буфер уже наполнен, слайд ещё жив).
      const segment = currentSegment(state);
      const clipboard = slidesApi.copySlideToClipboard(segment, action.slideId);
      const nextSegment = slidesApi.removeSlide(segment, action.slideId);
      const next = replaceSegment(state, nextSegment);
      // Тот же приём, что в removeSlide ниже: удалённый текущий слайд —
      // возвращаемся на первый слайд сегмента.
      const currentSlideId =
        state.currentSlideId === action.slideId ? requireFirstSlide(nextSegment).id : next.currentSlideId;
      return { ...next, currentSlideId, slideClipboard: clipboard };
    }

    case 'pasteSlide': {
      // Буфера нет — вставлять нечего. ТОТ ЖЕ объект по ссылке: заводить
      // пустой шаг истории на «нечего вставлять» нельзя.
      if (!state.slideClipboard) return state;
      const before = currentSegment(state);
      const nextSegment = slidesApi.pasteSlide(before, state.slideClipboard, action.at);
      const created = nextSegment.slides.find(
        (slide) => !before.slides.some((old) => old.id === slide.id),
      )!;
      // Буфер НЕ опустошается: вставить дважды — законное намерение автора
      // (ADR-025). Вставленный слайд становится текущим — так же, как addSlide.
      return { ...replaceSegment(state, nextSegment), currentSlideId: created.id };
    }

    case 'duplicateSlide': {
      // Буфер автора не трогает вовсе: свой временный SlideClipboard внутри
      // duplicateSlideAt (ADR-025) — не третья реализация правила вставки.
      const before = currentSegment(state);
      const nextSegment = slidesApi.duplicateSlideAt(before, action.slideId, action.at);
      const created = nextSegment.slides.find(
        (slide) => !before.slides.some((old) => old.id === slide.id),
      )!;
      return { ...replaceSegment(state, nextSegment), currentSlideId: created.id };
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

    case 'duplicateSegment': {
      const project = duplicateSegment(state.project, action.segmentId);
      // Автор остаётся на ОРИГИНАЛЕ: он не просил перевести себя на копию
      // (та же логика, что у splitAtGate выше). currentSegmentId/currentSlideId
      // не трогаем — оригинал не переехал, его собственные id не изменились.
      return { ...state, project };
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

    case 'replaceSegmentAudio': {
      const segment = currentSegment(state);
      // Слова СТАРЫЕ, той озвучки, которую заменяем. Читать их обязательно
      // до того, как ниже audio.words сменится: перенос метки строится на
      // сопоставлении старого транскрипта с новым, и без левой стороны
      // сопоставления не существует. Именно поэтому расшифровка приходит
      // ЭТИМ же действием, а не следующим: между двумя действиями старых
      // слов уже нет.
      const before = segment.audio.words;
      const after = action.words;

      const marks = [...segment.slides.map((s) => s.at), ...segment.gates.map((g) => g.at)];
      const { refs, report }: { refs: readonly TimeRef[]; report: RetargetReport | undefined } =
        after === undefined
          ? { refs: marks.map((ref) => (ref.kind === 'word' ? retargetMark(ref, before, 'seconds') : ref)), report: undefined }
          : retargetByAlignment(marks, before, after);

      // Спред только там, где ссылка реально изменилась: неизменившийся
      // слайд/гейт обязан остаться ТЕМ ЖЕ объектом по ссылке (см. комментарий
      // модуля про StageView и сравнение ссылок).
      const slides = segment.slides.map((slide, i) => {
        const ref = refs[i]!;
        return ref === slide.at ? slide : { ...slide, at: ref };
      });
      const gates = segment.gates.map((gate, i) => {
        const ref = refs[segment.slides.length + i]!;
        return ref === gate.at ? gate : { ...gate, at: ref };
      });

      return replaceSegment({ ...state, lastRetarget: report }, {
        ...segment,
        slides,
        gates,
        audio: {
          src: undefined,
          fileId: action.fileId,
          offset: 0,
          duration: action.duration,
          words: after === undefined ? [] : [...after],
        },
      });
    }

    case 'setSegmentWords': {
      const segment = currentSegment(state);
      // Копия, а не присвоение readonly-массива: audio.words в схеме — Word[]
      // (мутабельный), а action.words нарочно readonly — это чужой результат
      // (ответ /api/transcribe), который зовущий код не обязан ни менять,
      // ни делить хранение со стейтом редактора.
      return replaceSegment(state, {
        ...segment,
        audio: { ...segment.audio, words: [...action.words] },
      });
    }

    case 'setSpeech': {
      const segment = currentSegment(state);
      const text = action.text.trim();
      // Пустая строка запрещена схемой: «текста нет» выражается отсутствием
      // поля. Два способа сказать одно — источник расхождений на ровном месте.
      const speech = text.length > 0 ? text : undefined;
      return replaceSegment(state, { ...segment, speech });
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

/**
 * Копия куска — жёсткая копия, встаёт СРАЗУ ПОСЛЕ оригинала (product.md §7).
 * На копию при этом никто не ссылается: связать её — работа автора.
 *
 * Живёт здесь, а не в `duplicate.ts`, по той же причине, что и `splitAtGate`
 * ниже: собрать новый состав `project.segments` — работа стороны записи.
 * `duplicate.ts` знает, как скопировать ОДНУ часть, и намеренно не видит
 * проекта целиком (узкая дверца — тест инвариантов «project.segments
 * и project.entry читают в одном месте»).
 */
export function duplicateSegment(project: Project, segmentId: string): Project {
  const index = project.segments.findIndex((candidate) => candidate.id === segmentId);
  if (index < 0) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте: копировать нечего`);
  }
  const source = project.segments[index]!;

  // Переменные остановок уникальны ПО ВСЕМУ ПРОЕКТУ (schema.ts: «Переменная
  // записывается дважды…»), поэтому список занятых имён собирается по всем
  // сегментам, а не только по копируемому.
  const takenVariables = project.segments.flatMap((segment) =>
    segment.gates.map((gate) => ({ id: gate.recordAs })));

  const duplicate = copySegment(source, project.segments, takenVariables);
  const segments = [
    ...project.segments.slice(0, index + 1),
    duplicate,
    ...project.segments.slice(index + 1),
  ];

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

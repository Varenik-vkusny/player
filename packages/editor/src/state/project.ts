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
import type {
  ChapterBadge, Condition, Element, ElementState, Gate, Project, Segment, Slide, Style, Theme, TimeRef,
  TransitionDirection, Word,
} from '@player/core';
import { findSegment, resolveTimeRef, ThemeSchema } from '@player/core';

import { markSeconds, retargetMark, timeRefAt } from '../track/marks.js';
import { insertionIndex } from '../track/spans.js';
import { copySegment } from './duplicate.js';
import { duplicateElements as duplicateElementsOnSlide } from './duplicateElements.js';
import {
  copyElementsToClipboard,
  pasteElements as pasteElementsOnSlide,
  type ElementClipboard,
} from './elementClipboard.js';
import { removeElement as removeElementFromSegment } from './elements.js';
import {
  groupElements as groupElementsInSegment,
  ungroupElements as ungroupElementsInSegment,
} from './groupElements.js';
import * as exits from './exits.js';
import { removeOption, setFork, setOptionLabel, setPrompt } from './gates.js';
import { extractToBranch } from './extractBranch.js';
import { retargetByAlignment, type RetargetReport } from './retarget.js';
import * as slidesApi from './slides.js';
import type { SlideClipboard } from './slides.js';
import { branches_title, splitAtTimeBlockedReason, splitBlockedReason, splitSegmentAtGate, splitSegmentAtTime } from './split.js';
import { bakeStyle } from './styleLink.js';
import { applyTemplate as applyTemplateToSegment, askOnStage as askOnStageOnSegment, type SceneTemplate } from './templates.js';

/**
 * `freeId` живёт в `elements.ts` — это модуль про элементы, а не про весь
 * проект. Реэкспорт здесь нужен ради обратной совместимости: редактор
 * (`Editor.tsx`) уже импортирует `freeId` из этого файла.
 */
export { freeId } from './elements.js';

export interface EditorState {
  readonly project: Project;
  /**
   * Выделенные элементы. Пустой список — выделения нет.
   *
   * СПИСОК, а не «один плюс остальные». Второе поле рядом с одиночным
   * выделением пришлось бы согласовывать в каждом действии редьюсера,
   * и разъехаться они могли бы молча — ровно та ошибка, которую в v10
   * пришлось чинить у перечня типов элемента.
   *
   * Порядок значим: первым идёт тот, кого выделили раньше. Это опора
   * для будущего выравнивания — «по кому равняем» у Canva определяется
   * не порядком, но опция «по первому выделенному» без порядка невыразима.
   *
   * Местам, которым нужно «ровно один» (инспектор, ручки изменения размера),
   * отвечает `soleSelectedId` ниже, а не собственная проверка длины: иначе
   * условие «а если выделено несколько» разошлось бы по коду в десятке мест
   * с разными ответами.
   */
  readonly selectedIds: readonly string[];
  /**
   * Сегмент, который автор сейчас правит. Не в истории: это вид, а не
   * данные, как и `selectedIds` — переключение сегмента само по себе ничего
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
   * сообщение автору, а не свойство проекта, поэтому живёт рядом с `selectedIds`
   * и `currentSlideId`, а не внутри `project`/истории отмены. `undefined` —
   * либо ничего ещё не переносили, либо последняя замена была без расшифровки
   * (путь «без расшифровки» законен и отчёта не производит).
   */
  readonly lastRetarget: RetargetReport | undefined;
  /**
   * Буфер обмена слайдов (ADR-025: «слайд переносит состояние, а не
   * момент»). Состояние ВИДА, а не данные проекта — живёт рядом
   * с `selectedIds`/`lastRetarget`, вне истории отмены. Отличие от
   * `lastRetarget`, который undo/redo сбрасывает: буфер отмену обязан
   * ПЕРЕЖИТЬ — это предмет в руке автора, а не отчёт о правке, от которой
   * он отошёл. `undefined` — буфер пуст, ничего не скопировано и не вырезано.
   */
  readonly slideClipboard: SlideClipboard | undefined;
  /**
   * Буфер обмена ЭЛЕМЕНТОВ (Сессия 33). Второй механизм рядом с буфером
   * слайдов не заводится: устройство то же — снимок в состоянии вида,
   * переживающий отмену, — а различие только в правиле вставки, и оно
   * целиком внутри `elementClipboard.ts`.
   *
   * Отдельным полем, а не общим с `slideClipboard`: у автора в руках
   * может лежать и слайд, и пачка элементов одновременно, а Ctrl+V
   * на ленте слайдов и Ctrl+V на холсте — разные намерения. Один общий
   * буфер заставил бы каждое из них спрашивать «а что там лежит?»
   * и молча ничего не делать, если лежит чужое.
   *
   * `undefined` — буфер пуст, ничего не копировали и не вырезали.
   */
  readonly elementClipboard: ElementClipboard | undefined;
}

/**
 * Единственный выделенный элемент — или `undefined`, если их ноль либо
 * несколько.
 *
 * Существует затем, чтобы вопрос «а что показывать, когда выделено
 * несколько» имел ОДИН ответ на весь редактор. Инспектор правит поля одного
 * элемента, ручки изменения размера тянут один бокс — и тому и другому
 * нужен именно этот случай, а не «первый из списка»: показать свойства
 * первого при трёх выделенных значит соврать автору о том, что он правит.
 */
export function soleSelectedId(selectedIds: readonly string[]): string | undefined {
  return selectedIds.length === 1 ? selectedIds[0] : undefined;
}

/** Метки на дорожке, которые двигаются перетаскиванием: гейт или слайд. */
export type MarkKind = 'gate' | 'slide';

export type EditorAction =
  /**
   * `mode` отсутствует или `'replace'` — выделить только этот элемент.
   * `'toggle'` — добавить к выделению или убрать из него (Shift-клик).
   * `id: undefined` очищает выделение при любом режиме: «щёлкнул мимо всего»
   * означает одно и то же с Shift и без него.
   */
  | {
      readonly type: 'select';
      readonly id: string | undefined;
      readonly mode?: 'replace' | 'toggle';
    }
  /**
   * Выделить СПИСОК элементов одним действием — резиновая рамка.
   *
   * Отдельное действие, а не цикл по `select`, и причина не в истории:
   * выделение в историю не пишется вовсе (правило №1 в `editorHistory.ts`).
   * Причина в том, что ни один режим `select` не выражает «выделить эти».
   *
   * - циклом с `mode: 'replace'` выделенным остался бы ПОСЛЕДНИЙ пойманный,
   *   каждый шаг стирал бы предыдущий;
   * - циклом с `mode: 'toggle'` рамка СНИМАЛА бы выделение с тех, кто уже
   *   был выделен, — а обведение обязано их оставить.
   *
   * Второй дефект тише первого: он проявляется только на повторном
   * обведении пересекающихся областей и выглядит как «рамка иногда
   * не берёт элемент».
   *
   * `mode`: `'replace'` или отсутствует — выделены ровно эти;
   * `'add'` — добавить к уже выделенным (рамка с зажатым Shift).
   * Пустой список при `'replace'` очищает выделение: обвели пустоту —
   * значит ничего не выделено.
   */
  | {
      readonly type: 'selectMany';
      readonly ids: readonly string[];
      readonly mode?: 'replace' | 'add';
    }
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
  /** Удаляет элементы целиком из сегмента. Список, а не один: см. редьюсер. */
  | { readonly type: 'removeElement'; readonly ids: readonly string[] }
  | {
      /**
       * Копия выделенных элементов на слайде под головкой. `ids` — пачкой,
       * а не по одному, ровно как у `removeElement`: это один жест автора
       * и обязан быть одним шагом истории.
       */
      readonly type: 'duplicateElements';
      readonly ids: readonly string[];
      readonly at: TimeRef;
    }
  /**
   * Сборка и разборка группы (Сессия 35).
   *
   * **Поля `at` здесь НЕТ, и это не упущение, а разница по существу.**
   * Ctrl+D и Ctrl+V кладут своё на слайд под головкой — они правят КАДР.
   * Группировка правит СТРОЕНИЕ сегмента: она обязана пройти каждый слайд,
   * где есть хоть один из детей, потому что `SegmentSchema` запрещает
   * ребёнка на слайде без состояния его группы. Появись здесь `at`,
   * группа завелась бы на одном слайде, а проект перестал бы проходить
   * собственную проверку при следующей загрузке — молча до перезагрузки.
   *
   * По той же причине группировка не рождает слайд на голом месте
   * дорожки: рождать нечего, правка не привязана к моменту.
   */
  | { readonly type: 'groupElements'; readonly ids: readonly string[] }
  | { readonly type: 'ungroupElements'; readonly groupId: string }
  /**
   * Буфер обмена элементов (Сессия 33).
   *
   * `copyElements` проект НЕ трогает — это состояние вида, как и `copySlide`.
   * `cutElements` трогает, и наполнение буфера с удалением идут ОДНИМ
   * вызовом редьюсера: разложи их на два, и Ctrl+Z отдал бы автору
   * полуразрезанное состояние — буфер уже полон, объекты ещё живы.
   *
   * У `pasteElements` есть `at` по той же причине, что у `duplicateElements`:
   * вставка — правка сцены, и на голом месте дорожки она рождает слайд.
   */
  | { readonly type: 'copyElements'; readonly ids: readonly string[] }
  | { readonly type: 'cutElements'; readonly ids: readonly string[] }
  | { readonly type: 'pasteElements'; readonly at: TimeRef }
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
  /**
   * Куда едет переход (схема v10). Отдельное действие, а не поле
   * у `setSlideTransition`: приём и направление правятся разными жестами
   * автора — плиткой каталога и кнопкой-стрелкой, — и склейка заставила бы
   * каждый из них знать текущее значение второго.
   *
   * Обратной операции «снять направление» нет намеренно: снимает его смена
   * приёма на ненаправленный, и делает это `slides.setTransition`. Ручное
   * снятие было бы вторым способом прийти в то же состояние.
   */
  | {
      readonly type: 'setSlideTransitionDirection';
      readonly slideId: string;
      readonly direction: TransitionDirection;
    }
  /**
   * Правка ОДНОЙ роли темы сцены (схема v9, `ThemeSchema`) — `project.meta`,
   * а не сегмент. Первое действие, которое пишет `meta`: `replaceSegment`
   * для него не годится, у него свой путь — `replaceTheme` ниже.
   * (`docs/design/theme-panel.md` §4).
   *
   * `role` — простая строка, а не `keyof Theme`: панель (`ThemePanel.tsx`)
   * шлёт сюда только ключи `ThemeSchema.shape`, но тип действия обязан
   * пропускать и незаконное значение — иначе проверку «роли, которой нет
   * в схеме, редьюсер обязан бросить» было бы нечем тестировать.
   *
   * `commit` — тот же живой флаг, что у `setElementState`/`moveMark`/
   * `setSlideTransitionSeconds`: пипетка цвета шлёт событие на каждое
   * движение, а не только на закрытие, и без склейки одна смена цвета дала
   * бы сотню шагов отмены (`state/editorHistory.ts`, `isLiveEvent`).
   */
  | {
      readonly type: 'setThemeRole';
      readonly role: string;
      readonly value: string;
      readonly commit?: boolean;
    }
  /**
   * Продолжительность перехода к слайду. `commit` — тот же живой флаг,
   * что и у `setElementState`/`moveMark`: ползунок шлёт это на каждое
   * движение, коммит-точку ставит `handleCommitHistory` на отпускание
   * (`state/editorHistory.ts`, `isLiveEvent`).
   */
  | {
      readonly type: 'setSlideTransitionSeconds';
      readonly slideId: string;
      readonly transitionSeconds: number;
      readonly commit?: boolean;
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
  /**
   * Убрать вариант ответа ВМЕСТЕ с его веткой.
   *
   * Отдельным действием, а не через `updateGate`: правка расходится за
   * пределы метки — уходит правило выхода, а за ним и глава, в которую
   * больше некому вести. Панель этого не видит и собрать такое не может.
   */
  | { readonly type: 'removeGateOption'; readonly gateId: string; readonly optionId: string }
  /**
   * Стили проекта (схема v12, ADR-029).
   *
   * `addStyle` — «Сохранить вид как стиль» (`StylesPanel.tsx`): кладёт новый
   * стиль в `project.styles` И одним и тем же шагом истории переводит
   * `sourceElementId` на него — на ТЕКУЩЕМ слайде (`currentSlideId`), а не
   * через `at`/`slideForEdit`: элемент, из чьего вида собран стиль, уже
   * стоит на этом слайде, и рождать слайд заново нечем и незачем. Ключи,
   * ушедшие в `style.props`, редьюсер сам вычищает из собственной карты
   * элемента — иначе он остался бы отцеплённым по всем свойствам сразу,
   * и живая связь не сработала бы ни разу (см. `styleLink.ts`).
   *
   * `updateStyle` — замена стиля целиком по id, тот же приём, что
   * у `updateGate`/`replaceElement`.
   *
   * `removeStyle` — снимает стиль с ЛЮБОГО состояния любого сегмента
   * проекта, впечатывая в него `bakeStyle` (`styleLink.ts`) ПЕРЕД тем, как
   * убрать сам стиль из `project.styles`. Одним шагом истории: разложи это
   * на «впечатать» + «удалить», и Ctrl+Z вернул бы половинчатое состояние.
   */
  | { readonly type: 'addStyle'; readonly style: Style; readonly sourceElementId: string }
  | { readonly type: 'updateStyle'; readonly style: Style }
  | { readonly type: 'removeStyle'; readonly styleId: string }
  /**
   * Импорт набора со склада (`StylesPanel.tsx`, кнопка «Взять» — ADR-029 §6,
   * `state/styleStore.ts`). В отличие от `addStyle`, здесь НЕТ элемента-
   * источника: пришедшие стили ничего не переводят на себя, они просто
   * ложатся в `project.styles`. Коллизии идентификаторов уже разрешены
   * `mergeStyleSet` до вызова этого действия — переименовывать здесь
   * нечего. Один dispatch на весь набор: взять пять стилей и отменить взятие
   * одним Ctrl+Z, а не пятью.
   */
  | { readonly type: 'addStyles'; readonly styles: readonly Style[] }
  | {
      readonly type: 'moveMark';
      readonly kind: MarkKind;
      readonly id: string;
      readonly at: TimeRef;
      readonly commit?: boolean;
    }
  | { readonly type: 'removeMark'; readonly kind: 'gate'; readonly id: string }
  /**
   * Отрезки «моё» на полосе капли (v14, ADR-032).
   *
   * Адресуются ИНДЕКСОМ, а не идентификатором, и это законно ровно потому,
   * что отрезки упорядочены и не пересекаются: тяга упирается в соседа
   * (`track/spans.ts`, `clampEdge`/`clampWhole`), значит порядок за жест
   * измениться не может, и индекс на протяжении жеста указывает на тот же
   * отрезок. Заведи отрезкам `id` — в схеме появилось бы поле, которое
   * ничего не выражает, кроме удобства одного редьюсера.
   *
   * `addSpan` сам ставит отрезок на место в упорядоченном массиве
   * (`insertionIndex`): вставка в конец разошлась бы со схемой на первом же
   * отрезке, нарисованном левее прежних.
   *
   * `commit` — та же механика, что у `moveMark`: тяга приходит на каждый
   * `pointermove` и обязана остаться ОДНИМ шагом истории.
   */
  | {
      readonly type: 'addSpan';
      readonly elementId: string;
      readonly from: TimeRef;
      readonly to: TimeRef;
    }
  | {
      readonly type: 'moveSpan';
      readonly index: number;
      readonly from: TimeRef;
      readonly to: TimeRef;
      readonly commit?: boolean;
    }
  | { readonly type: 'removeSpan'; readonly index: number }
  // Один шаг истории на кнопку: шаблон правит elements, слайды и gates разом,
  // и это обязано остаться одной правкой (см. state/templates.ts), а не
  // отдельными addElement/addSlide/addGate, которые historyReducer положил
  // бы в историю по одному.
  | { readonly type: 'applyTemplate'; readonly template: SceneTemplate }
  /*
   * «Задать вопрос с ответами» у уже стоящей остановки — кладёт вопрос
   * НА СЦЕНУ настоящими элементами вместо служебной плашки (владелец,
   * 21.08.2026). Один шаг истории на всё сразу — тем же доводом, что
   * у `branchFromOption` ниже: смена вида гейта на «выбор», создание
   * текстовых элементов и привязка вариантов к ним (`bindOption`) обязаны
   * откатываться Ctrl+Z ЦЕЛИКОМ. Разложи это на смену вида + addElement
   * по одному на вариант + bindOption по одному — и половинчатый откат
   * оставил бы либо фигуры без вопроса, либо вопрос без фигур.
   */
  | { readonly type: 'askOnStage'; readonly gateId: string }
  /*
   * Текст вопроса и подписи ответов — ОДНОЙ отправкой на данные остановки
   * и на элемент сцены, который их показывает.
   *
   * Раздельно было бы не «две правки», а РАСХОЖДЕНИЕ: автор правит вопрос
   * в карточке, зритель читает старый на сцене, и оба значения по отдельности
   * верны, поэтому ни одна проверка не покраснеет. Тот же класс, что дважды
   * пойман в этой сессии: два поля «Вопрос» на одном экране и «строка причин»,
   * повторяющая то, что уже сказано кнопкой.
   */
  | { readonly type: 'setGatePrompt'; readonly gateId: string; readonly text: string }
  | {
    readonly type: 'setGateOptionLabel';
    readonly gateId: string;
    readonly optionId: string;
    readonly text: string;
  }
  | { readonly type: 'addSegment' }
  | { readonly type: 'removeSegment'; readonly id: string }
  // Жёсткая копия куска (product.md §7, механика «копия блока» — не путать
  // с «повтором своего раздела», ребром назад по графу, и со «ссылкой
  // на общий блок», отложенной [П]). Вся логика — в duplicate.ts: несущее
  // ограничение там же (схема запрещает двум остановкам писать в одну
  // переменную по всему проекту, поэтому копия остановки получает своё имя).
  | { readonly type: 'duplicateSegment'; readonly segmentId: string }
  | { readonly type: 'renameSegment'; readonly id: string; readonly title: string }
  | {
    readonly type: 'setSegmentBadge';
    readonly id: string;
    /** `undefined` снимает метку целиком. */
    readonly badge: ChapterBadge | undefined;
  }
  | { readonly type: 'renameVariable'; readonly gateId: string; readonly name: string }
  | { readonly type: 'selectSegment'; readonly id: string }
  | { readonly type: 'connect'; readonly when: readonly Condition[]; readonly goto: string }
  /*
   * Куда уводит ОДИН ответ остановки — одной отправкой (Сессия 55).
   *
   * Заведено под карточку остановки на дорожке, где автор выбирает цель
   * ответа списком. Без него смена цели складывалась бы из `disconnect`
   * и `connect`, то есть из ДВУХ шагов истории, и Ctrl+Z возвращал бы
   * половину — ответ без выхода вовсе. Тот же довод, что у `branchFromOption`
   * ниже.
   *
   * `goto: null` — «своего правила нет»: рассказ идёт запасным выходом главы.
   * `goto`, равный текущей главе, законен и означает «пройти её заново»:
   * механика повтора уже написана (`player/src/repeat.ts`) и решена
   * владельцем 02.08.2026.
   */
  | {
    readonly type: 'setOptionTarget';
    readonly gateId: string;
    readonly optionId: string;
    readonly goto: string | null;
  }
  // «Завести ветку» прямо от варианта ответа (Сессия 51, задача Б3).
  //
  // ОДИН шаг истории на оба дела — заведение главы и правило выхода в неё, —
  // ровно тем же доводом, что записан у `splitAtGate` ниже: разложить это
  // на `addSegment` + `connect` значило бы отдать автору полусделанное
  // состояние на промежуточном Ctrl+Z (глава есть, дойти до неё нельзя).
  //
  // Своей логики действие не заводит: и главу, и правило делают те же
  // `exits.addSegment`/`exits.renameSegment`/`exits.connect`, которыми
  // пользуются «Добавить главу» и «Правила выхода». Ново здесь только то,
  // что они вызываются подряд и попадают в историю одним шагом.
  | { readonly type: 'branchFromOption'; readonly gateId: string; readonly optionId: string }
  | { readonly type: 'addCondition'; readonly ruleId: string; readonly condition: Condition }
  | { readonly type: 'removeCondition'; readonly ruleId: string; readonly index: number }
  | { readonly type: 'disconnect'; readonly ruleId: string }
  // «Вынести диапазон глав в ветку» (владелец, 16.08.2026): смыкание основной
  // линии над выделением — правка сразу нескольких глав, один шаг истории,
  // тем же устройством, что у `connect`/`disconnect` выше.
  | { readonly type: 'extractToBranch'; readonly chapterIds: readonly string[] }
  // Объявление остановки развилкой. Один шаг истории на весь разрез: он правит
  // текущую часть и рождает несколько новых, и разложить это на addSegment +
  // connect + правку гейта значило бы отдать автору полуразрезанное состояние
  // на каждом промежуточном Ctrl+Z.
  | { readonly type: 'splitAtGate'; readonly gateId: string }
  | { readonly type: 'splitAtTime'; readonly seconds: number }
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
    selectedIds: [],
    currentSegmentId: project.entry,
    currentSlideId: requireFirstSlide(segment).id,
    lastRetarget: undefined,
    slideClipboard: undefined,
    elementClipboard: undefined,
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
      if (action.id === undefined) {
        return state.selectedIds.length === 0 ? state : { ...state, selectedIds: [] };
      }
      if (!hasElement(state.project, state.currentSegmentId, action.id)) {
        throw new Error(`Нельзя выделить элемент «${action.id}»: его нет в проекте`);
      }

      if (action.mode === 'toggle') {
        const next = state.selectedIds.includes(action.id)
          ? state.selectedIds.filter((id) => id !== action.id)
          // В конец, а не в начало: порядок выделения сохраняется (см. `selectedIds`).
          : [...state.selectedIds, action.id];
        return { ...state, selectedIds: next };
      }

      const already = state.selectedIds.length === 1 && state.selectedIds[0] === action.id;
      return already ? state : { ...state, selectedIds: [action.id] };
    }

    case 'selectMany': {
      for (const id of action.ids) {
        if (!hasElement(state.project, state.currentSegmentId, id)) {
          throw new Error(`Нельзя выделить элемент «${id}»: его нет в проекте`);
        }
      }

      // Порядок выделения сохраняется, повторы схлопываются: рамка может
      // накрыть элемент, уже выделенный Shift-кликом до неё.
      const base = action.mode === 'add' ? state.selectedIds : [];
      const next: string[] = [];
      for (const id of [...base, ...action.ids]) {
        if (!next.includes(id)) next.push(id);
      }

      // Тот же список по составу и порядку обязан вернуть ТО ЖЕ состояние
      // по ссылке: обведение, ничего не изменившее, не должно пересобирать
      // сцену и класть в историю пустой шаг.
      const same =
        next.length === state.selectedIds.length &&
        next.every((id, index) => id === state.selectedIds[index]);
      return same ? state : { ...state, selectedIds: next };
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
      /*
       * ЭЛЕМЕНТ ПРИХОДИТ НА СЦЕНУ И ОСТАЁТСЯ НА НЕЙ — то есть ложится
       * на кадр под головкой И НА ВСЕ КАДРЫ ПОСЛЕ НЕГО.
       *
       * Куплено 25.08.2026. Раньше состояние писалось в ОДИН кадр, а
       * «элемента нет в состояниях кадра» означает «его нет на сцене»
       * (ADR-015) — значит на следующем кадре элемент попросту исчезал.
       *
       * Замер: глава, собранная плиткой «Обложка» (кадры 0 и 0.5), автор
       * кладёт фигуру на нуле. Было `first: text-1,text-2,shape-1`
       * и `slide-1: text-1,text-2` — фигура пропадала через полсекунды.
       * То есть ЛЮБОЙ элемент, положенный автором, исчезал почти сразу,
       * и это была первая же вещь, которую делает новый автор.
       *
       * Назад элемент не кладётся намеренно: головку автор привёл сам,
       * и «пришёл здесь» — это ровно то, что он показал. Приход элемента
       * позже начала главы и есть механика появления (ADR-015).
       */
      const bornAt = resolveTimeRef(
        segment.slides.find((slide) => slide.id === slideId)!.at,
        segment.audio.words,
      );
      const slides = segment.slides.map((slide) =>
        resolveTimeRef(slide.at, segment.audio.words) >= bornAt
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
      return { ...next, selectedIds: [action.element.id], currentSlideId: slideId };
    }

    case 'removeElement': {
      /**
       * Удаление пачкой — ОДИН шаг истории, а не по шагу на элемент.
       *
       * Автор выделил три и нажал Delete: это один его жест, и Ctrl+Z обязан
       * вернуть все три разом. Отдельные шаги заставили бы жать отмену
       * трижды, причём порядок возврата зависел бы от порядка удаления —
       * то же правило, по которому перетаскивание уже коммитится целиком.
       */
      const nextSegment = action.ids.reduce(removeElementFromSegment, currentSegment(state));
      const next = replaceSegment(state, nextSegment);
      const selectedIds = state.selectedIds.filter((id) => !action.ids.includes(id));
      // Удалили выделенное — снимаем именно его, остальное выделение живёт.
      return selectedIds.length === state.selectedIds.length ? next : { ...next, selectedIds };
    }

    case 'groupElements': {
      const segment = currentSegment(state);
      const made = groupElementsInSegment(segment, action.ids);
      const next = replaceSegment(state, {
        ...segment,
        elements: [...made.elements],
        slides: [...made.slides],
      });
      /**
       * Выделение переходит на группу, а не остаётся на детях.
       *
       * Иначе автор, только что собравший пачку, продолжал бы таскать
       * её поэлементно — то есть увидел бы, что кнопка сработала,
       * а поведение не изменилось. Выделенная группа — ещё и единственное
       * состояние, в котором рисуются ручки (`StageView`, `showHandles`).
       */
      return { ...next, selectedIds: [made.groupId] };
    }

    case 'ungroupElements': {
      const segment = currentSegment(state);
      // Дети собираются ДО разборки: после неё `parentId` у них уже нет,
      // и найти бывших членов группы будет не по чему.
      const childIds = segment.elements
        .filter((element) => element.parentId === action.groupId)
        .map((element) => element.id);
      const made = ungroupElementsInSegment(segment, action.groupId);
      const next = replaceSegment(state, {
        ...segment,
        elements: [...made.elements],
        slides: [...made.slides],
      });
      // Выделенной остаётся та же пачка, только уже без общей рамки:
      // разборка — не отмена выбора, а снятие связи.
      return { ...next, selectedIds: childIds };
    }

    case 'duplicateElements': {
      /**
       * Копия пачкой — ОДИН шаг истории, по той же причине, что у удаления
       * пачкой выше: автор выделил три и нажал Ctrl+D одним жестом, значит
       * одна отмена обязана убрать все три копии разом.
       *
       * Собрать это циклом из `addElement` НЕЛЬЗЯ, хотя соблазн прямой:
       * каждый `dispatch` лёг бы в историю отдельным шагом, и автору
       * пришлось бы жать Ctrl+Z по разу на копию.
       */
      const { segment, slideId } = slideForEdit(currentSegment(state), action.at);
      const slide = segment.slides.find((item) => item.id === slideId);
      if (slide === undefined) {
        // slideForEdit обязан был вернуть существующий или только что
        // рождённый слайд. Молчание здесь означало бы копию, ушедшую в никуда.
        throw new Error(`Слайд «${slideId}» не найден после slideForEdit`);
      }

      // Размеры сцены — из `meta`, как уже читает их выравнивание ниже
      // в этом же редьюсере: у схемного `Segment` поля `stage` нет, оно
      // есть только у видового представления плеера (`segmentOf`).
      const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
      const made = duplicateElementsOnSlide(segment, action.ids, slide.states, stage);

      // Копировать было нечего: выделены только элементы, которых на этом
      // слайде нет. Возвращаем ТО ЖЕ состояние по ссылке, а не пересобранное
      // с рождённым слайдом, — иначе в историю лёг бы пустой шаг, и первый
      // Ctrl+Z автора не отменил бы ничего видимого.
      if (made.elements.length === 0) return state;

      const slides = segment.slides.map((item) =>
        item.id === slideId ? { ...item, states: { ...item.states, ...made.states } } : item,
      );
      const next = replaceSegment(state, {
        ...segment,
        elements: [...segment.elements, ...made.elements],
        slides,
      });

      // Выделение переходит на копии — так же поступает `addElement`: автор
      // только что их создал и, скорее всего, сейчас же потащит в сторону.
      return {
        ...next,
        selectedIds: made.elements.map((element) => element.id),
        currentSlideId: slideId,
      };
    }

    case 'copyElements': {
      // Только буфер вида — проект НЕ меняется, как и у `copySlide`.
      const segment = currentSegment(state);
      const slide = segmentSlide(state.project, state.currentSegmentId, state.currentSlideId);
      const clipboard = copyElementsToClipboard(segment, slide.id, action.ids, slide.states);
      // Копировать было нечего (выделены элементы, которых на этом слайде нет).
      // Буфер при этом НЕ опустошается: «нечего взять» — не повод выронить
      // то, что автор уже держит в руке.
      if (clipboard.items.length === 0) return state;
      return { ...state, elementClipboard: clipboard };
    }

    case 'cutElements': {
      const segment = currentSegment(state);
      const slide = segmentSlide(state.project, state.currentSegmentId, state.currentSlideId);
      const clipboard = copyElementsToClipboard(segment, slide.id, action.ids, slide.states);
      if (clipboard.items.length === 0) return state;

      /*
       * Удаление — из ВСЕГО сегмента, а не только с этого слайда, ровно как
       * у Delete (`removeElement` ниже). «Вырезать» значит забрать объект,
       * а не спрятать его на одном кадре: оставив элемент в сегменте, мы
       * дали бы автору вставку, которая заводит второй такой же, пока
       * первый невидимо лежит в остальных слайдах.
       */
      const nextSegment = clipboard.items.reduce(
        (accumulated, item) => removeElementFromSegment(accumulated, item.element.id),
        segment,
      );
      const next = replaceSegment(state, nextSegment);
      const cut = new Set(clipboard.items.map((item) => item.element.id));
      const selectedIds = state.selectedIds.filter((id) => !cut.has(id));
      return { ...next, selectedIds, elementClipboard: clipboard };
    }

    case 'pasteElements': {
      // Буфера нет — вставлять нечего. ТОТ ЖЕ объект по ссылке: пустой шаг
      // истории заставил бы автора нажать Ctrl+Z впустую.
      if (!state.elementClipboard || state.elementClipboard.items.length === 0) return state;

      const { segment, slideId } = slideForEdit(currentSegment(state), action.at);
      const slide = segment.slides.find((item) => item.id === slideId);
      if (slide === undefined) {
        // slideForEdit обязан был вернуть существующий или только что
        // рождённый слайд. Молчание здесь означало бы вставку, ушедшую в никуда.
        throw new Error(`Слайд «${slideId}» не найден после slideForEdit`);
      }

      const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
      const made = pasteElementsOnSlide(segment, slideId, state.elementClipboard, slide.states, stage);

      const slides = segment.slides.map((item) =>
        item.id === slideId ? { ...item, states: { ...item.states, ...made.states } } : item,
      );
      const next = replaceSegment(state, {
        ...segment,
        elements: [...segment.elements, ...made.elements],
        slides,
      });

      // Буфер НЕ опустошается: вставить дважды — законное намерение автора,
      // то же правило, что у `pasteSlide`. Выделение переходит на вставленное,
      // как у `addElement` и `duplicateElements`.
      return {
        ...next,
        selectedIds: made.elements.map((element) => element.id),
        currentSlideId: slideId,
      };
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
      return next.selectedIds.includes(action.elementId)
        ? { ...next, selectedIds: next.selectedIds.filter((id) => id !== action.elementId) }
        : next;
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

    case 'setSlideTransitionDirection': {
      const nextSegment = slidesApi.setTransitionDirection(
        currentSegment(state), action.slideId, action.direction,
      );
      return replaceSegment(state, nextSegment);
    }

    case 'setThemeRole': {
      // ThemeSchema.shape — тот же закрытый список, что читает ThemePanel
      // (editor/src/theme.ts): роль вне него законной быть не может, а
      // молчаливое принятие опечатки в имени осело бы в meta.theme и
      // ничего бы не покрасило (var(--неизвестное) браузер отбрасывает
      // целиком, S11 в CLAUDE.md).
      if (!(action.role in ThemeSchema.shape)) {
        throw new Error(`Роли темы «${action.role}» нет в схеме: закрытый список — ThemeSchema.shape`);
      }
      return replaceTheme(state, action.role, action.value);
    }

    case 'setSlideTransitionSeconds': {
      const nextSegment = slidesApi.setTransitionSeconds(
        currentSegment(state), action.slideId, action.transitionSeconds,
      );
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

    case 'removeGateOption': {
      /*
       * УБИРАЯ ОТВЕТ, УБИРАЕМ И ЕГО ВЕТКУ. Решение владельца 25.08.2026:
       * «надо обеспечить, чтобы ветки удалялись, если я удаляю вариант
       * ответа».
       *
       * Раньше уходил только вариант. Правило выхода на него оставалось
       * висеть — условие про значение, которого больше никто не запишет, —
       * а ветка оставалась главой, в которую нельзя попасть. Доска «Ветки»
       * честно помечала её «зритель не попадёт», но убирать автору
       * приходилось руками, и он про это не знал.
       *
       * ГЛАВА СНОСИТСЯ, ТОЛЬКО ЕСЛИ В НЕЁ БОЛЬШЕ НЕКОМУ ВЕСТИ. Ветка могла
       * быть общей целью двух ответов или целью правила из другой главы —
       * снести её тогда значило бы сломать чужой путь.
       *
       * Всё вместе — ОДИН шаг истории: Ctrl+Z возвращает и вариант,
       * и правило, и главу. Половина отката отдала бы автору состояние,
       * которого он не собирал.
       */
      const segment = currentSegment(state);
      const gate = segment.gates.find((candidate) => candidate.id === action.gateId);
      if (!gate) {
        throw new Error(`Метки «${action.gateId}» нет в текущей главе: нечего править`);
      }
      if (gate.config.kind !== 'choice') {
        throw new Error(`У метки «${action.gateId}» нет вариантов ответа`);
      }

      // Правила, ведущие ИМЕННО по этому ответу. Сравниваем по переменной
      // метки и значению варианта — так же, как их заводит `connect`.
      const doomed = segment.exit.rules.filter((rule) => rule.when.some(
        (condition) => condition.kind === 'equals'
          && condition.variable === gate.recordAs
          && condition.value === action.optionId,
      ));

      const withoutOption = replaceAt(
        segment.gates, gate.id, () => removeOption(gate, action.optionId),
      );
      let project = replaceSegment(state, { ...segment, gates: withoutOption }).project;

      for (const rule of doomed) {
        project = exits.disconnect(project, state.currentSegmentId, rule.id);
      }

      // Осиротевшие ветки — те, куда после этого не ведёт ни один путь
      // от входа. Стартовую главу `removeSegment` снести не даст, и это
      // правильно: она обязательна схемой.
      const reachable = exits.reachableFrom(project);
      for (const rule of doomed) {
        const target = project.segments.find((candidate) => candidate.id === rule.goto);
        if (!target || target.id === project.entry) continue;
        if (reachable.has(target.id)) continue;
        project = exits.removeSegment(project, target.id);
      }

      return { ...state, project };
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

    case 'addStyle': {
      if (state.project.styles.some((style) => style.id === action.style.id)) {
        throw new Error(`Стиль «${action.style.id}» уже есть: идентификаторы обязаны быть уникальны`);
      }
      if (!hasElement(state.project, state.currentSegmentId, action.sourceElementId)) {
        throw new Error(
          `Нельзя сохранить стиль: элемента «${action.sourceElementId}» нет в проекте`,
        );
      }
      const segment = currentSegment(state);
      const slide = segment.slides.find((candidate) => candidate.id === state.currentSlideId);
      if (!slide) {
        throw new Error(`Текущего слайда «${state.currentSlideId}» нет в сегменте «${segment.id}»`);
      }
      const existing = slide.states[action.sourceElementId];
      if (existing === undefined) {
        throw new Error(
          `У элемента «${action.sourceElementId}» нет состояния на текущем слайде — сохранять нечего`,
        );
      }

      // Ключи, ушедшие в стиль, УДАЛЯЮТСЯ из собственной карты элемента —
      // иначе он оказался бы отцеплённым по всем свойствам сразу
      // (`isDetached` в styleLink.ts смотрит на НАЛИЧИЕ ключа), и правка
      // стиля задним числом не тронула бы элемент, из чьего вида его
      // только что собрали.
      const movedKeys = new Set(Object.keys(action.style.props));
      const ownStyle = Object.fromEntries(
        Object.entries(existing.style).filter(([key]) => !movedKeys.has(key)),
      );
      const nextElementState: ElementState = { ...existing, styleId: action.style.id, style: ownStyle };
      const slides = segment.slides.map((candidate) =>
        candidate.id === state.currentSlideId
          ? { ...candidate, states: { ...candidate.states, [action.sourceElementId]: nextElementState } }
          : candidate,
      );

      const withStyle: EditorState = {
        ...state,
        project: { ...state.project, styles: [...state.project.styles, action.style] },
      };
      return replaceSegment(withStyle, { ...segment, slides });
    }

    case 'updateStyle': {
      const styles = state.project.styles;
      const index = styles.findIndex((style) => style.id === action.style.id);
      if (index < 0) {
        throw new Error(`Нельзя обновить стиль «${action.style.id}»: его нет в проекте`);
      }
      if (styles[index] === action.style) return state;
      const next = styles.slice();
      next[index] = action.style;
      return { ...state, project: { ...state.project, styles: next } };
    }

    case 'removeStyle': {
      const project = bakeAndRemoveStyle(state.project, action.styleId);
      return { ...state, project };
    }

    case 'addStyles': {
      if (action.styles.length === 0) return state;
      const taken = new Set(state.project.styles.map((style) => style.id));
      for (const style of action.styles) {
        if (taken.has(style.id)) {
          throw new Error(
            `Стиль «${style.id}» уже есть в проекте: mergeStyleSet (styleStore.ts) обязан был ` +
              'исключить совпадение идентификаторов до вызова addStyles',
          );
        }
        taken.add(style.id);
      }
      return { ...state, project: { ...state.project, styles: [...state.project.styles, ...action.styles] } };
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
      /*
       * ЖЕСТ НЕ ИМЕЕТ ПРАВА ИСПОРТИТЬ ПРОЕКТ. Слайд прилипает к границе
       * законного отрезка, а не перепрыгивает соседа — см. комментарий
       * clampSlideSeconds в state/slides.ts, там же замер и жалоба.
       */
      const words = segment.audio.words;
      const asked = resolveTimeRef(action.at, words);
      const allowed = slidesApi.clampSlideSeconds(segment, action.id, asked);
      const at = allowed === asked ? action.at : timeRefAt(words, allowed);
      const slides = replaceAt(segment.slides, action.id, (slide) => ({ ...slide, at }));
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

    case 'addSpan': {
      const segment = currentSegment(state);
      if (!segment.elements.some((element) => element.id === action.elementId)) {
        throw new Error(
          `Отрезок «моё» нельзя завести элементу «${action.elementId}»: его нет в этой главе`,
        );
      }
      const span = { elementId: action.elementId, from: action.from, to: action.to };
      const at = insertionIndex(
        segment.authorSpans
          .filter((candidate) => candidate.elementId === action.elementId)
          .map((candidate) => ({
            fromSeconds: markSeconds(candidate.from, segment.audio.words),
            toSeconds: markSeconds(candidate.to, segment.audio.words),
          })),
        markSeconds(action.from, segment.audio.words),
      );
      // Место считается среди отрезков ЭТОГО элемента, а вставка идёт
      // в общий массив: у элементов свои независимые ленты отрезков,
      // и схема проверяет порядок отдельно по каждому. В MVP полосу получает
      // только капля, поэтому обе ленты обычно совпадают — но совпадение
      // это, а не тождество, и опираться на него нельзя.
      const ownIndexes = segment.authorSpans
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) => candidate.elementId === action.elementId)
        .map(({ index }) => index);
      const insertAt = ownIndexes[at] ?? segment.authorSpans.length;
      const authorSpans = [
        ...segment.authorSpans.slice(0, insertAt),
        span,
        ...segment.authorSpans.slice(insertAt),
      ];
      return replaceSegment(state, { ...segment, authorSpans });
    }

    case 'moveSpan': {
      const segment = currentSegment(state);
      const target = segment.authorSpans[action.index];
      if (!target) {
        throw new Error(`Отрезка «моё» №${action.index} нет: двигать нечего`);
      }
      const authorSpans = segment.authorSpans.map((span, index) =>
        index === action.index ? { ...span, from: action.from, to: action.to } : span);
      return replaceSegment(state, { ...segment, authorSpans });
    }

    case 'removeSpan': {
      const segment = currentSegment(state);
      if (!segment.authorSpans[action.index]) {
        throw new Error(`Отрезка «моё» №${action.index} нет: удалять нечего`);
      }
      const authorSpans = segment.authorSpans.filter((_, index) => index !== action.index);
      return replaceSegment(state, { ...segment, authorSpans });
    }

    case 'applyTemplate': {
      // Размер сцены — из meta проекта, той же величины, которой уже
      // пользуется плеер, а не из состояния вида.
      const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
      // Метки всех глав: имя новой обязано быть свободно по всему проекту
      // (схема запрещает писать одну переменную дважды).
      const allGates = state.project.segments.flatMap((part) => part.gates);
      const nextSegment = applyTemplateToSegment(
        action.template, currentSegment(state), stage, allGates,
      );
      return replaceSegment(state, nextSegment);
    }

    case 'setGatePrompt':
    case 'setGateOptionLabel': {
      const segment = currentSegment(state);
      const gate = segment.gates.find((candidate) => candidate.id === action.gateId);
      if (!gate) {
        throw new Error(`Остановки «${action.gateId}» нет в текущей главе`);
      }
      if (gate.config.kind === 'continue') {
        throw new Error(`У остановки «${action.gateId}» нет вопроса: это переход «Дальше»`);
      }

      // Какой элемент сцены показывает правимый текст. `undefined` — вопрос
      // на сцену не вынесен, и правится только запись в остановке.
      let shownBy: string | undefined;
      let nextGate: Gate;
      if (action.type === 'setGatePrompt') {
        shownBy = gate.config.kind === 'choice' ? gate.config.promptElementId : undefined;
        nextGate = setPrompt(gate, action.text);
      } else {
        if (gate.config.kind !== 'choice') {
          throw new Error(`У остановки «${action.gateId}» нет вариантов ответа`);
        }
        shownBy = gate.config.options.find((option) => option.id === action.optionId)?.elementId;
        nextGate = setOptionLabel(gate, action.optionId, action.text);
      }

      const gates = segment.gates.map((candidate) => (candidate.id === action.gateId ? nextGate : candidate));
      const elements = shownBy === undefined
        ? segment.elements
        : segment.elements.map((element) => (
          element.id === shownBy ? { ...element, content: action.text } : element
        ));

      return replaceSegment(state, { ...segment, gates, elements });
    }

    case 'askOnStage': {
      // Тот же размер сцены, что и у applyTemplate: из meta проекта,
      // а не из состояния вида.
      const stage = { width: state.project.meta.stageWidth, height: state.project.meta.stageHeight };
      const asked = askOnStageOnSegment(currentSegment(state), action.gateId, stage);

      /*
       * ЕСТЬ ВАРИАНТЫ ОТВЕТА — ЗНАЧИТ РАССКАЗ ЗДЕСЬ ДЕЛИТСЯ.
       *
       * Решение владельца 25.08.2026, дословно: «можно поставить метку
       * и оставить её без вопросов, либо можно создать метку но с вопросами,
       * и соответственно там будет развилка, потому что там есть варианты
       * ответа, и соответственно сама развилка появится и под ней ветки».
       *
       * ЧТО БЫЛО. Одно намерение автора требовало ЧЕТЫРЁХ нажатий в трёх
       * разных органах: задать вопрос, потом выбрать в списке «Что это
       * за остановка» → «Развилка», потом нажать «Разделить повествование
       * здесь», и только потом ветки. Пропустишь любой шаг — зритель
       * ответит, а рассказ пойдёт ещё полглавы, глядя на его же кнопки.
       * Владелец прошёл этот путь и написал: «я не понял пайплайн,
       * я не понял абсолютно нихуя».
       *
       * ТЕПЕРЬ одно нажатие: вопрос на сцене, глава разрезана по метке,
       * под каждым вариантом своя ветка, за развилкой — продолжение.
       *
       * Верного ответа у такой метки нет (`setFork`): раз ответ ведёт
       * в свою ветку, «правильность» решает не он, а автор, — и остаётся
       * отдельным свойством, а не признаком, от которого зависит структура.
       *
       * Разрез невозможен только в трёх случаях (`splitBlockedReason`):
       * метка не с вариантами, метка потеряла своё слово в расшифровке,
       * метка стоит на нуле. Тогда вопрос всё равно ставится — просто
       * без разреза, и автор видит его на сцене.
       */
      const gate = asked.gates.find((candidate) => candidate.id === action.gateId);
      if (!gate) {
        throw new Error(`Метки «${action.gateId}» нет после постановки вопроса`);
      }
      const forked = { ...asked, gates: replaceAt(asked.gates, gate.id, () => setFork(gate, true)) };
      const withQuestion = replaceSegment(state, forked);

      const forkedGate = forked.gates.find((candidate) => candidate.id === action.gateId)!;
      if (splitBlockedReason(forkedGate, forked.audio.words) !== undefined) return withQuestion;

      const project = splitAtGate(withQuestion.project, state.currentSegmentId, action.gateId);
      const head = requireSegment(project, state.currentSegmentId);
      /*
       * Автор остаётся ТАМ, ГДЕ ВОПРОС, а не в начале главы.
       *
       * Разрез уводит на первый кадр — так было у кнопки «Разделить»,
       * и для неё это верно: автор объявлял развилку, а не просил себя
       * куда-то перевести. Здесь иначе: он только что создал вопрос
       * и ответы, они лежат на кадре у метки, и увести его от них значит
       * показать пустую сцену вместо сделанной работы.
       */
      /*
       * Метку ищем В ГОЛОВЕ ПОСЛЕ РАЗРЕЗА, а не берём ту, что была до него.
       *
       * Разрез перепривязывает ссылки на время к своему окну расшифровки:
       * у головы после него СВОЙ список слов, и тот же `wordIndex` означает
       * в нём другое слово. Замер 25.08.2026: с ссылкой «до разреза» автора
       * уносило на кадр 15.14 при метке на 26.73 — то есть он не видел
       * ни вопроса, ни ответов, которые только что создал.
       */
      const headGate = head.gates.find((candidate) => candidate.id === action.gateId);
      if (!headGate) {
        throw new Error(`Метка «${action.gateId}» пропала из главы после разреза`);
      }
      const atGate = slidesApi.slideAt(
        head, resolveTimeRef(headGate.at, head.audio.words), head.audio.words,
      );
      return {
        ...withQuestion,
        project,
        currentSlideId: atGate.id,
        selectedIds: [],
      };
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
        selectedIds: [],
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
        selectedIds: [],
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

    case 'setSegmentBadge': {
      const project = exits.setSegmentBadge(state.project, action.id, action.badge);
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
        selectedIds: [],
      };
    }

    case 'connect': {
      const project = exits.connect(state.project, state.currentSegmentId, action.when, action.goto);
      return { ...state, project };
    }

    case 'setOptionTarget': {
      const segment = currentSegment(state);
      const gate = segment.gates.find((candidate) => candidate.id === action.gateId);
      // Падаем громко: карточка показывается только у существующей остановки,
      // и её пропажа между отрисовкой и отправкой — расхождение состояния,
      // а не случай, который надо пережить молча.
      if (!gate) {
        throw new Error(`Остановки «${action.gateId}» нет в текущей главе: некуда вести ответ`);
      }
      const targeted = exits.setOptionTarget(
        state.project, state.currentSegmentId, gate.recordAs, action.optionId, action.goto,
      );
      // Тот же довод, что у `branchFromOption`: назначив цель ОДНОМУ ответу,
      // автор оставил бы остальных без выхода, и работа перестала бы
      // сохраняться. Снятие цели (`goto === null`) запасного выхода
      // не требует — правил могло не остаться вовсе.
      const project = action.goto === null
        ? targeted
        : exits.ensureFallback(targeted, state.currentSegmentId, action.goto);
      return { ...state, project };
    }

    case 'branchFromOption': {
      /*
       * ВЕТКА ПОД ОТВЕТОМ САМА РЕЖЕТ ГЛАВУ, ЕСЛИ ТА ЕЩЁ НЕ РАЗРЕЗАНА.
       *
       * Без этого ветка получалась недостижимой по смыслу: зритель отвечает
       * на метке, а рассказ идёт ДО КОНЦА ГЛАВЫ и только потом уходит
       * в ветку. Владелец наткнулся на это первым же вопросом сессии:
       * «я вот в плеер ответил на вопрос, а по итогу меня никуда
       * не перекинуло». Прыжка из середины дорожки не бывает — он рвал звук
       * (ADR-013), поэтому единственный честный ответ это разрез.
       *
       * Признак «уже разрезана» — метка стоит на конце дорожки: `splitAtGate`
       * ровно это и делает, оставляя голову длиной до метки. Второй разрез
       * той же метки поэтому не наступает.
       *
       * Разрез невозможен в трёх случаях (`splitBlockedReason`) — тогда
       * ветка всё равно заводится, просто рассказ дойдёт до неё позже.
       */
      const before = currentSegment(state);
      const beforeGate = before.gates.find((candidate) => candidate.id === action.gateId);
      if (beforeGate && splitBlockedReason(beforeGate, before.audio.words) === undefined) {
        const gateSeconds = resolveTimeRef(beforeGate.at, before.audio.words);
        if (gateSeconds < before.audio.duration - slidesApi.MARK_HIT_SECONDS) {
          /*
           * ГЛАВА ЕЩЁ НЕ РАЗРЕЗАНА — РЕЖЕМ, И ЭТОГО ДОСТАТОЧНО.
           *
           * Разрез сам заводит ветку под КАЖДЫЙ ответ, включая этот.
           * Заводить сверху ещё одну значило бы дать одному ответу два
           * правила, из которых второе недостижимо: правила читаются
           * по порядку. Замер 25.08.2026 на фикстуре inline-explain —
           * получалось пять глав вместо двух и два правила на «opt-gate».
           *
           * Без разреза ветка была бы недостижима по смыслу: зритель
           * отвечает на метке, а рассказ идёт до конца главы и только потом
           * уходит в ветку. Владелец наткнулся на это первым же вопросом
           * сессии: «я ответил на вопрос, а меня никуда не перекинуло».
           */
          const cut = splitAtGate(state.project, state.currentSegmentId, action.gateId);
          const cutHead = requireSegment(cut, state.currentSegmentId);
          return {
            ...state,
            project: cut,
            currentSlideId: requireFirstSlide(cutHead).id,
            selectedIds: [],
          };
        }
      }

      const state1 = state;
      const segment = currentSegment(state1);
      const gate = segment.gates.find((candidate) => candidate.id === action.gateId);
      if (!gate) {
        throw new Error(`Метки «${action.gateId}» нет в текущей главе: не от чего вести ветку`);
      }
      if (gate.config.kind !== 'choice') {
        throw new Error(`У метки «${action.gateId}» нет вариантов ответа: ветку вести не от чего`);
      }
      const index = gate.config.options.findIndex((option) => option.id === action.optionId);
      if (index < 0) {
        throw new Error(`Варианта «${action.optionId}» нет у метки «${action.gateId}»`);
      }

      // Порядок обязателен: `connect` отказывается вести правило в главу,
      // которой ещё нет в проекте, и делает это громко (exits.ts). Имя
      // ставится между ними, потому что `addSegment` даёт главе имя по счёту,
      // а нам нужна подпись варианта — тем же правилом, каким называет
      // ветки разрез по развилке (`split.ts`, `branches_title`).
      const { project: withSegment, segment: created } =
        exits.addSegment(state1.project, state1.currentSegmentId);
      const titled = exits.renameSegment(
        withSegment, created.id,
        // Имена уже занятых глав: ветка не берёт чужое имя.
        branches_title(gate, action.optionId, index, withSegment.segments),
      );
      const connected = exits.connect(
        titled,
        state1.currentSegmentId,
        [{ kind: 'equals', variable: gate.recordAs, value: action.optionId }],
        created.id,
      );
      /*
       * Остальным ответам тоже нужно куда-то идти, иначе проект перестаёт
       * быть валидным и АВТОСОХРАНЕНИЕ ПАДАЕТ. Найдено владельцем в живом
       * редакторе 22.08.2026: он развёл один ответ и получил красную полосу
       * «Не удалось сохранить работу в браузере».
       *
       * Запасной выход ведёт в ту же новую главу, и карточка говорит об этом
       * у каждого неразведённого ответа дословно: «пойдёт в «…», как и все
       * остальные ответы». Автор видит и переназначает.
       */
      const project = exits.ensureFallback(connected, state1.currentSegmentId, created.id);

      // Автор ОСТАЁТСЯ на месте, в отличие от обычного `addSegment`.
      // Он не просил перевести себя в новую главу — он размечал варианты
      // остановки, и увести его отсюда значило бы закрыть панель, в которой
      // он работает. Тот же довод, что у `splitAtGate` и `duplicateSegment`.
      // Результат он видит немедленно: строка под вариантом меняется
      // с «никуда не ведёт» на «ведёт в «…»».
      return { ...state1, project };
    }

    case 'disconnect': {
      const project = exits.disconnect(state.project, state.currentSegmentId, action.ruleId);
      return { ...state, project };
    }

    case 'extractToBranch': {
      const project = extractToBranch(state.project, action.chapterIds);
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
        selectedIds: [],
      };
    }

    case 'splitAtTime': {
      const project = splitAtTime(state.project, state.currentSegmentId, action.seconds);
      const head = requireSegment(project, state.currentSegmentId);
      // Автор остаётся в ПЕРВОЙ главе, тем же доводом, что и у разреза
      // по развилке: он ставил метку здесь, а не просил перевести себя
      // за неё. Выделение сбрасывается не для порядка — выделенное могло
      // уехать во вторую главу.
      return {
        ...state,
        project,
        currentSlideId: requireFirstSlide(head).id,
        selectedIds: [],
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
/**
 * Ставит МЕТКУ в момент `seconds`: глава делится на две.
 *
 * `product.md` §2з [Р] «Метку можно ставить где угодно, не только
 * на вопросе» — прямая отмена прежнего [Р] «разрезать можно только
 * на гейте». `branches.md` §2: метка И ЕСТЬ стык глав, отдельного объекта
 * у неё нет, граница между главами и есть метка.
 *
 * Вторая глава встаёт СРАЗУ ПОСЛЕ первой в `project.segments`, а не
 * в конец: порядок в списке — это порядок рассказа для автора, и метка,
 * рождающая главу где-то внизу списка, читалась бы как прыжок.
 *
 * Живёт здесь, а не в `split.ts`, по тому же доводу, что и `splitAtGate`:
 * собрать новый состав `project.segments` — работа стороны записи, узкой
 * дверцы, которую охраняет тест инвариантов.
 */
/**
 * Почему нельзя разрезать главу здесь. `undefined` — можно.
 *
 * ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ на два вопроса, которые обязаны отвечать
 * одинаково: «гасить ли кнопку» и «выполнять ли разрез». Раньше их было два,
 * и они спрашивали РАЗНОЕ: кнопка — длительность у загруженной дорожки
 * (`transport.durationSeconds`), разрез — длительность, объявленную
 * в проекте (`segment.audio.duration`).
 *
 * В покое эти числа совпадают, потому что окно дорожке задаётся из проекта.
 * Но МЕЖДУ сменой главы и дозагрузкой её дорожки транспорт ещё держит
 * длительность ПРЕЖНЕЙ главы — и в этот промежуток кнопка жива, а разрез
 * видит другую главу и бросает. Бросок из редьюсера React обрабатывает
 * единственным способом: снимает всё дерево. Автор видит белый экран.
 *
 * Найдено владельцем 17.08.2026 нажатием «разделить здесь» — то есть
 * на живом продукте, а не тестом.
 */
export function splitHereProblem(
  project: Project,
  segmentId: string,
  seconds: number,
): string | undefined {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  // Главы нет — состояние переходное (её только что удалили, а выделение
  // ещё не переехало). Кнопке в этот момент положено быть погашенной,
  // а не бросать: бросок здесь и есть тот самый белый экран.
  if (!segment) return 'Глава не выбрана';
  return splitAtTimeBlockedReason(seconds, segment.audio.duration);
}

export function splitAtTime(project: Project, segmentId: string, seconds: number): Project {
  const segment = requireSegment(project, segmentId);
  const { head, tail } = splitSegmentAtTime(segment, seconds, project.segments);

  const segments = project.segments.flatMap((candidate) =>
    (candidate.id === head.id ? [head, tail] : [candidate]));

  return { ...project, segments };
}

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

/**
 * Удаление стиля из ВСЕГО проекта: впечатывает `bakeStyle` в каждое
 * состояние, ссылавшееся на него (в любом сегменте, не только текущем —
 * стиль виден всему проекту), снимает `styleId`, и только потом убирает
 * сам стиль из `project.styles`.
 *
 * Живёт здесь, а не в `styleLink.ts`: та не видит `Project` целиком
 * намеренно (чистые функции про ОДНО состояние/усечённый сегмент), а собрать
 * новый `project.segments` — работа стороны записи, тем же доводом, что
 * у `splitAtGate`/`duplicateSegment` ниже.
 */
function bakeAndRemoveStyle(project: Project, styleId: string): Project {
  const style = project.styles.find((candidate) => candidate.id === styleId);
  if (!style) {
    throw new Error(`Стиля «${styleId}» нет в проекте: удалять нечего`);
  }

  const segments = project.segments.map((segment) => {
    let segmentChanged = false;
    const slides = segment.slides.map((slide) => {
      let slideChanged = false;
      const states: Record<string, ElementState> = {};
      for (const [elementId, elementState] of Object.entries(slide.states)) {
        if (elementState.styleId === styleId) {
          states[elementId] = { ...elementState, style: bakeStyle(elementState.style, style), styleId: undefined };
          slideChanged = true;
        } else {
          states[elementId] = elementState;
        }
      }
      if (!slideChanged) return slide;
      segmentChanged = true;
      return { ...slide, states };
    });
    return segmentChanged ? { ...segment, slides } : segment;
  });

  return { ...project, segments, styles: project.styles.filter((candidate) => candidate.id !== styleId) };
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

/**
 * Правка ОДНОЙ роли темы — `project.meta.theme`, а не сегмент. Пара
 * к `replaceSegment` выше: та же проверка «не изменилось — тот же объект
 * по ссылке», нужная по той же причине — StageView решает, пересобирать ли
 * сцену, сравнением ссылок.
 *
 * `role` проверен вызывающим (`case 'setThemeRole'`) на принадлежность
 * `ThemeSchema.shape` ДО этого вызова; здесь он уже законный ключ `Theme`.
 */
function replaceTheme(state: EditorState, role: string, value: string): EditorState {
  const theme = state.project.meta.theme as Record<string, string>;
  if (theme[role] === value) return state;
  const nextTheme = { ...theme, [role]: value } as Theme;
  return { ...state, project: { ...state.project, meta: { ...state.project.meta, theme: nextTheme } } };
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

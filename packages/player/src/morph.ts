/**
 * Переход между соседними слайдами: что с чем сравнивать и как это двигать.
 *
 * Модуль делится надвое намеренно. `planMorph` — чистая функция от двух
 * наборов состояний: она отвечает на вопрос «кто едет, кто приходит, кто
 * уходит» и проверяется юнит-тестом без единого узла DOM. `buildMorph`
 * превращает готовый план в ведомый таймлайн anime.js и уже требует узлов.
 *
 * Разделение не косметическое: правило сопоставления — это модель (ADR-015),
 * а таймлайн — способ её показать. Их ошибки лечатся в разных местах.
 */
import { type Element, type ElementState, TRANSITIONS, type TransitionDirection } from '@player/core';
// Импорт «бочкой», а не по подпутям `animejs/timeline` и `animejs/engine`:
// замерено — сборка выходит побайтово одинаковой (178.28 КБ), потому что
// таймлайн и так тянет почти всё ядро движка. При равном размере выигрывает
// вариант, записанный в ADR-002.
import { createTimeline, engine } from 'animejs';

import type { SlideStates, StageSize } from './render.js';

/**
 * Приём перехода. Тип берётся из схемы, а не объявляется здесь второй раз:
 * два описания одного перечисления разъехались бы молча.
 */
export type Transition = (typeof TRANSITIONS)[number];

/**
 * Какие CSS-свойства играет каждый приём перехода.
 *
 * Правда о приёме живёт в данных, а не в ветвлении кода, который его играет:
 * инвариант №8 — свойство ПРИЁМА, а не реализации, и охраняется тестом
 * прямо по этой таблице (см. `morph.test.ts`), а не чтением `buildMorph` —
 * DOM в юнит-тестах нет, и построенный таймлайн юнит-тестом непокрываем.
 */
export const TECHNIQUE_PROPS = {
  cut: [],
  morph: ['x', 'y', 'scaleX', 'scaleY', 'rotate', 'opacity'],
  dissolve: ['opacity'],
  // С v10 у `slide` и `wipe` есть направление, поэтому едут они по ЛЮБОЙ
  // из двух осей. Инвариант №8 это не трогает: `y` в `ANIMATABLE` стоит
  // ровно на тех же правах, что `x`, — обе уходят в `transform`.
  slide: ['x', 'y'],
  scale: ['scale', 'opacity'],
  blur: ['filter', 'opacity'],
  wipe: ['x', 'y'],
  circle: ['scale'],
} as const satisfies Record<Transition, readonly string[]>;

/**
 * Умолчание направления — ПО ПРИЁМУ, и это не изящество, а осторожность.
 *
 * У `slide` и `wipe` сегодняшнее движение противоположно: сцена уезжает
 * ВЛЕВО, а штора едет ВПРАВО. Одно общее умолчание неизбежно поменяло бы
 * картинку одному из двух — то есть переписало бы вид уже сохранённых
 * проектов, где направление не выбирали.
 *
 * Поэтому здесь заморожено сегодняшнее поведение, а не выбран красивый
 * общий ответ. `DEFAULT_TRANSITION_DIRECTION` из ядра — умолчание для
 * ПАНЕЛИ автора (что подсветить), и оно к этой таблице отношения не имеет.
 */
export const FROZEN_DIRECTION = {
  slide: 'left',
  wipe: 'right',
} as const satisfies Record<'slide' | 'wipe', TransitionDirection>;

/**
 * Ось и знак движения. Вынесено функцией, потому что формула у сцены
 * и у шторы одна, а знаки противоположны — и это надо было увидеть один
 * раз, а не повторить в двух местах с шансом ошибиться в одном.
 *
 * `sign` — куда УВЕЛИЧИВАЕТСЯ координата при движении в эту сторону:
 * влево и вверх это минус, вправо и вниз — плюс.
 */
export function motionOf(
  direction: TransitionDirection,
  stage: StageSize,
): { axis: 'x' | 'y'; sign: -1 | 1; span: number } {
  const horizontal = direction === 'left' || direction === 'right';
  return {
    axis: horizontal ? 'x' : 'y',
    sign: direction === 'left' || direction === 'up' ? -1 : 1,
    span: horizontal ? stage.width : stage.height,
  };
}

/**
 * Доля перехода, которую занимает уход несовпавших и приход новых.
 *
 * Уходящие гаснут в первой половине, приходящие проявляются во второй —
 * так же, как это делает auto-animate в reveal.js. Одновременный приход
 * и уход поверх едущих элементов читается как мелькание: глазу негде
 * взять, что с чем связано.
 */
export const UNMATCHED_FRACTION = 0.5;

/**
 * Сколько длится переход к слайду `index`, секунды. Ноль — срез.
 *
 * Окно перехода ЗАКАНЧИВАЕТСЯ на метке слайда (`product.md` §2б [Р],
 * ADR-020), поэтому урезается оно расстоянием до ПРЕДЫДУЩЕЙ метки.
 * Переход, начавшийся раньше неё, наложился бы на чужой переход и стартовал
 * бы не с той картинки, которая в тот момент на экране.
 */
export function morphSecondsFor(
  transition: Transition,
  transitionSeconds: number,
  index: number,
  seconds: readonly number[],
): number {
  // Первому слайду ехать неоткуда: предыдущего состояния не существует.
  if (index === 0 || transition === 'cut') return 0;
  const gap = seconds[index]! - seconds[index - 1]!;
  return Math.max(0, Math.min(transitionSeconds, gap));
}

/** Расписание одного слайда: когда его метка и сколько едут К ней. */
export interface SlideSchedule {
  readonly seconds: number;
  readonly morphSeconds: number;
}

/**
 * Что происходит на сцене в заданную секунду.
 *
 * `still` — сцена равна снимку слайда `index`.
 * `morph` — идёт переход К слайду `index`, окно кончается на его метке.
 */
export type Phase =
  | { readonly kind: 'still'; readonly index: number }
  | { readonly kind: 'morph'; readonly index: number };

/** Индекс слайда, чья метка уже наступила. */
export function indexAt(schedule: readonly SlideSchedule[], seconds: number): number {
  let index = 0;
  for (let i = 0; i < schedule.length; i++) {
    if (schedule[i]!.seconds <= seconds) index = i;
    else break;
  }
  return index;
}

/**
 * Фаза сцены в секунду `seconds` — единственное описание расписания.
 *
 * До разворота (ADR-016) момент смены слайда и момент старта перехода
 * совпадали, поэтому хватало одного индекса. Теперь они разные: на
 * `T − длительность` уже надо строить переход, хотя слайд ещё предыдущий.
 * Индексом это не выражается — нужна фаза.
 *
 * **Оба конца окна открыты.** Ровно на метке `T` окно уже кончилось —
 * сцена равна снимку, ради чего разворот и делался. Ровно на предыдущей
 * метке окно ещё не началось — сцена равна предыдущему снимку. Метка всегда
 * означает снимок, с какой бы стороны к ней ни подошли.
 */
export function phaseAt(schedule: readonly SlideSchedule[], seconds: number): Phase {
  const index = indexAt(schedule, seconds);
  const next = schedule[index + 1];
  if (next && next.morphSeconds > 0 && seconds > next.seconds - next.morphSeconds) {
    return { kind: 'morph', index: index + 1 };
  }
  return { kind: 'still', index };
}

/** Что происходит с элементом на переходе. */
export type MorphRole = 'moves' | 'enters' | 'leaves' | 'absent';

/**
 * Один элемент в переходе.
 *
 * `from` и `to` — состояния на предыдущем и следующем слайдах. Отсутствие
 * `from` и `visible: false` в нём — РАЗНЫЕ вещи, и роль их различает
 * (ADR-015): первого не было вовсе, второй стоял на известном месте.
 */
export interface MorphPart {
  readonly id: string;
  /**
   * Тип элемента. Нужен ровно одному потребителю — `buildMorph`, — и ровно
   * ради одного различия: узел ГРУППЫ не имеет права анимировать `scale`.
   * CSS-масштаб предка пересчитывает всё поддерево, включая `left` детей,
   * а каждый ребёнок уже везёт собственный `scaleX`. → `groupMotion`
   */
  readonly type: Element['type'];
  readonly role: MorphRole;
  readonly from: ElementState | undefined;
  readonly to: ElementState | undefined;
}

/**
 * Сравнивает состояния соседних слайдов.
 *
 * Порядок результата задаётся порядком элементов сегмента, а не обходом
 * объекта: рендер обязан быть детерминированным, а порядок ключей объекта
 * зависит от того, как его собрали.
 */
export function planMorph(
  elements: readonly Element[],
  prev: SlideStates,
  next: SlideStates,
): MorphPart[] {
  const parts: MorphPart[] = [];
  for (const { id, type } of elements) {
    const from = prev[id];
    const to = next[id];

    let role: MorphRole;
    if (from && to) role = 'moves';
    else if (to) role = 'enters';
    else if (from) role = 'leaves';
    else role = 'absent';

    parts.push({ id, type, role, from, to });
  }
  return parts;
}

/**
 * Состояния, по которым строится РАСКЛАДКА на время перехода.
 *
 * Уходящий элемент обязан остаться в DOM, пока гаснет, — значит его бокс
 * берётся с предыдущего слайда. Все остальные встают сразу в конечное
 * состояние: FLIP двигает не раскладку, а трансформацию поверх неё.
 */
export function layoutStatesFor(plan: readonly MorphPart[]): SlideStates {
  const states: Record<string, ElementState> = {};
  for (const part of plan) {
    const state = part.role === 'leaves' ? part.from : part.to;
    if (state) states[part.id] = state;
  }
  return states;
}

/**
 * Приёмы, которые двигают СЦЕНУ ЦЕЛИКОМ, а не каждый элемент отдельно.
 *
 * Отличие не косметическое, и оно упирается в модель DOM. У элемента ОДИН
 * узел. Показать старую и новую сцену одновременно — а именно этого требует
 * настоящее растворение, сдвиг или штора — одним узлом нельзя.
 *
 * Отсюда единственная работающая схема: **уход (0→50%) → подмена состояний
 * в середине → приход (50→100%)**. В середине всё либо за краем сцены, либо
 * прозрачно, поэтому мгновенная подмена невидима. `UNMATCHED_FRACTION`
 * и есть эта середина.
 *
 * `morph` сюда НЕ входит: он двигает каждый элемент из его старого состояния
 * в новое, и обе картинки ему не нужны — нужен FLIP поверх конечной
 * раскладки. `cut` не входит, потому что не длится.
 */
export const WHOLE_SCENE: ReadonlySet<Transition> = new Set([
  'dissolve', 'slide', 'scale', 'blur', 'wipe', 'circle',
]);

/**
 * Состояния для одной половины перехода, который двигает сцену целиком.
 *
 * **Набор ключей У ОБЕИХ ПОЛОВИН ОДИН** — объединение участников, — и это
 * несущее свойство, а не удобство. `#renderStates` пересобирает контейнер,
 * когда состав узлов изменился; пересборка в середине перехода оставила бы
 * таймлайн с мёртвыми узлами, и вторая половина анимировала бы то, чего
 * больше нет в документе. При совпавшем составе узлы правятся на месте.
 *
 * `before` — как было: у совпавших и уходящих своё прежнее состояние,
 * у приходящих взять нечего, поэтому берётся будущее (их всё равно не видно,
 * они прозрачны до подмены).
 * `after` — как станет, зеркально.
 */
export function halfStates(
  plan: readonly MorphPart[],
  half: 'before' | 'after',
): SlideStates {
  const states: Record<string, ElementState> = {};
  for (const part of plan) {
    const state = half === 'before' ? (part.from ?? part.to) : (part.to ?? part.from);
    if (state) states[part.id] = state;
  }
  return states;
}

/**
 * Видимая непрозрачность состояния.
 *
 * `visible: false` — это не отдельная механика прятанья, а нулевая
 * непрозрачность с точки зрения перехода: элемент остаётся на своём месте
 * и может ехать, просто его не видно. Именно поэтому он и отличается
 * от элемента, которого в states не было.
 */
function visibleOpacity(state: ElementState): number {
  return state.visible ? state.opacity : 0;
}

/** Множитель масштаба. Нулевой конечный размер не даёт делить — берём единицу. */
function scaleFactor(fromSize: number, toSize: number): number {
  return toSize > 0 ? fromSize / toSize : 1;
}

/** Смещение центра бокса относительно центра конечного бокса. */
function centerShift(fromStart: number, fromSize: number, toStart: number, toSize: number): number {
  return (fromStart + fromSize / 2) - (toStart + toSize / 2);
}

/**
 * Движение узла ГРУППЫ: по левому верхнему углу и БЕЗ масштаба.
 *
 * Оба отличия от обычного элемента — следствия одного: узел группы
 * не рисует себя, он держит поддерево.
 *
 * **Почему без масштаба.** CSS-масштаб предка пересчитывает всё поддерево,
 * включая `left`/`top` детей, а каждый ребёнок уже везёт собственный
 * `scaleX` из своего FLIP. Масштаб учёлся бы дважды, и в начале перехода
 * ребёнок оказывался бы вдвое уже, чем стоял. Измерено на фикстуре
 * `groups.json`: 66.59 экранных px расхождения по ширине при пороге 3.
 * Размер группы — служебное число (охват детей), вида у неё нет,
 * и анимировать в нём нечего.
 *
 * **Почему по углу, а не по центру.** Локальные координаты детей
 * отсчитываются от левого верхнего угла — `applyElement` пишет `left`/`top`.
 * Совпасть обязан именно угол; `centerShift` при изменившемся размере
 * увёл бы поддерево вбок.
 *
 * Инвариант №8 не задет: движение по-прежнему только через `transform`.
 */
function groupMotion(from: ElementState, to: ElementState) {
  return {
    x: [from.x - to.x, 0],
    y: [from.y - to.y, 0],
    // Поворот, наоборот, ОБЯЗАН доезжать до детей: повернул группу —
    // повернулось всё внутри. Композицию поворота CSS делает верно.
    rotate: [from.rotation, to.rotation],
    opacity: [visibleOpacity(from), visibleOpacity(to)],
  };
}

export interface MorphTimeline {
  /** Выставить время перехода, секунды от его начала. */
  seekSeconds(seconds: number): void;
  /** Мгновенно довести до конечного состояния (product.md §3). */
  finish(): void;
  /**
   * Снять за собой накладку, НЕ доигрывая переход.
   *
   * Нужен там, где переход БРОСАЮТ, а не доводят: перемотка (`renderAt`),
   * уход в фазу `still`, замена одного перехода другим. `finish()` там
   * не годится — он доводит картинку до конечного состояния, а бросающий
   * вызывающий сейчас же нарисует своё.
   *
   * Без этого накладка «Шторы» и «Круга» остаётся в DOM НАВСЕГДА и закрывает
   * сцену сплошным цветом: `#renderStates` на совпавшем составе узлов правит
   * их на месте и контейнер не чистит, поэтому убрать её больше некому.
   * Молчаливо: ни ошибки, ни предупреждения — просто пустой экран.
   *
   * Идемпотентен: звать можно сколько угодно раз, в том числе после
   * `finish()`, который накладку уже снял.
   */
  dispose(): void;
  readonly durationSeconds: number;
}

/**
 * Выключает главный цикл движка. Вызывается один раз при построении первого
 * перехода: после этого anime.js физически не может двигать время сам.
 *
 * Это не «мы не вызываем play», а «цикла не существует» — инвариант №1
 * держится конструкцией, а не аккуратностью вызывающего.
 */
let mainLoopDisabled = false;
function disableEngineMainLoop(): void {
  if (mainLoopDisabled) return;
  engine.useDefaultMainLoop = false;
  mainLoopDisabled = true;
}

/** Таймлайн нулевой длительности: `cut` не морфит, ему играть нечего. */
function zeroTimeline(): MorphTimeline {
  return {
    seekSeconds(): void {},
    finish(): void {},
    // Накладки у среза нет: прибирать нечего, но метод обязан быть —
    // вызывающий не знает, какой приём играется.
    dispose(): void {},
    get durationSeconds(): number {
      return 0;
    },
  };
}

/**
 * Заводит накладку `wipe`/`circle`: непрозрачный `div` поверх сцены, который
 * прячет мгновенную подмену раскладки под собой. Убирается ровно в момент,
 * когда накладка уже закрыла сцену целиком (конец её анимации совпадает
 * с концом перехода) — снятие происходит в том же синхронном вызове
 * `finish()`, что и настоящий рендер конечного состояния, поэтому браузер
 * никогда не рисует кадр с убранной накладкой поверх ещё не досчитанной
 * сцены.
 */
/**
 * Каркас приёма, двигающего сцену целиком.
 *
 * Первая половина — уход СТАРОГО кадра, вторая — приход НОВОГО. Между ними
 * `slides.ts` подменяет состояния: в этот момент всё либо за краем сцены,
 * либо прозрачно, поэтому подмена невидима.
 *
 * Участвуют ВСЕ, у кого есть соответствующее состояние, а не только
 * приходящие и уходящие. Это несущее отличие: роль `moves` — элемент,
 * который есть на обоих слайдах, — составляет БОЛЬШИНСТВО (измерено
 * на фикстурах: 78%), потому что «новый слайд по умолчанию — копия
 * предыдущего» (`product.md` [Р]). Приём, пропускающий `moves`,
 * в типичном случае не делал бы НИЧЕГО и был бы неотличим от среза.
 */
function addWholeScene(
  plan: readonly MorphPart[],
  nodeOf: (id: string) => HTMLElement,
  timeline: ReturnType<typeof createTimeline>,
  unmatchedMs: number,
  durationMs: number,
  out: (from: ElementState) => Record<string, unknown>,
  into: (to: ElementState) => Record<string, unknown>,
): void {
  for (const part of plan) {
    if (part.role === 'absent') continue;
    const node = nodeOf(part.id);
    // Уход: все, кто был на старом кадре, — то есть `moves` и `leaves`.
    if (part.from) {
      timeline.add(node, { ...out(part.from), duration: unmatchedMs, ease: 'inQuad' }, 0);
    }
    // Приход: все, кто есть на новом, — `moves` и `enters`.
    if (part.to) {
      timeline.add(
        node,
        { ...into(part.to), duration: durationMs - unmatchedMs, ease: 'outQuad' },
        unmatchedMs,
      );
    }
  }
}

function addOverlay(
  host: HTMLElement,
  stage: StageSize,
  technique: 'wipe' | 'circle',
  // Круг направления не имеет: он растёт из центра, у него нет стороны.
  // Снято с натуры — у Canva «Круговое стирание» стрелок на плитке нет.
  direction: TransitionDirection | undefined,
  timeline: ReturnType<typeof createTimeline>,
  unmatchedMs: number,
  durationMs: number,
): () => void {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.zIndex = '1000';
  overlay.style.pointerEvents = 'none';
  overlay.style.background = 'var(--scene-bg, #0f1620)';

  if (technique === 'wipe') {
    overlay.style.width = `${stage.width}px`;
    overlay.style.height = `${stage.height}px`;
    host.appendChild(overlay);
    // Закрывает в первой половине, открывает во второй. Между ними
    // `slides.ts` подменяет состояния — под сплошной плашкой этого не видно.
    // Без второй половины новый кадр появлялся бы мгновенно на снятии
    // накладки, то есть штора была бы половиной шторы.
    //
    // Штора приходит С противоположной стороны и уходит В сторону
    // направления: она едет НАСКВОЗЬ, а не туда-обратно.
    const { axis, sign, span } = motionOf(direction ?? FROZEN_DIRECTION.wipe, stage);
    timeline.add(overlay, {
      [axis]: [-sign * span, 0],
      duration: unmatchedMs,
      ease: 'inQuad',
    }, 0);
    timeline.add(overlay, {
      [axis]: [0, sign * span],
      duration: durationMs - unmatchedMs,
      ease: 'outQuad',
    }, unmatchedMs);
  } else {
    // Круг центрирован и должен накрыть самый дальний угол сцены —
    // диагональ, а не сторона, иначе углы остались бы видны при scale 1.
    const diagonal = Math.sqrt(stage.width ** 2 + stage.height ** 2);
    overlay.style.width = `${diagonal}px`;
    overlay.style.height = `${diagonal}px`;
    overlay.style.left = `${(stage.width - diagonal) / 2}px`;
    overlay.style.top = `${(stage.height - diagonal) / 2}px`;
    overlay.style.borderRadius = '50%';
    host.appendChild(overlay);
    timeline.add(overlay, {
      scale: [0, 1],
      duration: unmatchedMs,
      ease: 'inQuad',
    }, 0);
    timeline.add(overlay, {
      scale: [1, 0],
      duration: durationMs - unmatchedMs,
      ease: 'outQuad',
    }, unmatchedMs);
  }

  return () => overlay.remove();
}

/**
 * Строит ведомый таймлайн перехода для приёма `technique`.
 *
 * `morph` — единственный приём, что реально двигает бокс: остальные семь
 * не трогают форму совпавших элементов вообще (см. `TECHNIQUE_PROPS`),
 * поэтому у каждого из них свой, более узкий обработчик.
 *
 * **`morph`.** Анимируются только `x`, `y`, `rotate`, `scaleX`, `scaleY`
 * и `opacity` — закрытый перечень `ANIMATABLE`, инвариант №8. Изменение
 * `width`/`height` между слайдами едет через `scaleX`/`scaleY`: модель
 * хранит геометрию, композитор двигает трансформацию.
 *
 * Порядок сборки трансформации проверен по исходнику anime.js
 * (`core/transforms.js`, список `validTransforms`): движок склеивает строку
 * как `translate(...) rotate(...) scale(...)`. Это ровно то, что нужно —
 * масштабируется невращённый бокс, потом поворачивается, потом сдвигается
 * центр. Смещение поэтому считается ПО ЦЕНТРАМ: `applyElement` крутит
 * элемент с `transform-origin` по умолчанию, то есть вокруг центра, и любая
 * другая точка отсчёта дала бы рывок на последнем кадре перехода.
 *
 * **`dissolve`.** Полный кроссфейд: всё, что БЫЛО на сцене (`moves`
 * и `leaves`), гаснет в первой половине окна; всё, что ЕСТЬ на следующей
 * (`moves` и `enters`), проявляется во второй. У совпавшего элемента это
 * два последовательных твина на одном узле — он мигает, а не едет: приём
 * кроссфейдит сцену целиком, а не отдельный бокс.
 *
 * **`slide`, `scale`, `blur`.** Трогают только `leaves` и `enters` —
 * совпавший элемент уже стоит в конечном боксе (его положила
 * `layoutStatesFor`) и остаётся там без дополнительной анимации: наложение
 * двух одновременных твинов на одно и то же свойство одного узла работать
 * не может, а дробить окно на фазы для этих приёмов задание не описывает.
 *
 * **`wipe`, `circle`.** Ни одного элемента плана не касаются вовсе: играет
 * накладка над сценой, `addOverlay`.
 */
export function buildMorph(
  plan: readonly MorphPart[],
  nodes: ReadonlyMap<string, HTMLElement>,
  durationSeconds: number,
  technique: Transition,
  /**
   * `undefined` — автор не выбирал. Тогда берётся `FROZEN_DIRECTION`, то есть
   * сегодняшнее поведение приёма, а не общее умолчание: см. таблицу.
   * Приёмы без направления его просто игнорируют — схема к ним направление
   * и не пропустит (superRefine у `SlideSchema`).
   */
  direction: TransitionDirection | undefined,
  host: HTMLElement,
  stage: StageSize,
): MorphTimeline {
  if (technique === 'cut' || durationSeconds <= 0) return zeroTimeline();

  disableEngineMainLoop();

  const durationMs = durationSeconds * 1000;
  const unmatchedMs = durationMs * UNMATCHED_FRACTION;
  const timeline = createTimeline({ autoplay: false });

  // Раскладку строил layoutStatesFor по этому же плану: если узла нет,
  // разошлись план и сцена. Молчать здесь — значит показать зрителю переход,
  // в котором часть элементов просто не участвует. Проверяется для ВСЕХ
  // приёмов одинаково — это инвариант плана и сцены, а не деталь `morph`.
  const nodeOf = (id: string): HTMLElement => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Переход ссылается на элемент «${id}», которого нет на сцене`);
    return node;
  };

  for (const part of plan) {
    if (part.role === 'absent') continue;
    // Участник перехода виден на всём его протяжении: гасит и проявляет
    // его opacity, а не visibility. Иначе уходящий исчез бы мгновенно,
    // а приходящий не мог бы проявиться вовсе.
    nodeOf(part.id).style.visibility = '';
  }

  let removeOverlay: (() => void) | null = null;

  switch (technique) {
    case 'morph': {
      for (const part of plan) {
        if (part.role === 'absent') continue;
        const node = nodeOf(part.id);
        switch (part.role) {
          case 'moves': {
            const from = part.from!;
            const to = part.to!;
            const motion = part.type === 'group'
              ? groupMotion(from, to)
              : {
                x: [centerShift(from.x, from.width, to.x, to.width), 0],
                y: [centerShift(from.y, from.height, to.y, to.height), 0],
                scaleX: [scaleFactor(from.width, to.width), 1],
                scaleY: [scaleFactor(from.height, to.height), 1],
                rotate: [from.rotation, to.rotation],
                opacity: [visibleOpacity(from), visibleOpacity(to)],
              };
            timeline.add(node, {
              ...motion,
              duration: durationMs,
              ease: 'inOutQuad',
            }, 0);
            break;
          }
          case 'enters': {
            // Приходящему ехать неоткуда: предыдущей позиции не существует.
            // Он проявляется на своём месте и с задержкой — пока совпавшие едут.
            const to = part.to!;
            timeline.add(node, {
              opacity: [0, visibleOpacity(to)],
              duration: durationMs - unmatchedMs,
              ease: 'outQuad',
            }, unmatchedMs);
            break;
          }
          case 'leaves': {
            const from = part.from!;
            timeline.add(node, {
              opacity: [visibleOpacity(from), 0],
              duration: unmatchedMs,
              ease: 'inQuad',
            }, 0);
            break;
          }
        }
      }
      break;
    }

    // Приёмы, двигающие сцену целиком. Все четыре — один каркас с разными
    // свойствами: уход старого кадра в первой половине, приход нового
    // во второй. Подмену состояний между половинами делает `slides.ts`.
    case 'dissolve': {
      addWholeScene(plan, nodeOf, timeline, unmatchedMs, durationMs,
        (from) => ({ opacity: [visibleOpacity(from), 0] }),
        (to) => ({ opacity: [0, visibleOpacity(to)] }));
      break;
    }

    case 'slide': {
      // Старый кадр уезжает В сторону направления, новый приезжает
      // С противоположной — иначе они разъехались бы, а не сменили друг друга.
      const { axis, sign, span } = motionOf(direction ?? FROZEN_DIRECTION.slide, stage);
      addWholeScene(plan, nodeOf, timeline, unmatchedMs, durationMs,
        () => ({ [axis]: [0, sign * span] }),
        () => ({ [axis]: [-sign * span, 0] }));
      break;
    }

    case 'scale': {
      addWholeScene(plan, nodeOf, timeline, unmatchedMs, durationMs,
        (from) => ({ scale: [1, 0.92], opacity: [visibleOpacity(from), 0] }),
        (to) => ({ scale: [1.08, 1], opacity: [0, visibleOpacity(to)] }));
      break;
    }

    case 'blur': {
      addWholeScene(plan, nodeOf, timeline, unmatchedMs, durationMs,
        (from) => ({ filter: ['blur(0px)', 'blur(8px)'], opacity: [visibleOpacity(from), 0] }),
        (to) => ({ filter: ['blur(8px)', 'blur(0px)'], opacity: [0, visibleOpacity(to)] }));
      break;
    }

    case 'wipe':
    case 'circle': {
      removeOverlay = addOverlay(
        host, stage, technique, direction, timeline, unmatchedMs, durationMs,
      );
      break;
    }
  }

  // Распорка до полной длительности: без неё таймлайн кончается на последней
  // анимации, и время в конце упирается в неё, а не в конец перехода.
  // Таймер без цели ничего не перебивает — он не трогает DOM вообще.
  if (timeline.duration < durationMs) {
    timeline.add({ duration: durationMs }, 0);
  }

  /**
   * Первое выставление времени идёт через ноль.
   *
   * Замерено в S1 на прежнем таймлайне: anime.js не перерисовывает анимацию,
   * которая уже доиграла, и не откатывает значения при движении назад.
   * Свежий таймлайн об этом не знает, пока его не тронули; проход через ноль
   * делает картинку функцией от момента, а не от истории вызовов.
   */
  let touched = false;

  return {
    seekSeconds(seconds: number): void {
      const ms = Math.min(Math.max(seconds, 0), durationSeconds) * 1000;
      if (!touched) {
        timeline.currentTime = 0;
        touched = true;
      }
      timeline.currentTime = ms;
    },
    finish(): void {
      timeline.currentTime = 0;
      timeline.currentTime = durationMs;
      touched = true;
      // К этому моменту накладка уже ушла с экрана (вторая половина её
      // открывает), поэтому снятие её синхронно здесь ничего не мигает.
      // Снять обязательно: узел, оставленный в DOM, перехватывал бы
      // следующий переход и копился бы при перемотках.
      if (removeOverlay) {
        removeOverlay();
        removeOverlay = null;
      }
    },
    dispose(): void {
      if (removeOverlay) {
        removeOverlay();
        removeOverlay = null;
      }
    },
    get durationSeconds(): number {
      return durationSeconds;
    },
  };
}

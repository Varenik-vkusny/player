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
import { type ElementState, TRANSITIONS } from '@player/core';
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
  slide: ['x'],
  scale: ['scale', 'opacity'],
  blur: ['filter', 'opacity'],
  wipe: ['x'],
  circle: ['scale'],
} as const satisfies Record<Transition, readonly string[]>;

/**
 * Доля перехода, которую занимает уход несовпавших и приход новых.
 *
 * Уходящие гаснут в первой половине, приходящие проявляются во второй —
 * так же, как это делает auto-animate в reveal.js. Одновременный приход
 * и уход поверх едущих элементов читается как мелькание: глазу негде
 * взять, что с чем связано.
 */
const UNMATCHED_FRACTION = 0.5;

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
  elementIds: readonly string[],
  prev: SlideStates,
  next: SlideStates,
): MorphPart[] {
  const parts: MorphPart[] = [];
  for (const id of elementIds) {
    const from = prev[id];
    const to = next[id];

    let role: MorphRole;
    if (from && to) role = 'moves';
    else if (to) role = 'enters';
    else if (from) role = 'leaves';
    else role = 'absent';

    parts.push({ id, role, from, to });
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
function addOverlay(
  host: HTMLElement,
  stage: StageSize,
  technique: 'wipe' | 'circle',
  timeline: ReturnType<typeof createTimeline>,
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
    timeline.add(overlay, {
      x: [-stage.width, 0],
      duration: durationMs,
      ease: 'inOutQuad',
    }, 0);
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
      duration: durationMs,
      ease: 'inOutQuad',
    }, 0);
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
            timeline.add(node, {
              x: [centerShift(from.x, from.width, to.x, to.width), 0],
              y: [centerShift(from.y, from.height, to.y, to.height), 0],
              scaleX: [scaleFactor(from.width, to.width), 1],
              scaleY: [scaleFactor(from.height, to.height), 1],
              rotate: [from.rotation, to.rotation],
              opacity: [visibleOpacity(from), visibleOpacity(to)],
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

    case 'dissolve': {
      for (const part of plan) {
        if (part.role === 'moves' || part.role === 'leaves') {
          const node = nodeOf(part.id);
          const from = part.from!;
          timeline.add(node, {
            opacity: [visibleOpacity(from), 0],
            duration: unmatchedMs,
            ease: 'inQuad',
          }, 0);
        }
        if (part.role === 'moves' || part.role === 'enters') {
          const node = nodeOf(part.id);
          const to = part.to!;
          timeline.add(node, {
            opacity: [0, visibleOpacity(to)],
            duration: durationMs - unmatchedMs,
            ease: 'outQuad',
          }, unmatchedMs);
        }
      }
      break;
    }

    case 'slide': {
      for (const part of plan) {
        if (part.role === 'leaves') {
          timeline.add(nodeOf(part.id), {
            x: [0, -stage.width],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        } else if (part.role === 'enters') {
          timeline.add(nodeOf(part.id), {
            x: [stage.width, 0],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        }
      }
      break;
    }

    case 'scale': {
      for (const part of plan) {
        if (part.role === 'leaves') {
          timeline.add(nodeOf(part.id), {
            scale: [1, 0.92],
            opacity: [visibleOpacity(part.from!), 0],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        } else if (part.role === 'enters') {
          timeline.add(nodeOf(part.id), {
            scale: [1.08, 1],
            opacity: [0, visibleOpacity(part.to!)],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        }
      }
      break;
    }

    case 'blur': {
      for (const part of plan) {
        if (part.role === 'leaves') {
          timeline.add(nodeOf(part.id), {
            filter: ['blur(0px)', 'blur(8px)'],
            opacity: [visibleOpacity(part.from!), 0],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        } else if (part.role === 'enters') {
          timeline.add(nodeOf(part.id), {
            filter: ['blur(8px)', 'blur(0px)'],
            opacity: [0, visibleOpacity(part.to!)],
            duration: durationMs,
            ease: 'inOutQuad',
          }, 0);
        }
      }
      break;
    }

    case 'wipe':
    case 'circle': {
      removeOverlay = addOverlay(host, stage, technique, timeline, durationMs);
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
      // Накладка досчитала до полного покрытия сцены ровно к этому моменту:
      // снять её здесь же, синхронно, — значит ни разу не отдать браузеру
      // кадр, где накладки уже нет, а конечное состояние ещё не отрисовано.
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

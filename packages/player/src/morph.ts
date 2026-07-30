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
import type { ElementState } from '@player/core';
// Импорт «бочкой», а не по подпутям `animejs/timeline` и `animejs/engine`:
// замерено — сборка выходит побайтово одинаковой (178.28 КБ), потому что
// таймлайн и так тянет почти всё ядро движка. При равном размере выигрывает
// вариант, записанный в ADR-002.
import { createTimeline, engine } from 'animejs';

import type { SlideStates } from './render.js';

/**
 * Длительность перехода по умолчанию, секунды.
 *
 * Число одно на весь продукт и в схеме его нет: слайд описывает СОСТОЯНИЕ,
 * а не хронометраж перехода к себе. Автор управляет темпом расстановкой
 * слайдов по дорожке, а не отдельным полем длительности.
 */
export const MORPH_DURATION_S = 0.6;

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
 * Урезается расстоянием до следующего слайда. Переход, переживший смену
 * слайда, начал бы следующий не с текущей картинки, а с состояния прошлого
 * слайда — то есть скачком назад ровно в тот момент, когда зритель смотрит
 * на движение.
 */
export function morphSecondsFor(
  transition: 'morph' | 'cut',
  index: number,
  seconds: readonly number[],
): number {
  // Первому слайду ехать неоткуда: предыдущего состояния не существует.
  if (index === 0 || transition === 'cut') return 0;
  const next = seconds[index + 1];
  const gap = next === undefined ? Number.POSITIVE_INFINITY : next - seconds[index]!;
  return Math.max(0, Math.min(MORPH_DURATION_S, gap));
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

/**
 * Строит ведомый таймлайн перехода.
 *
 * Анимируются только `x`, `y`, `rotate`, `scaleX`, `scaleY` и `opacity` —
 * закрытый перечень `ANIMATABLE`, инвариант №8. Изменение `width`/`height`
 * между слайдами едет через `scaleX`/`scaleY`: модель хранит геометрию,
 * композитор двигает трансформацию.
 *
 * Порядок сборки трансформации проверен по исходнику anime.js
 * (`core/transforms.js`, список `validTransforms`): движок склеивает строку
 * как `translate(...) rotate(...) scale(...)`. Это ровно то, что нужно —
 * масштабируется невращённый бокс, потом поворачивается, потом сдвигается
 * центр. Смещение поэтому считается ПО ЦЕНТРАМ: `applyElement` крутит
 * элемент с `transform-origin` по умолчанию, то есть вокруг центра, и любая
 * другая точка отсчёта дала бы рывок на последнем кадре перехода.
 */
export function buildMorph(
  plan: readonly MorphPart[],
  nodes: ReadonlyMap<string, HTMLElement>,
  durationSeconds: number,
): MorphTimeline {
  disableEngineMainLoop();

  const durationMs = durationSeconds * 1000;
  const unmatchedMs = durationMs * UNMATCHED_FRACTION;
  const timeline = createTimeline({ autoplay: false });

  for (const part of plan) {
    if (part.role === 'absent') continue;
    const node = nodes.get(part.id);
    if (!node) {
      // Раскладку строил layoutStatesFor по этому же плану: если узла нет,
      // разошлись план и сцена. Молчать здесь — значит показать зрителю
      // переход, в котором часть элементов просто не участвует.
      throw new Error(`Переход ссылается на элемент «${part.id}», которого нет на сцене`);
    }

    // Участник перехода виден на всём его протяжении: гасит и проявляет
    // его opacity, а не visibility. Иначе уходящий исчез бы мгновенно,
    // а приходящий не мог бы проявиться вовсе.
    node.style.visibility = '';

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
    },
    get durationSeconds(): number {
      return durationSeconds;
    },
  };
}

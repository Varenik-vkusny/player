/**
 * Что зритель видит в секунду t.
 *
 * Сегмент линеен, слайды отсортированы по времени, поэтому «текущий слайд» —
 * это последний, чьё время уже наступило. Ведомость сохраняется полностью
 * (инвариант №2): модуль ничего не двигает сам, ему выставляют время,
 * посчитанное от аудио.
 *
 * Переход между слайдами — морфинг: соседние слайды сравниваются по составу
 * состояний, совпавшие элементы едут, несовпавшие уходят и приходят
 * (ADR-015). Само сравнение и построение таймлайна живут в `morph.ts`;
 * здесь только расписание — когда переход начинается и когда кончается.
 *
 * `transition: 'cut'` — намеренный разрыв, применяется мгновенно.
 */
import type { Element, Slide, Word } from '@player/core';
import { resolveTimeRef } from '@player/core';

import {
  buildMorph,
  layoutStatesFor,
  morphSecondsFor,
  planMorph,
  type MorphPart,
  type MorphTimeline,
} from './morph.js';
import { applyElement, renderScene, type SlideStates, type StageSize } from './render.js';

export interface SlideEngineOptions {
  host: HTMLElement;
  elements: readonly Element[];
  slides: readonly Slide[];
  words: readonly Word[];
  stage: StageSize;
}

/** Слайд с уже разрешёнными секундами: считаем один раз, а не каждый кадр. */
interface Scheduled {
  readonly seconds: number;
  readonly slide: Slide;
  /**
   * Сколько длится переход К ЭТОМУ слайду, секунды.
   *
   * Ноль означает срез: либо `transition: 'cut'`, либо первый слайд, которому
   * ехать неоткуда. Длительность урезана расстоянием до следующего слайда:
   * переход, переживший смену слайда, начал бы новый не с текущей картинки,
   * а с состояния прошлого слайда — то есть скачком.
   */
  readonly morphSeconds: number;
}

/** Переход, который сейчас идёт. */
interface Running {
  readonly index: number;
  readonly startSeconds: number;
  readonly timeline: MorphTimeline;
}

export class SlideEngine {
  readonly #host: HTMLElement;
  readonly #elements: readonly Element[];
  readonly #elementIds: readonly string[];
  readonly #stage: StageSize;
  readonly #scheduled: readonly Scheduled[];

  #nodes: Map<string, HTMLElement>;
  #active = -1;
  #running: Running | null = null;

  constructor(options: SlideEngineOptions) {
    this.#host = options.host;
    this.#elements = options.elements;
    this.#elementIds = options.elements.map((element) => element.id);
    this.#stage = options.stage;

    // Секунды считаются один раз на построении. Разрешать `TimeRef` каждый
    // кадр значило бы искать слово в транскрипте шестьдесят раз в секунду
    // ради числа, которое не меняется.
    const seconds = options.slides.map((slide) => resolveTimeRef(slide.at, options.words));
    this.#scheduled = options.slides.map((slide, index) => ({
      seconds: seconds[index]!,
      slide,
      morphSeconds: morphSecondsFor(slide.transition, index, seconds),
    }));

    this.#nodes = new Map();
    // Первый слайд стоит на нуле — это гарантия схемы, поэтому показать
    // начальное состояние можно без всяких «если».
    this.renderAt(0);
  }

  /** Узлы сцены: id элемента → узел. Нужны редактору и переходу. */
  get nodes(): ReadonlyMap<string, HTMLElement> {
    return this.#nodes;
  }

  /** Идёт ли сейчас переход. Редактор предупреждает автора про гейт внутри. */
  get isTransitioning(): boolean {
    return this.#running !== null;
  }

  /** Индекс слайда, который идёт в секунду `seconds`. */
  indexAt(seconds: number): number {
    let index = 0;
    for (let i = 0; i < this.#scheduled.length; i++) {
      if (this.#scheduled[i]!.seconds <= seconds) index = i;
      else break;
    }
    return index;
  }

  /** Слайд, который идёт в секунду `seconds`. */
  slideAt(seconds: number): Slide {
    return this.#scheduled[this.indexAt(seconds)]!.slide;
  }

  /**
   * Идёт ли переход в секунду `seconds`.
   *
   * Считается по расписанию, а не по текущему состоянию движка: редактору
   * нужно ответить про любой момент дорожки, не перематывая на него сцену.
   */
  transitionAt(seconds: number): boolean {
    const index = this.indexAt(seconds);
    const scheduled = this.#scheduled[index]!;
    if (scheduled.morphSeconds <= 0) return false;
    return seconds > scheduled.seconds && seconds < scheduled.seconds + scheduled.morphSeconds;
  }

  /**
   * Выставить время при воспроизведении.
   *
   * Пока переход идёт, время выставляется каждый кадр — в этом и состоит
   * ведомость (инвариант №2). Когда перехода нет, несменившийся слайд не
   * перерисовывается: перерисовка каждый кадр убивала бы узел под курсором
   * редактора вместе со всем, что на него ссылается. Дефект этого рода уже
   * находили в Сессии 2.
   */
  seekSeconds(seconds: number): void {
    const index = this.indexAt(seconds);
    if (index !== this.#active) this.#activate(index);
    this.#drive(seconds);
  }

  /**
   * Показать момент безусловно — для перемотки в редакторе и скриншотов.
   *
   * Отличается от `seekSeconds` тем, что не верит в текущее состояние DOM:
   * после структурной правки сцены узлы могли смениться, а после прыжка
   * времени назад переход мог остаться доигранным. Строится заново, поэтому
   * картинка зависит только от момента, но не от того, каким путём к нему
   * пришли.
   */
  renderAt(seconds: number): void {
    this.#running = null;
    this.#active = -1;
    this.#activate(this.indexAt(seconds));
    this.#drive(seconds);
  }

  /**
   * Мгновенно доводит незавершённый переход до конечного состояния.
   *
   * Решение [Р] из product.md §3: гейт встаёт в свою секунду, недоигранный
   * переход доводится мгновенно, и только потом открывается взаимодействие.
   * Зритель не отвечает поверх едущих элементов.
   *
   * Буквальное «доиграть переход» стоило бы 300–900 мс лишнего звука при
   * измеренном перелёте кадра 18.57 мс — то есть нарушило бы инвариант №4
   * в полсотни раз грубее, чем сама неточность обнаружения.
   */
  settle(): void {
    const running = this.#running;
    if (!running) return;
    running.timeline.finish();
    this.#running = null;
    this.#renderStates(this.#scheduled[running.index]!.slide.states as SlideStates);
  }

  #drive(seconds: number): void {
    const running = this.#running;
    if (!running) return;

    const elapsed = seconds - running.startSeconds;
    if (elapsed >= running.timeline.durationSeconds) {
      this.settle();
      return;
    }
    running.timeline.seekSeconds(elapsed);
  }

  /**
   * Ставит слайд `index` и, если переход к нему морфинг, готовит таймлайн.
   *
   * Раскладка на время перехода — объединение составов: уходящий элемент
   * обязан остаться в DOM, пока гаснет. Приводится к конечному составу
   * не здесь, а в `settle`, когда уходящие уже прозрачны.
   */
  #activate(index: number): void {
    const scheduled = this.#scheduled[index]!;
    const states = scheduled.slide.states as SlideStates;

    const previous = index > 0 && scheduled.morphSeconds > 0
      ? this.#scheduled[index - 1]!.slide.states as SlideStates
      : null;

    this.#active = index;

    if (!previous) {
      this.#running = null;
      this.#renderStates(states);
      return;
    }

    const plan = planMorph(this.#elementIds, previous, states);
    this.#renderStates(layoutStatesFor(plan));
    this.#applyStartOfMorph(plan);
    this.#running = {
      index,
      startSeconds: scheduled.seconds,
      timeline: buildMorph(plan, this.#nodes, scheduled.morphSeconds),
    };
  }

  /**
   * Ставит участников перехода в его начальное состояние ДО первого кадра.
   *
   * Без этого приходящий элемент виден на своём месте всю первую половину
   * перехода, хотя проявиться должен во второй: anime.js молчит, пока время
   * не дойдёт до старта его анимации. На большом скачке времени рендер
   * форсируется, и поведение выглядит исправным — ровно та ошибка, на
   * которой обожглись в S1 с нулевыми кадрами прежнего таймлайна.
   */
  #applyStartOfMorph(plan: readonly MorphPart[]): void {
    for (const part of plan) {
      if (part.role !== 'enters') continue;
      const node = this.#nodes.get(part.id);
      if (node) node.style.opacity = '0';
    }
  }

  /**
   * Приводит сцену к набору состояний.
   *
   * Состав узлов совпал — правим на месте, не пересобирая контейнер.
   * Пересборка уничтожает узел под курсором и всё, что на него ссылается.
   */
  #renderStates(states: SlideStates): void {
    const known = new Set(Object.keys(states));
    const sameShape = this.#nodes.size === known.size
      && [...this.#nodes.keys()].every((id) => known.has(id));

    if (sameShape) {
      for (const element of this.#elements) {
        const node = this.#nodes.get(element.id);
        const state = states[element.id];
        if (node && state) applyElement(node, element, state);
      }
      return;
    }
    this.#nodes = renderScene(this.#host, this.#elements, states, this.#stage);
  }

  destroy(): void {
    this.#host.textContent = '';
    this.#nodes = new Map();
    this.#active = -1;
    this.#running = null;
  }
}

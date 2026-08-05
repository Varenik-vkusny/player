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
 * (ADR-015). Сравнение, расписание и построение таймлайна живут в `morph.ts`
 * и проверяются без DOM; здесь только работа с узлами — что показать сейчас
 * и кому выставить время.
 *
 * `transition: 'cut'` — намеренный разрыв, применяется мгновенно.
 */
import type { Element, Slide, Word } from '@player/core';
import { resolveTimeRef } from '@player/core';

import {
  buildMorph,
  indexAt,
  layoutStatesFor,
  morphSecondsFor,
  phaseAt,
  planMorph,
  type MorphPart,
  type MorphTimeline,
  type Phase,
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
   * ехать неоткуда. Окно кончается на метке слайда и урезано расстоянием
   * до ПРЕДЫДУЩЕЙ метки (ADR-020).
   */
  readonly morphSeconds: number;
}

/** Переход, который сейчас идёт. */
interface Running {
  readonly index: number;
  readonly startSeconds: number;
  readonly timeline: MorphTimeline;
}

/** Одинаковы ли две фазы. Пересобирать сцену надо только при смене. */
function samePhase(a: Phase | null, b: Phase): boolean {
  return a !== null && a.kind === b.kind && a.index === b.index;
}

export class SlideEngine {
  readonly #host: HTMLElement;
  readonly #elements: readonly Element[];
  readonly #elementIds: readonly string[];
  readonly #stage: StageSize;
  readonly #scheduled: readonly Scheduled[];

  #nodes: Map<string, HTMLElement>;
  #phase: Phase | null = null;
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
      morphSeconds: morphSecondsFor(slide.transition, slide.transitionSeconds, index, seconds),
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
    return indexAt(this.#scheduled, seconds);
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
    return phaseAt(this.#scheduled, seconds).kind === 'morph';
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
    const phase = phaseAt(this.#scheduled, seconds);
    if (!samePhase(this.#phase, phase)) this.#activate(phase);
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
    // Переход БРОСАЕТСЯ, а не доводится, — значит за ним надо прибрать:
    // накладка «Шторы» и «Круга» иначе останется в DOM и закроет сцену.
    this.#running?.timeline.dispose();
    this.#running = null;
    this.#phase = null;
    this.#activate(phaseAt(this.#scheduled, seconds));
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
    // Внутри фазы перехода `elapsed` меньше длительности по построению:
    // конец окна и есть метка, а на метке фаза уже другая. Ветка остаётся
    // границей по плавающей точке — `(T − m) + m` не обязано дать ровно `T`.
    if (elapsed >= running.timeline.durationSeconds) {
      this.settle();
      return;
    }
    running.timeline.seekSeconds(elapsed);
  }

  /**
   * Приводит сцену к фазе: показывает снимок либо готовит таймлайн перехода.
   *
   * Раскладка на время перехода — объединение составов: уходящий элемент
   * обязан остаться в DOM, пока гаснет. Приводится к конечному составу
   * не здесь, а в `settle`, когда уходящие уже прозрачны.
   */
  #activate(phase: Phase): void {
    this.#phase = phase;

    if (phase.kind === 'still') {
      this.#running?.timeline.dispose();
      this.#running = null;
      this.#renderStates(this.#scheduled[phase.index]!.slide.states as SlideStates);
      return;
    }

    // Фаза `morph` бывает только у слайда с ненулевым переходом, а такой
    // слайд не может быть первым: `morphSecondsFor` даёт ему ноль.
    const scheduled = this.#scheduled[phase.index]!;
    const previous = this.#scheduled[phase.index - 1]!.slide.states as SlideStates;

    // Прежний переход, если он был, заменяется этим: его накладку снять
    // здесь, иначе накладки копятся одна поверх другой.
    this.#running?.timeline.dispose();

    const plan = planMorph(this.#elementIds, previous, scheduled.slide.states as SlideStates);
    this.#renderStates(layoutStatesFor(plan));
    this.#applyStartOfMorph(plan);
    this.#running = {
      index: phase.index,
      // Окно заканчивается на метке, значит начинается за длительность до неё.
      startSeconds: scheduled.seconds - scheduled.morphSeconds,
      timeline: buildMorph(
        plan,
        this.#nodes,
        scheduled.morphSeconds,
        scheduled.slide.transition,
        this.#host,
        this.#stage,
      ),
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
    this.#phase = null;
    this.#running = null;
  }
}

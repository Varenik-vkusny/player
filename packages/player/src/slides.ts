/**
 * Что зритель видит в секунду t.
 *
 * Сегмент линеен, слайды отсортированы по времени, поэтому «текущий слайд» —
 * это последний, чьё время уже наступило. Ведомость сохраняется полностью
 * (инвариант №2): модуль ничего не двигает сам, ему выставляют время,
 * посчитанное от аудио.
 *
 * В этой фазе переход между слайдами — срез: состояния применяются мгновенно.
 * Морфинг встанет сюда же, в `#activate`, и заменит мгновенное применение
 * интерполяцией `transform` и `opacity` через FLIP. Модуль устроен так, чтобы
 * это была одна правка, а не переписывание: наружу он обещает ровно
 * «покажи момент t», и это обещание морфинг не меняет.
 */
import type { Element, Slide, Word } from '@player/core';
import { resolveTimeRef } from '@player/core';

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
}

export class SlideEngine {
  readonly #host: HTMLElement;
  readonly #elements: readonly Element[];
  readonly #stage: StageSize;
  readonly #scheduled: readonly Scheduled[];

  #nodes: Map<string, HTMLElement>;
  #active = -1;

  constructor(options: SlideEngineOptions) {
    this.#host = options.host;
    this.#elements = options.elements;
    this.#stage = options.stage;

    // Секунды считаются один раз на построении. Разрешать `TimeRef` каждый
    // кадр значило бы искать слово в транскрипте шестьдесят раз в секунду
    // ради числа, которое не меняется.
    this.#scheduled = options.slides.map((slide) => ({
      seconds: resolveTimeRef(slide.at, options.words),
      slide,
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
   * Выставить время при воспроизведении.
   *
   * Ничего не делает, если слайд не сменился: перерисовывать сцену каждый
   * кадр значило бы убивать узел под курсором редактора вместе со всем,
   * что на него ссылается. Дефект этого рода уже находили в Сессии 2.
   */
  seekSeconds(seconds: number): void {
    const index = this.indexAt(seconds);
    if (index === this.#active) return;
    this.#activate(index);
  }

  /**
   * Показать момент безусловно — для перемотки в редакторе и скриншотов.
   *
   * Отличается от `seekSeconds` тем, что не верит в текущее состояние DOM:
   * после структурной правки сцены узлы могли смениться.
   */
  renderAt(seconds: number): void {
    this.#active = -1;
    this.#activate(this.indexAt(seconds));
  }

  #activate(index: number): void {
    const states = this.#scheduled[index]!.slide.states as SlideStates;
    const known = new Set(Object.keys(states));

    // Состав узлов совпал — правим на месте, не пересобирая контейнер.
    // Пересборка уничтожает узел под курсором и всё, что на него ссылается.
    const sameShape = this.#nodes.size === known.size
      && [...this.#nodes.keys()].every((id) => known.has(id));

    if (sameShape) {
      for (const element of this.#elements) {
        const node = this.#nodes.get(element.id);
        const state = states[element.id];
        if (node && state) applyElement(node, element, state);
      }
    } else {
      this.#nodes = renderScene(this.#host, this.#elements, states, this.#stage);
    }

    this.#active = index;
  }

  destroy(): void {
    this.#host.textContent = '';
    this.#nodes = new Map();
    this.#active = -1;
  }
}

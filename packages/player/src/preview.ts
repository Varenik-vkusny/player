/**
 * Немой предпросмотр сцены: картинка на заданном моменте, без звука.
 *
 * Зачем отдельный узел, если есть класс Player. Player — это часы, гейты
 * и rAF-цикл, то есть всё, что нужно ЗРИТЕЛЮ. Он намеренно не умеет ни
 * перемотки, ни паузы. Но «показать сцену на секунде T» нужно и редактору,
 * и скриншотным тестам, а звука для этого не требуется вовсе: время берётся
 * из аргумента, а не из дорожки. Часть фикстур вообще не имеет аудиофайла
 * на диске, и открыть их через Player невозможно.
 *
 * Инвариант №5 при этом не задет: рисует по-прежнему renderScene, а точечные
 * правки идут через applyElement — ту же самую функцию, что и при полном
 * рендере. Второй реализации здесь по-прежнему неоткуда взяться.
 */
import { findSegment as findSegment } from '@player/core';
import type { Element, ElementState, Gate, Project, Slide, Word } from '@player/core';

import type { AudioSource } from './assets.js';
import { applyElement, applyFit, type Fit, type StageSize } from './render.js';
import { SlideEngine } from './slides.js';

/**
 * Сегмент объяснения: своя непрерывная озвучка, свои элементы, свои слайды.
 *
 * Это ДВЕРЦА. Единственное место, через которое плеер, предпросмотр
 * и редактор видят содержимое объяснения. Дисциплина себя уже оправдала дважды:
 * переход «одна сцена → граф узлов» (v2) и «граф узлов → объяснение из сегментов»
 * (v3) поменяли эту функцию, а не всё, что стоит выше.
 */
export interface Segment {
  /**
   * Откуда берётся озвучка этого сегмента: файл на сервере или файл,
   * загруженный автором (схема v6).
   *
   * Размеченное объединение, а не строка. Выше по коду никто не разбирает
   * адрес и не знает про IndexedDB: превращение источника в адрес происходит
   * ровно в одном месте — `AudioClocks.clockFor`.
   */
  readonly source: AudioSource;
  /**
   * С какой секунды файла звучит этот сегмент (схема v4).
   *
   * Несколько сегментов могут делить один файл разными окнами — так
   * выражено решение [Р] «аудио физически не режется». ВАЖНО: всё остальное
   * в этом интерфейсе — слова, слайды, гейты, `duration` — живёт
   * в координатах САМОГО сегмента, от нуля. Смещение нужно ровно там, где
   * время сегмента переводится в позицию внутри файла, и больше нигде.
   */
  readonly offset: number;
  readonly words: readonly Word[];
  readonly duration: number;
  readonly elements: readonly Element[];
  readonly slides: readonly Slide[];
  readonly gates: readonly Gate[];
  readonly stage: StageSize;
}

/**
 * Достаёт сегмент по идентификатору.
 *
 * Сегмент передаётся явно, а не берётся по умолчанию: код, который не сказал,
 * какой сегмент он показывает, почти наверняка ошибается.
 */
export function segmentOf(project: Project, segmentId: string): Segment {
  // Поиск сегмента берётся из ядра, а не повторяется здесь: два описания одного
  // действия расходятся тихо, и первым разойдётся текст ошибки (ADR-004).
  const segment = findSegment(project, segmentId);
  const { src, fileId } = segment.audio;
  // Схема гарантирует ровно один источник (`.refine` над audio), поэтому
  // ветвление здесь исчерпывающее, а не «на всякий случай».
  const source: AudioSource = src !== undefined
    ? { kind: 'url', url: src }
    : { kind: 'file', fileId: fileId as string };
  return {
    source,
    offset: segment.audio.offset,
    words: segment.audio.words,
    duration: segment.audio.duration,
    elements: segment.elements,
    slides: segment.slides,
    gates: segment.gates,
    stage: { width: project.meta.stageWidth, height: project.meta.stageHeight },
  };
}

/** Сегмент, с которого начинается объяснение. */
export function entrySegmentOf(project: Project): string {
  return project.entry;
}

/**
 * Все сегменты объяснения, каждый через ту же дверцу, что и `segmentOf`.
 *
 * Нужно повтору куска (`repeat.ts`): виновную остановку ищут по ВСЕМУ
 * объяснению, а не по одному сегменту, потому что переменную мог записать
 * гейт из другого куска (ответы живут на всё объяснение, не на сегмент).
 * Перечисление идентификаторов костяка — не обращение к содержимому, но сам
 * перебор сегментов всё равно идёт через `segmentOf`, чтобы вне этого файла
 * не завелось второго способа читать `project.segments`.
 */
export function allSegments(project: Project): readonly Segment[] {
  return project.segments.map((segment) => segmentOf(project, segment.id));
}

/**
 * Сцена, которую можно поставить на любой момент и точечно править.
 *
 * Владеет содержимым контейнера целиком. Хост (React или ванильный) отдаёт
 * свой узел и внутрь больше не заглядывает.
 */
export class ScenePreview {
  readonly #host: HTMLElement;
  #segment: Segment;
  #engine: SlideEngine;
  #position = 0;
  #destroyed = false;

  constructor(host: HTMLElement, segment: Segment) {
    this.#host = host;
    this.#segment = segment;
    this.#engine = this.#build(segment);
  }

  /** Момент, на котором сейчас стоит сцена, секунды. */
  get positionSeconds(): number {
    return this.#position;
  }

  /** Узлы сцены по id элемента. Отдаётся только на чтение. */
  get nodes(): ReadonlyMap<string, HTMLElement> {
    this.#assertAlive();
    return this.#engine.nodes;
  }

  get segment(): Segment {
    return this.#segment;
  }

  /** Слайд, который идёт на текущем моменте. */
  get slide(): Slide {
    this.#assertAlive();
    return this.#engine.slideAt(this.#position);
  }

  /**
   * Ставит сцену на указанный момент.
   *
   * Через renderAt, а не seekSeconds: предпросмотром пользуются редактор
   * и скриншотные тесты, а там время прыгает в обе стороны. Картинка обязана
   * зависеть только от момента, но не от того, каким путём к нему пришли.
   */
  seek(seconds: number): void {
    this.#assertAlive();
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError(`Некорректный момент: ${seconds}`);
    }
    this.#position = seconds;
    this.#engine.renderAt(seconds);
  }

  /**
   * Обновляет один элемент, не пересобирая сцену.
   *
   * Ради этого applyElement и стала публичной: renderScene начинается
   * с очистки контейнера, а значит при перетаскивании убивала бы узел
   * под курсором вместе со всем, что на него ссылается.
   */
  updateElement(element: Element, state: ElementState): void {
    this.#assertAlive();
    const node = this.#engine.nodes.get(element.id);
    if (!node) {
      throw new Error(`Элемента «${element.id}» нет на сцене: обновлять нечего`);
    }
    applyElement(node, element, state);
  }

  /**
   * Пересобирает сцену под новый сегмент и возвращается на текущий момент.
   *
   * Нужно после структурной правки: добавления или удаления элемента,
   * правки слайдов, смены озвучки. Для перемещения одного элемента
   * это слишком крупный молоток — есть updateElement.
   */
  rebuild(segment: Segment): void {
    this.#assertAlive();
    this.#segment = segment;
    this.#engine.destroy();
    this.#engine = this.#build(segment);
    this.#engine.renderAt(this.#position);
  }

  /** Вписывает сцену в размеры контейнера. Масштаб возвращается вызывающему. */
  fit(hostWidth: number, hostHeight: number): Fit {
    this.#assertAlive();
    return applyFit(this.#host, hostWidth, hostHeight, this.#segment.stage);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#engine.destroy();
    this.#destroyed = true;
  }

  #build(segment: Segment): SlideEngine {
    return new SlideEngine({
      host: this.#host,
      elements: segment.elements,
      slides: segment.slides,
      words: segment.words,
      stage: segment.stage,
    });
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('ScenePreview уже уничтожен');
  }
}

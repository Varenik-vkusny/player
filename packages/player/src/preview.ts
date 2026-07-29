/**
 * Немой предпросмотр сцены: картинка на заданном моменте, без звука.
 *
 * Зачем отдельный узел, если есть класс Player. Player — это часы, гейты
 * и rAF-цикл, то есть всё, что нужно ЗРИТЕЛЮ. Он намеренно не умеет ни
 * перемотки, ни паузы. Но «показать сцену на секунде T» нужно и редактору,
 * и скриншотным тестам, а звука для этого не требуется вовсе: время берётся
 * из аргумента, а не из дорожки. Три фикстуры из пяти вообще не имеют
 * аудиофайла на диске, и открыть их через Player невозможно.
 *
 * Инвариант №5 при этом не задет: рисует по-прежнему renderScene, а точечные
 * правки идут через applyElement — ту же самую функцию, что и при полном
 * рендере. Второй реализации здесь по-прежнему неоткуда взяться.
 */
import type { Element, Project, Scene, Word } from '@player/core';

import {
  applyElement,
  applyFit,
  renderScene,
  type Fit,
  type StageSize,
} from './render.js';
import { buildTimeline, disableEngineMainLoop, type DrivenTimeline } from './timeline.js';

/**
 * Отрезок объяснения: своя озвучка, своя сцена.
 *
 * Сегодня сегмент ровно один и совпадает со всем проектом. Названо так
 * не на вырост, а чтобы шов существовал: планируется, что проект станет
 * графом сегментов, у каждой ноды своя дорожка и своя сцена
 * (docs/planning.md §5а). Когда это случится, поменяется segmentOf,
 * а не всё, что стоит выше.
 */
export interface Segment {
  /** Путь к озвучке этого отрезка. */
  readonly src: string;
  readonly words: readonly Word[];
  readonly duration: number;
  readonly scene: Scene;
  readonly stage: StageSize;
}

/**
 * Достаёт сегмент указанного узла.
 *
 * Единственная точка, через которую плеер, предпросмотр и редактор видят
 * озвучку и сцену. Узел передаётся явно, а не берётся по умолчанию: код,
 * который не сказал, какой узел он показывает, почти наверняка ошибается.
 */
export function segmentOf(project: Project, nodeId: string): Segment {
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Узла «${nodeId}» нет в проекте`);
  }
  return {
    src: node.audio.src,
    words: node.audio.words,
    duration: node.audio.duration,
    scene: node.scene,
    stage: { width: project.meta.stageWidth, height: project.meta.stageHeight },
  };
}

/** Узел, с которого начинается объяснение. */
export function entryNodeOf(project: Project): string {
  return project.entry;
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
  #nodes: Map<string, HTMLElement>;
  #timeline: DrivenTimeline;
  #position = 0;
  #destroyed = false;

  constructor(host: HTMLElement, segment: Segment) {
    // Тот же выключатель, что зовёт Player. Идемпотентен и глобален:
    // главного цикла движка не должно существовать ни в одном хосте.
    disableEngineMainLoop();
    this.#host = host;
    this.#segment = segment;
    const built = this.#build(segment);
    this.#nodes = built.nodes;
    this.#timeline = built.timeline;
    this.#timeline.renderAt(0);
  }

  /** Момент, на котором сейчас стоит сцена, секунды. */
  get positionSeconds(): number {
    return this.#position;
  }

  /** Узлы сцены по id элемента. Отдаётся только на чтение. */
  get nodes(): ReadonlyMap<string, HTMLElement> {
    this.#assertAlive();
    return this.#nodes;
  }

  get segment(): Segment {
    return this.#segment;
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
    this.#timeline.renderAt(seconds);
  }

  /**
   * Обновляет один элемент, не пересобирая сцену.
   *
   * Ради этого applyElement и стала публичной: renderScene начинается
   * с очистки контейнера, а значит при перетаскивании убивала бы узел
   * под курсором вместе с таймлайном, который на него ссылается.
   *
   * Геометрию меняем точечно, но состояние анимаций после этого обязано
   * вернуться: applyElement стирает всё, что накрутил таймлайн.
   */
  updateElement(element: Element): void {
    this.#assertAlive();
    const node = this.#nodes.get(element.id);
    if (!node) {
      throw new Error(`Элемента «${element.id}» нет на сцене: обновлять нечего`);
    }
    applyElement(node, element);
    this.#timeline.renderAt(this.#position);
  }

  /**
   * Пересобирает сцену под новый сегмент и возвращается на текущий момент.
   *
   * Нужно после структурной правки: добавления или удаления элемента,
   * правки анимаций, смены озвучки. Для перемещения одного элемента
   * это слишком крупный молоток — есть updateElement.
   */
  rebuild(segment: Segment): void {
    this.#assertAlive();
    this.#segment = segment;
    const built = this.#build(segment);
    this.#nodes = built.nodes;
    this.#timeline = built.timeline;
    this.#timeline.renderAt(this.#position);
  }

  /** Вписывает сцену в размеры контейнера. Масштаб возвращается вызывающему. */
  fit(hostWidth: number, hostHeight: number): Fit {
    this.#assertAlive();
    return applyFit(this.#host, hostWidth, hostHeight, this.#segment.stage);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#host.textContent = '';
    this.#nodes.clear();
    this.#destroyed = true;
  }

  #build(segment: Segment): { nodes: Map<string, HTMLElement>; timeline: DrivenTimeline } {
    const nodes = renderScene(this.#host, segment.scene, segment.stage);
    const timeline = buildTimeline(segment.scene.cues, nodes, segment.words, {
      audioDuration: segment.duration,
    });
    return { nodes, timeline };
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('ScenePreview уже уничтожен');
  }
}

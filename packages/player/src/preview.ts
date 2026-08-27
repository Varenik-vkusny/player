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
import type { AuthorSpan, Element, ElementState, Gate, Project, Slide, Style, Theme, Word } from '@player/core';

import type { AudioSource } from './assets.js';
import { applyElement, applyFit, type AssetUrls, type Fit, type StageSize, type Zoom } from './render.js';
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
  /**
   * Отрезки авторского владения (схема v14, ADR-032).
   *
   * Едут ЧЕРЕЗ ЭТУ ДВЕРЦУ, а не читаются плеером из `project.segments`
   * напрямую. Дисциплина «доступ к сегментам в одном месте» окупилась дважды
   * на переходах v1→v2 и v2→v3: менялась одна функция, а не всё, что стоит
   * выше. Первый же обход кончил бы её.
   *
   * Времена — в координатах САМОГО сегмента, как слайды и гейты. Разрешать
   * их в секунды здесь нельзя: `TimeRef` разрешается через `resolveTimeRef`
   * ровно там, где известны слова, и второе место разрешения разошлось бы
   * с первым (инвариант №10).
   */
  readonly authorSpans: readonly AuthorSpan[];
  readonly stage: StageSize;
  /**
   * Тема сцены (схема v9). Едет здесь, а не отдельным аргументом, потому что
   * это единственная точка, из которой вид-модель получают ОБА хоста —
   * плеер и предпросмотр редактора. Инвариант №5 соблюдается сам собой:
   * второго места, где тему можно было бы применить иначе, не существует.
   */
  readonly theme: Theme;
  /**
   * Стили проекта (схема v12). Едут здесь по той же причине, что и тема:
   * это единственная точка, из которой вид-модель получают ОБА хоста.
   *
   * Проектные, а не сегментные, и это не небрежность: стиль — нижняя ступень
   * шаблонов (`design/styles.md` §4а), и «Заголовок», меняющийся от сегмента
   * к сегменту, шаблоном бы не был.
   */
  readonly styles: readonly Style[];
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
  // Схема гарантирует НЕ БОЛЬШЕ одного источника (`.superRefine` над audio),
  // поэтому ветвление здесь исчерпывающее, а не «на всякий случай».
  // Третий случай — немой сегмент (v13): источника нет, длительность объявлена.
  let source: AudioSource;
  if (src !== undefined) source = { kind: 'url', url: src };
  else if (fileId !== undefined) source = { kind: 'file', fileId };
  else source = { kind: 'silent', seconds: segment.audio.duration };
  return {
    source,
    offset: segment.audio.offset,
    words: segment.audio.words,
    duration: segment.audio.duration,
    elements: segment.elements,
    slides: segment.slides,
    gates: segment.gates,
    authorSpans: segment.authorSpans,
    stage: { width: project.meta.stageWidth, height: project.meta.stageHeight },
    theme: project.meta.theme,
    styles: project.styles,
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
  /**
   * Адреса байтов проекта (схема v17) — картинки и вшитые шрифты.
   *
   * Инвариант №5: редактор показывает то же, что и плеер, поэтому карта
   * едет здесь же, а не заводится вторым путём для StageView/SlideStrip.
   * Опциональна: предпросмотром пользуются и скриншотные фикстуры без
   * единого импортированного байта.
   */
  #assets: AssetUrls | undefined;

  constructor(host: HTMLElement, segment: Segment, assets?: AssetUrls) {
    this.#host = host;
    this.#segment = segment;
    this.#assets = assets;
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
    applyElement(node, element, state, this.#assets);
  }

  /**
   * Пересобирает сцену под новый сегмент и возвращается на текущий момент.
   *
   * Нужно после структурной правки: добавления или удаления элемента,
   * правки слайдов, смены озвучки. Для перемещения одного элемента
   * это слишком крупный молоток — есть updateElement.
   *
   * `assets` — необязательный: адреса байтов обычно приходят раз при
   * загрузке проекта и живут дольше отдельной структурной правки. Аргумент
   * нужен ровно на случай, когда карта разрешилась ПОСЛЕ первой сборки
   * (байты — асинхронное хранилище, сцена — синхронная, ловушка №2
   * задания) или автор только что импортировал новую картинку.
   * Опущен — прежняя карта остаётся в силе.
   */
  rebuild(segment: Segment, assets?: AssetUrls): void {
    this.#assertAlive();
    this.#segment = segment;
    if (assets !== undefined) this.#assets = assets;
    this.#engine.destroy();
    this.#engine = this.#build(segment);
    this.#engine.renderAt(this.#position);
  }

  /**
   * Вписывает сцену в размеры контейнера. Масштаб возвращается вызывающему.
   *
   * `zoom` — масштаб, заданный автором вместо вписывания (Сессия 32); разбор
   * смысла и довод, почему формула живёт в `render.ts`, — там же, у `fitStage`.
   */
  fit(hostWidth: number, hostHeight: number, zoom: Zoom = 'fit'): Fit {
    this.#assertAlive();
    return applyFit(this.#host, hostWidth, hostHeight, this.#segment.stage, zoom);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#engine.destroy();
    this.#destroyed = true;
  }

  #build(segment: Segment): SlideEngine {
    return new SlideEngine({
      host: this.#host,
      theme: segment.theme,
      styles: segment.styles,
      elements: segment.elements,
      slides: segment.slides,
      words: segment.words,
      stage: segment.stage,
      // Разворачивается условно, а не пишется `assets: this.#assets`: при
      // `exactOptionalPropertyTypes` явный `undefined` в необязательное поле
      // запрещён. Подставлять пустую карту вместо этого нельзя — «карты нет»
      // и «карта пуста» разные состояния, и разница ещё пригодится.
      ...(this.#assets === undefined ? {} : { assets: this.#assets }),
    });
  }

  #assertAlive(): void {
    if (this.#destroyed) throw new Error('ScenePreview уже уничтожен');
  }
}

/**
 * Рантайм плеера: часы, ведомый таймлайн, рендер и гейты в одном месте.
 *
 * Главный принцип: всё на экране — чистая функция от одного числа, позиции
 * в аудио. Каждый кадр это число берётся у часов и раздаётся остальным.
 */
import type { Answer, Condition, ExitChoice, Gate, Project } from '@player/core';
import {
  certainRemaining,
  conditionsHold,
  nextExit,
  preloadTargetsOfExit,
  resolveTimeRef,
  findSegment,
} from '@player/core';

import {
  applyOwnership, bubbleElementOf, clearOwnership, ownerAt, type ViewerState,
} from './bubble.js';
import { releaseProjectAssets, resolveProjectAssets } from './assets.js';
import { AudioClocks, type Clock, type ClockSource, type EditorClock } from './clock.js';
import { applyFit, applyFonts, type AssetUrls } from './render.js';
import { allSegments, entrySegmentOf, segmentOf, type Segment } from './preview.js';
import { answersToClear, openableGates } from './repeat.js';
import { SlideEngine } from './slides.js';
import { collectVideos, pauseVideos, startVideos, syncVideos } from './video.js';

/**
 * `at-reveal` — открыт разбор на месте: гейт уже отвечен неверно, ответ
 * записан, зритель читает объяснение и жмёт «дальше». Это НЕ то же, что
 * `at-gate`: отвечать больше нечего, и сцена снова недоступна для мыши.
 * Без отдельного состояния зритель мог бы кликнуть по варианту ответа
 * поверх открытого разбора и потратить попытку, которой уже нет.
 */
export type PlayerState =
  | 'idle' | 'loading' | 'ready' | 'playing' | 'at-gate' | 'at-reveal' | 'ended';

/** Ответ зрителя: id варианта, введённое слово либо ничего для «дальше». */
export type GateAnswer = string | undefined;

export interface GateAttempt {
  gate: Gate;
  correct: boolean;
  attemptsUsed: number;
  /** Что делать дальше — вычислено из onWrong и maxAttempts. */
  outcome: 'continue' | 'retry' | 'reveal';
}

/**
 * Вариант выбора, не нашедший себе элемента на сцене (ADR-011).
 *
 * Форма совпадает с `ChoiceConfig.options[number]`, но описана отдельно:
 * ядру не нужно знать, что часть его вариантов рисует плеер, а часть —
 * оснастка снаружи.
 */
export interface UnboundOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Разбор на месте: что показать зрителю, не покидая сегмент.
 *
 * Плеер отвечает за ПОВЕДЕНИЕ разбора — дорожка стоит, сцена недоступна,
 * продолжение только по `continueAfterReveal`. Чем именно заполнен слой,
 * решает оснастка: у плеера нет и не должно быть представления о вёрстке
 * (ADR-011, тот же раздел ответственности, что и у вариантов ответа).
 *
 * Своего текста разбора в схеме v3 нет намеренно: содержимое разбора —
 * это блок из библиотеки, а библиотеки ещё нет. Пока плеер отдаёт то,
 * что знает точно: какой гейт, насколько подробно объяснять и какой
 * вариант был верным.
 */
export interface Reveal {
  readonly gate: Gate;
  /** Полный разбор или короткая подсказка. Разные `onWrong` — разная длина. */
  readonly kind: 'inline-explain' | 'inline-hint';
  /** Верный вариант — только у гейта-выбора. У ввода и «дальше» его нет. */
  readonly correctOption: { readonly id: string; readonly label: string } | undefined;
}

/**
 * Где зритель находится в объяснении — два уровня сразу.
 *
 * Нижний (`positionSeconds` / `durationSeconds`) точен всегда: глава линейна.
 * Верхний честен ровно настолько, насколько может быть, и различие между
 * «знаю» и «не знаю» вынесено в тип, а не спрятано за подставленным числом.
 *
 * СЛОВО ОДНО НА ВСЕХ — «глава», и для автора, и для зрителя (решение
 * владельца 15.08.2026, `product.md` §2з). Прежние `partIndex`/`partsLeft`
 * переименованы вместе со строкой на экране: разные слова в коде и в подписи
 * расходятся молча, и однажды в интерфейс возвращается то, которое убрали.
 */
export interface PlaybackProgress {
  /** Номер текущей главы в пути ЭТОГО зрителя, начиная с единицы. */
  readonly chapterIndex: number;
  /**
   * Сколько глав осталось после текущей.
   *
   * `null` — впереди развилка: длина зависит от ответов, которых ещё нет.
   * Ни процент, ни «глава 3 из 7» в этот момент не являются правдой.
   */
  readonly chaptersLeft: number | null;
  /** Позиция внутри текущей главы, секунды. */
  readonly positionSeconds: number;
  /** Длительность текущей главы, секунды. */
  readonly durationSeconds: number;
}

export interface PlayerEvents {
  onStateChange?: (state: PlayerState) => void;
  /**
   * Гейт открылся. `unboundOptions` — варианты `choice`, чей `id` не совпал
   * ни с одним элементом сцены: их и только их оснастка обязана дорисовать
   * кнопками (ADR-011). Для `continue` и `input`, а также для `choice`,
   * у которого совпали все варианты, массив пуст.
   */
  onGateOpen?: (gate: Gate, unboundOptions: readonly UnboundOption[]) => void;
  onGateResolved?: (attempt: GateAttempt) => void;
  /** Открылся разбор на месте. Слой рисует оснастка, время держит плеер. */
  onRevealOpen?: (reveal: Reveal) => void;
  onFrame?: (positionSeconds: number) => void;
}

interface ScheduledGate {
  gate: Gate;
  at: number;
}

/**
 * За сколько до конца узла начинать греть дорожку следующего.
 *
 * S9: декодирование 49-секундной дорожки — 63 мс, то есть четыре кадра.
 * Двух секунд хватает с запасом даже на длинную дорожку и занятую машину.
 */
const PRELOAD_AHEAD_S = 2;

/**
 * За сколько до конца узла планировать старт следующего.
 *
 * Планировать раньше нельзя: до этого момента зритель ещё может доехать
 * до гейта, и запланированный старт пришлось бы снимать.
 */
const SCHEDULE_AHEAD_S = 0.4;

export class Player {
  readonly #host: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #project: Project;
  readonly #events: PlayerEvents;

  /** Узел, который играет сейчас. Меняется на рёбрах графа. */
  #nodeId: string;
  #segment: Segment;

  /**
   * Откуда берутся часы. Плеер их НЕ конструирует — он их просит.
   *
   * Долг §13.1 закрыт здесь: пока реализация одна, извлечение механическое,
   * а когда появится вторая (`timer` для немого объяснения, `manual` для
   * тренажёра), это станет переписыванием под давлением.
   */
  readonly #clocks: ClockSource;

  /**
   * Часы следующего узла, запланированные РОВНО на конец текущего.
   *
   * Так устроен стык по ребру «конец узла»: S9 намерил, что обнаружение
   * конца опросом в кадре даёт задержку 65 мс (это унаследованный
   * `outputLatency`, а не длина кадра) и щелчок на одном переходе
   * из двадцати. Расписание даёт ноль и по разрывам, и по задержке.
   */
  #pending: { clock: Clock; nodeId: string; startsAt: number; choice: ExitChoice } | null = null;

  /** Исход последней разобранной попытки: им выбирается ребро графа. */
  /**
   * Ответы зрителя, накопленные за всё объяснение.
   *
   * Живут на объяснении, а не на сегменте, и переживают переходы: выход сегмента
   * вправе опереться на ответ, данный раньше. Именно поэтому поле не
   * очищается в mountSegment вместе со счётчиком попыток — попытки
   * принадлежат гейту, ответы принадлежат зрителю.
   */
  #answers: Record<string, Answer> = {};

  #clock: Clock | null = null;
  #slides: SlideEngine | null = null;
  #gates: ScheduledGate[] = [];
  #nextGateIndex = 0;
  #attempts = new Map<string, number>();
  #state: PlayerState = 'idle';
  #frameHandle: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  /** id вариантов, помеченных сейчас как кликабельные элементы гейта — снимается при выходе. */
  #markedOptionIds: string[] = [];
  /** Фигуры вариантов, погашенных условием, и их прежняя прозрачность. */
  #hiddenOptions: { readonly id: string; readonly opacity: string }[] = [];
  #reveal: Reveal | null = null;
  /**
   * Что зритель сделал с каплей (v14, ADR-032).
   *
   * Ключ — id элемента, и карта НЕ ЧИСТИТСЯ при смене главы: решение
   * владельца 13.08.2026 — правки зрителя живут до ближайшего отрезка «моё»,
   * а не сбрасываются на границе главы. Отодвинул голову, чтобы не мешала, —
   * она не выпрыгивает обратно на каждой новой главе. Это его настройка,
   * как громкость.
   */
  #viewerBubbles = new Map<string, ViewerState>();
  /**
   * Орган управления зрителя. Собственный узел плеера, а не элемент сцены.
   *
   * Отдельным узлом, потому что свёрнутая капля ужата в точку: кнопка внутри
   * неё ужалась бы вместе с ней, и вернуть каплю стало бы нечем. Управление,
   * умеющее только выключать, — тупик.
   */
  #bubbleToggle: HTMLButtonElement | null = null;
  /**
   * Сколько частей зритель уже прошёл. Считается ходом, а не выводится
   * из проекта: пройденный путь — свойство ЭТОГО просмотра, и при ветвлении
   * у двух зрителей он разный.
   */
  #chaptersPassed = 0;

  /**
   * Куски, которые зритель уже слышал в этом просмотре.
   *
   * Проверяется ФАКТОМ, а не разметкой автора: правило выхода не знает,
   * вперёд оно ведёт или назад, и знать не может — граф не дерево. Значит
   * «повтор» может определить только тот, кто помнит, где уже был.
   */
  #visited = new Set<string>();
  /**
   * Остановки, на которые зритель уже отвечал в этом просмотре.
   *
   * НЕ то же самое, что `#answers`: туда предпросмотр «смотреть как зритель,
   * ответивший X» засевает чужие ответы заранее (см. конструктор), и если
   * считать следом сам ответ, эти остановки замолчали бы, не открывшись
   * ни разу. След — отдельное множество идентификаторов.
   */
  #answeredHere = new Set<string>();
  /** Играет ли сейчас уже слышанный кусок — для надписи зрителю (`isRepeating`). */
  #repeating = false;

  /** Стенд автора: разрешена ли перемотка (ADR-036). У зрителя всегда false. */
  #standSeek = false;

  /**
   * Адреса байтов проекта — картинок и вшитых шрифтов (схема v17).
   *
   * Разрешается ЦЕЛИКОМ в `load()`, до сборки первой сцены: отрисовка
   * синхронная, хранилище байтов — нет, и без этого слайд моргнул бы
   * пустыми местами (ловушка №2 задания). Пуста, пока `load()` не отработал.
   */
  #assets: AssetUrls = new Map();

  /**
   * Часы передаются четвёртым аргументом со значением по умолчанию.
   *
   * Умолчание оставлено осознанно и ровно ради инварианта №9: встраивание
   * в голый HTML обязано оставаться одной строкой, а не сборкой трёх
   * объектов вручную. Ключевое требование долга §13.1 при этом выполнено —
   * ВНУТРИ плеера `new AudioClock` больше не встречается ни разу, поэтому
   * вторая реализация подставляется без единой правки здесь.
   */
  constructor(
    host: HTMLElement,
    project: Project,
    events: PlayerEvents = {},
    clocks: ClockSource = new AudioClocks(),
    /**
     * Кем плеер должен притвориться. У настоящего зрителя пусто всегда.
     *
     * Непусто только в режиме автора «смотреть как зритель, ответивший X»:
     * без него условные варианты ответа физически непроверяемы — редактор
     * показывает все, а зритель видит часть, и увидеть эту часть автору
     * иначе негде.
     *
     * `startSegmentId` здесь не удобство, а условие работоспособности.
     * Начав с самого начала, плеер ПЕРЕСПРОСИТ ту же переменную и затрёт
     * заданный ответ своим — то есть режим не сработал бы ровно в том
     * сценарии, ради которого заведён. Найдено проверкой в браузере,
     * а не рассуждением.
     */
    assume: {
      readonly answers?: Readonly<Record<string, Answer>>;
      readonly startSegmentId?: string;
      /**
       * СТЕНД АВТОРА: разрешить перемотку (ADR-036).
       *
       * У зрителя всегда пусто, и это не договорённость, а устройство:
       * без признака `seek` БРОСАЕТ. Чтобы перемотка появилась у зрителя,
       * надо переписать вызов конструктора — то есть это видно в диффе,
       * а не прячется в поведении.
       */
      readonly standSeek?: boolean;
    } = {},
  ) {
    this.#answers = { ...assume.answers };
    this.#standSeek = assume.standSeek === true;
    this.#host = host;
    this.#clocks = clocks;
    // Единственная точка чтения project.audio и project.scene (ADR-003,
    // ADR-011): переход на граф сегментов поменял segmentOf, а не Player.
    this.#project = project;
    // Несуществующая часть — это опечатка в ссылке предпросмотра, и
    // findSegment внутри segmentOf упадёт на ней громко и по имени.
    this.#nodeId = assume.startSegmentId ?? entrySegmentOf(project);
    this.#segment = segmentOf(project, this.#nodeId);
    // Стартовый кусок тоже «слышан» — иначе ребро, ведущее назад к самому
    // началу, не распозналось бы как повтор вовсе.
    this.#visited.add(this.#nodeId);
    this.#events = events;

    this.#stage = document.createElement('div');
    this.#stage.className = 'player-stage';
    // Инвариант №3: вне гейта сцена физически недоступна для мыши.
    // Обработчики при этом никогда не снимаются — недоступность обеспечивает
    // браузер, а не наша аккуратность.
    this.#stage.style.pointerEvents = 'none';
    // Один делегированный обработчик на весь срок жизни плеера (ADR-005,
    // ADR-011). Он не проверяет, «подписаны ли мы ещё» — он проверяет
    // состояние гейта при каждом клике, поэтому снимать его незачем.
    this.#stage.addEventListener('click', this.#handleStageClick);
    host.appendChild(this.#stage);
  }

  get state(): PlayerState { return this.#state; }
  get stageElement(): HTMLElement { return this.#stage; }
  get positionSeconds(): number { return this.#clock ? this.#toSegmentTime(this.#clock.position) : 0; }

  /**
   * Где зритель находится — на двух уровнях сразу.
   *
   * Нижний уровень точен всегда: часть линейна, её длительность известна.
   * Верхний честен настолько, насколько может быть: `chaptersLeft` равен `null`,
   * когда впереди развилка и длина пути зависит от ответов, которых ещё нет.
   *
   * Показывать в такой момент процент или «часть 3 из 7» — значит называть
   * числом то, чего не существует. Поэтому решение о том, КАК это выглядит,
   * оставлено интерфейсу, а плеер отдаёт различие между «знаю» и «не знаю».
   */
  get progress(): PlaybackProgress {
    return {
      chapterIndex: this.#chaptersPassed + 1,
      chaptersLeft: certainRemaining(this.#project, this.#nodeId),
      positionSeconds: this.positionSeconds,
      durationSeconds: this.#segment.duration,
    };
  }

  /**
   * Играет ли сейчас кусок, который зритель уже слышал в этом просмотре.
   *
   * Оснастка обязана показать надпись, пока это правда (§5 [Р] `product.md`:
   * без неё зритель решит, что зациклился, и уйдёт) — это не украшение,
   * а единственный способ сказать зрителю, почему знакомые слова звучат снова.
   */
  get isRepeating(): boolean { return this.#repeating; }

  /**
   * Перевод между двумя системами координат, которые легко перепутать.
   *
   * Часы живут в координатах ФАЙЛА: `position` и `duration` у них — это
   * позиция и длина буфера. Всё остальное в плеере — гейты, слайды, слова,
   * `duration` сегмента — живёт в координатах САМОГО сегмента, от нуля.
   * Пока каждый сегмент занимал файл целиком, разницы не было; с версией 4
   * несколько сегментов делят один файл разными окнами, и путаница здесь
   * дала бы не ошибку, а сдвиг: сцена играла бы не в том месте дорожки.
   *
   * ЗАЖАТО В ОКНО ГЛАВЫ, и это не глушение ошибки, а достройка перевода.
   * Вычитание было определено только для позиций ВНУТРИ окна. Снаружи оно
   * давало бессмыслицу: до старта часы стоят в нуле ФАЙЛА (якоря ещё нет,
   * `clock.ts`: «if (!anchor) return 0»), и `0 − offset` выдавало позицию
   * главы ДО её собственного нуля. У главы такой позиции не существует —
   * она начинается на нуле по определению.
   *
   * Чем это стоило. `known-bugs.md` №13 (Сессия 37): на фикстуре `video`
   * (`audio.offset = 2`) плеер в состояниях `ready` и `ended` отдавал
   * `positionSeconds = −2`. Тогда это выглядело враньём в числе. В Сессии 43
   * то же самое стало РОНЯТЬ РЕДАКТОР: щелчок по главе с ненулевым окном
   * (фикстура `split-track`, `s-left`) уводил `-4` в метку времени, и
   * `assertSeconds` честно бросал `RangeError: Секунда метки не может быть
   * отрицательной, получено -4`, унося всё дерево React. Проверено руками
   * в живом Chrome: `.ed-root` из `true` в `null`, и одинаково — что
   * из нового вида «Ветки», что из старой панели глав.
   *
   * Бросок в `assertSeconds` при этом ПРАВИЛЬНЫЙ и остаётся: он поймал
   * настоящую бессмыслицу там, где она возникла. Чинится источник.
   */
  #toSegmentTime(clockPosition: number): number {
    const inSegment = clockPosition - this.#segment.offset;
    return Math.min(Math.max(inSegment, 0), this.#segment.duration);
  }

  /** Обратный перевод: время сегмента → позиция внутри файла. */
  #toClockTime(segmentPosition: number): number {
    return segmentPosition + this.#segment.offset;
  }
  /** Гейт, на котором стоим: и пока отвечают, и пока читают разбор. */
  get currentGate(): Gate | undefined {
    if (this.#state !== 'at-gate' && this.#state !== 'at-reveal') return undefined;
    return this.#gates[this.#nextGateIndex]?.gate;
  }
  /** Открытый разбор на месте. `undefined` — разбора сейчас нет. */
  get currentReveal(): Reveal | undefined { return this.#reveal ?? undefined; }

  /** Узлы сцены. Читаются у движка слайдов, а не копируются: переход
   * пересобирает сцену, когда уходящие элементы догорают, и снимок карты
   * после этого указывал бы на узлы, которых в документе уже нет. */
  get #nodes(): ReadonlyMap<string, HTMLElement> {
    return this.#slides?.nodes ?? new Map();
  }

  #setState(state: PlayerState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#events.onStateChange?.(state);
  }

  /** Загружает аудио, строит сцену и таймлайн. После этого можно играть. */
  async load(): Promise<void> {
    this.#setState('loading');

    // Пересчёт масштаба при изменении размера окна. Масштаб всегда берётся
    // из актуальных размеров, а не из сохранённого значения (ADR-007).
    this.#resizeObserver = new ResizeObserver(() => this.#fit());
    this.#resizeObserver.observe(this.#host);

    this.#clock = await this.#clocks.clockFor(this.#segment.source);

    // Байты обязаны быть готовы ДО #mountSegment: renderScene внутри него
    // синхронный, а хранилище байтов — нет (ловушка №2 задания). Шрифты
    // объявляются той же картой сразу следом, до первого кадра сцены.
    // Через `allSegments`, а не по `project.segments` руками: дверца к модели
    // объяснения одна, и охраняется тестом инвариантов.
    this.#assets = await resolveProjectAssets(allSegments(this.#project), this.#project.fonts);
    applyFonts(this.#project.fonts, this.#assets);

    this.#mountSegment();
    this.#setState('ready');
  }

  /**
   * Ставит сцену, таймлайн и гейты текущего сегмента.
   *
   * Вызывается и при загрузке, и на каждом переходе по ребру графа: смена
   * узла — структурная правка по определению, собирать её наполовину нечего.
   */
  #mountSegment(): void {
    const clock = this.#requireClock();

    this.#slides?.destroy();
    this.#slides = new SlideEngine({
      host: this.#stage,
      theme: this.#segment.theme,
      styles: this.#segment.styles,
      elements: this.#segment.elements,
      slides: this.#segment.slides,
      words: this.#segment.words,
      stage: this.#segment.stage,
      assets: this.#assets,
    });
    // Пометки кликабельных вариантов жили на элементах прошлой сцены,
    // а её больше нет: движок слайдов очищает контейнер.
    this.#markedOptionIds = [];
    this.#hiddenOptions = [];
    // Кнопка капли лежала В ТОМ ЖЕ контейнере и уехала вместе с ним. Ссылка
    // на неё осталась бы живой и указывала на узел, оторванный от документа:
    // кнопка была бы, а нажать её было бы нельзя — ни ошибки, ни признака.
    // Само СОСТОЯНИЕ зрителя (`#viewerBubbles`) при этом НЕ трогается:
    // правки зрителя границей главы не сбрасываются.
    this.#bubbleToggle = null;
    this.#fit();

    // Греть продолжения можно с самого начала сегмента: он линеен, его
    // длительность известна точно, и ждать открытия гейта больше незачем —
    // ветвление переехало на выход.
    this.#warmExitTargets();

    // Гейты разрешаются в секунды один раз и сортируются: дальше плеер
    // движется по ним строго вперёд, потому что перемотки не существует.
    // Слова берутся ЭТОГО узла (инвариант №10): у каждого узла свой
    // транскрипт, и разрешить метку чужим — значит получить правдоподобные
    // секунды с видом настоящих.
    //
    // Остановки, на которые в этом просмотре уже отвечали, второй раз
    // не открываются: §5 [Р] «гейты внутри не задаются заново». Зритель
    // вернулся посмотреть объяснение, а не переотвечать на решённое.
    this.#gates = openableGates(this.#segment.gates, this.#answeredHere)
      .map((gate) => ({ gate, at: resolveTimeRef(gate.at, this.#segment.words) }))
      .sort((a, b) => a.at - b.at);
    this.#nextGateIndex = 0;
    // Попытки — свойство гейта, а гейты здесь другие. Счётчик чужого узла
    // отобрал бы у зрителя попытки, которых он не тратил.
    this.#attempts.clear();

    // Свежая сцена стоит на нуле: время выставляется до первого кадра,
    // иначе зритель увидит состояние до всех переходов.
    this.#slides.renderAt(0);
    void clock;
  }

  #fit(): void {
    applyFit(this.#stage, this.#host.clientWidth, this.#host.clientHeight, this.#segment.stage);
  }

  /**
   * Делегированный обработчик кликов по сцене (ADR-011).
   *
   * Вешается один раз в конструкторе и никогда не снимается (ADR-005) —
   * поэтому все проверки состояния лежат внутри самого обработчика, а не
   * в факте подписки. Клик по элементу сцены становится ответом ровно
   * тогда, когда на этот элемент ССЫЛАЕТСЯ вариант текущего открытого
   * гейта — во всех остальных случаях обработчик молчит.
   */
  readonly #handleStageClick = (event: MouseEvent): void => {
    if (this.#state !== 'at-gate') return;
    const gate = this.currentGate;
    if (!gate || gate.config.kind !== 'choice') return;

    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-id]') : null;
    const id = node?.dataset['id'];
    if (id === undefined) return;
    /*
     * ВАРИАНТ ИЩЕТСЯ ПО ССЫЛКЕ, А НЕ ПО СОВПАДЕНИЮ ИМЁН (ADR-035, схема v15).
     *
     * До версии 15 здесь стояло `candidate.id === id`: элемент отвечал,
     * если его идентификатор совпал с идентификатором варианта. Совпадения
     * больше не существует как механизма — у варианта своё имя и явное
     * поле `elementId`, — и сверка по имени молча перестала бы засчитывать
     * щелчки по фигурам: гейт оставался бы открытым, а зритель не понимал бы,
     * почему кнопка не работает.
     */
    const option = gate.config.options.find((candidate) => candidate.elementId === id);
    // Скрытый условием вариант ответом не становится, даже если его фигура
    // каким-то образом дошла до клика: видимость решает язык условий, а не
    // то, попал ли курсор по узлу.
    if (!option || !this.#conditionsPass(option.when)) return;

    // Отвечаем ИМЕНЕМ ВАРИАНТА, а не именем фигуры: в переменную пишется
    // ответ, и правила выхода сравнивают именно с ним.
    void this.answer(option.id);
  };

  /**
   * Помечает элементы сцены, которые сейчас служат вариантами ответа.
   *
   * Признак — dataset, а не className: applyElement перезаписывает
   * className целиком и стёр бы отметку при следующем применении. Курсор
   * ставится тем же способом инлайн-стилем — это забота плеера про
   * интерактив, а не рендера про внешний вид, поэтому applyElement его
   * не знает и не трогает.
   *
   * Возвращает варианты, для которых элемента не нашлось: их дорисовывает
   * кнопками оснастка снаружи.
   */
  #markAnswerElements(gate: Gate): readonly UnboundOption[] {
    if (gate.config.kind !== 'choice') return [];

    const unbound: UnboundOption[] = [];
    for (const option of gate.config.options) {
      /*
       * Узел берётся по ССЫЛКЕ варианта, а не по совпадению имён (ADR-035,
       * схема v15). До неё здесь стояло `this.#nodes.get(option.id)`:
       * элемент становился кнопкой, если его идентификатор случайно совпал
       * с идентификатором ответа, и переставал ею быть, если любую из двух
       * сторон переименовали, — молча, без ошибки и без следа.
       *
       * Совпадение при этом больше НЕ учитывается вовсе: миграция v14→v15
       * записала все прежние совпадения в `elementId`, так что старые
       * проекты ведут себя ровно как прежде, а новые обязаны сказать связь
       * вслух.
       */
      const node = option.elementId === undefined ? undefined : this.#nodes.get(option.elementId);
      const visible = this.#conditionsPass(option.when);

      if (!visible) {
        // Вариант скрыт условием — гасим ФИГУРУ, а не только интерактив.
        // Оставить её видимой и неотзывчивой значило бы показать зрителю
        // ответ, по которому он тыкает без результата: это читается как
        // поломка. Зритель не должен знать, что варианты вообще скрывались.
        if (node) {
          this.#hiddenOptions.push({ id: option.id, opacity: node.style.opacity });
          node.style.opacity = '0';
        }
        continue;
      }

      if (!node) {
        unbound.push(option);
        continue;
      }
      node.dataset['answerOption'] = '1';
      node.style.cursor = 'pointer';
      this.#markedOptionIds.push(option.id);
    }
    return unbound;
  }

  /**
   * Показывать ли вариант этому зрителю.
   *
   * Без `when` — показывать всегда. Схема гарантирует, что хотя бы один
   * вариант безусловен, поэтому «скрылись все» невозможно по построению,
   * а не по везению.
   */
  #conditionsPass(when: readonly Condition[] | undefined): boolean {
    return when === undefined || conditionsHold(when, this.#answers);
  }

  /** Снимает отметку варианта ответа при выходе из гейта. */
  #unmarkAnswerElements(): void {
    for (const id of this.#markedOptionIds) {
      const node = this.#nodes.get(id);
      if (!node) continue;
      delete node.dataset['answerOption'];
      node.style.cursor = '';
    }
    this.#markedOptionIds = [];

    // Прозрачность возвращаем В ТО ЖЕ значение, что было, а не в пустую
    // строку: инлайн-стиль мог принадлежать движку слайдов, и затереть его
    // значило бы отдать элементу чужую видимость после выхода из гейта.
    for (const hidden of this.#hiddenOptions) {
      const node = this.#nodes.get(hidden.id);
      if (!node) continue;
      node.style.opacity = hidden.opacity;
    }
    this.#hiddenOptions = [];
  }

  /**
   * Начинает или продолжает воспроизведение.
   * Должно вызываться из обработчика пользовательского жеста: без него
   * AudioContext останется в состоянии suspended.
   */
  async play(): Promise<void> {
    const clock = this.#requireClock();
    if (this.#state === 'playing') return;

    if (this.#state === 'at-gate') {
      throw new Error('Нельзя продолжить, пока гейт не пройден');
    }

    await clock.wake();

    // Гейт ровно на нулевой секунде: остановиться надо ДО первого звука,
    // иначе зритель услышит начало фразы, к которой относится вопрос.
    //
    // Часы при этом обязаны встать в определённое состояние, а не остаться
    // «нигде»: источник не запущен, но и заморозки не было — и ответ на такой
    // гейт возобновлять неоткуда. Раньше этой строки не было, и ответ падал
    // с «Часы не в состоянии паузы» уже после того, как зритель нажал кнопку.
    if (this.#gateDueAt(0)) {
      clock.holdBeforeStart(this.#toClockTime(0));
      this.#openGate();
      return;
    }

    clock.start(this.#state === 'ended' ? this.#toClockTime(0) : clock.position);
    if (this.#state === 'ended') this.#nextGateIndex = 0;
    // ПОСЛЕ clock.start: позиция берётся у часов, уже получивших якорь,
    // а не считается здесь заново. Два описания одного вычисления
    // расходятся тихо (ADR-028).
    startVideos(collectVideos(this.#stage), clock.position);
    this.#setState('playing');
    this.#startFrameLoop();
  }

  #gateDueAt(position: number): boolean {
    const next = this.#gates[this.#nextGateIndex];
    return next !== undefined && position >= next.at;
  }

  #startFrameLoop(): void {
    const frame = (): void => {
      if (this.#state !== 'playing') return;

      // Часы и таймлайн читаются из полей КАЖДЫЙ кадр, а не захватываются
      // замыканием: на запланированном стыке они подменяются внутри этого
      // же цикла, и захваченная ссылка осталась бы от прошлого узла —
      // сцена играла бы новую, а время шло по старым часам.
      const clock = this.#requireClock();
      const slides = this.#requireSlides();

      const position = this.#toSegmentTime(clock.position);
      // Инвариант №2 в одной строке: время сцены = время аудио.
      slides.seekSeconds(position);
      // Видео сверяется по позиции ДОРОЖКИ, а не сегмента: при сценарии
      // «один файл» медиавремя картинки совпадает с медиавременем звука,
      // а время сегмента отличается от него на `audio.offset`. При нулевом
      // окне обе шкалы совпадают, и ошибка была бы невидима (ADR-028).
      syncVideos(collectVideos(this.#stage), clock.position);
      // Кто владеет каплей — вопрос ВРЕМЕНИ, значит ответ обновляется каждый
      // кадр, там же, где обновляется всё остальное время сцены. Отдельного
      // хронометра тут не заводится (инвариант №1): позиция уже посчитана.
      this.#updateBubbleRights(position);
      this.#events.onFrame?.(position);

      if (this.#gateDueAt(position)) {
        void this.#reachGate();
        return;
      }

      // Запланированный узел уже зазвучал — сцена догоняет звук.
      if (this.#promotePendingIfStarted()) {
        this.#frameHandle = requestAnimationFrame(frame);
        return;
      }

      this.#maybeSchedulePending(position);

      // Конец СЕГМЕНТА, а не конец файла: при разрезанном повествовании
      // за окном этого сегмента в том же файле лежит следующий.
      if (position >= this.#segment.duration - 0.02) {
        /*
         * ОСТАНОВКА НА САМОМ КОНЦЕ ГЛАВЫ ВСЁ РАВНО СРАБАТЫВАЕТ.
         *
         * Куплено 26.08.2026. Разрез по развилке оставляет метку РОВНО
         * на конце головы — в этом весь его смысл: ответить и уйти в ветку,
         * не дослушивая. А конец главы проверяется с допуском 0.02 с, то есть
         * наступает РАНЬШЕ, чем `position >= gate.at`. Метка не срабатывала
         * никогда.
         *
         * Замер на собранном руками объяснении: глава 24.300 с, метка
         * на 24.300 с, разница 0.000. Плеер доходил до состояния `ended`,
         * вопрос не открывался ни разу — зрителя сразу уносило по выходу
         * главы. Владелец описал это дословно: «в плеере открыл, а там мне
         * вопроса не показало, а сразу кинуло в вариант».
         *
         * Инвариант №4 говорит, что остановка останавливает всё; пропустить
         * её — нарушение грубее любого допуска. Поэтому здесь спрашиваем
         * не «дошли ли до метки», а «осталась ли неотработанная метка
         * в пределах главы»: если да, она главнее конца.
         */
        const pendingGate = this.#gates[this.#nextGateIndex];
        if (pendingGate !== undefined && pendingGate.at <= this.#segment.duration) {
          void this.#reachGate();
          return;
        }
        void this.#reachEndOfNode();
        return;
      }
      this.#frameHandle = requestAnimationFrame(frame);
    };
    this.#frameHandle = requestAnimationFrame(frame);
  }

  /**
   * Готовит переход по ребру «конец узла» заранее.
   *
   * Сначала греет дорожку, потом планирует старт РОВНО на конец текущей.
   * Два шага, а не один, потому что декодирование занимает до четырёх кадров
   * (S9), а планировать можно только тогда, когда буфер уже в руках.
   */
  #maybeSchedulePending(position: number): void {
    if (this.#pending) return;

    const clock = this.#clock;
    if (!clock) return;

    // nextExit, а не nextSegment: choice несёт с собой сработавшее правило,
    // и оно нужно #enterSegment, чтобы решить, повтор ли это, и если да —
    // чьи ответы стереть.
    const choice = nextExit(findSegment(this.#project, this.#nodeId), this.#answers);
    if (choice === null) return;
    const next = choice.goto;

    const remaining = this.#segment.duration - position;
    if (remaining > PRELOAD_AHEAD_S) return;

    const target = segmentOf(this.#project, next);
    const source = target.source;
    if (remaining > SCHEDULE_AHEAD_S) {
      this.#clocks.warm(source);
      return;
    }

    const endsAt = clock.scheduleEnd;
    if (endsAt === null) return;

    const leadTime = endsAt - clock.scheduleNow;
    // Не успели запланировать — конец узла обработает #reachEndOfNode
    // остановленным переходом. Это не заглушка, а второй настоящий путь:
    // он даёт паузу вместо щелчка, и оба измерены в S9.
    if (leadTime <= 0) return;

    // Часы просим ПОСЛЕДНИМ шагом, когда всё остальное уже сошлось: каждый
    // запрос строит живой узел усиления, и спрашивать их кадр за кадром
    // значило бы копить их в аудиографе десятками.
    const pendingClock = this.#clocks.clockIfReady(source);
    if (!pendingClock) return;

    // С начала ОКНА следующего сегмента, а не с начала файла: если он делит
    // файл с текущим (разрезанное повествование), нулём была бы чужая речь.
    const startsAt = pendingClock.start(target.offset, { leadTime });
    this.#pending = { clock: pendingClock, nodeId: next, startsAt, choice };
  }

  /** Подменяет сцену и часы, когда запланированный узел начал звучать. */
  #promotePendingIfStarted(): boolean {
    const pending = this.#pending;
    const clock = this.#clock;
    if (!pending || !clock || clock.scheduleNow < pending.startsAt) return false;

    this.#clock?.stop();
    this.#clock = pending.clock;
    this.#nodeId = pending.nodeId;
    this.#segment = segmentOf(this.#project, pending.nodeId);
    this.#pending = null;
    this.#chaptersPassed += 1;
    // ДО #mountSegment: она читает #answeredHere, чтобы решить, какие
    // остановки открывать, а #enterSegment может его только что почистить.
    this.#enterSegment(pending.nodeId, pending.choice);

    this.#mountSegment();
    return true;
  }

  /** Снимает запланированный узел: ответ на гейте мог увести в другую сторону. */
  #dropPending(): void {
    const pending = this.#pending;
    if (!pending) return;
    pending.clock.stop();
    this.#pending = null;
  }

  /**
   * Конец дорожки: выход сегмента решает, куда дальше.
   *
   * Это ЕДИНСТВЕННОЕ место, где объяснение меняет сегмент по своей воле. Гейт
   * такого права не имеет и иметь не может: поля для рёбер у него нет.
   */
  async #reachEndOfNode(): Promise<void> {
    // nextExit, а не nextSegment: #goToNode передаёт choice дальше в
    // #enterSegment, которая решает, повтор ли это.
    const choice = nextExit(findSegment(this.#project, this.#nodeId), this.#answers);
    if (choice === null) {
      this.#finish();
      return;
    }
    await this.#goToNode(choice.goto, choice);
  }

  /**
   * Переход на другой узел из ОСТАНОВЛЕННОГО состояния.
   *
   * Стыком в смысле S9 это не является: по гейту звук уже сведён рампой
   * в ноль и контекст подвешен (S3: 0 разрывов, 0 мс скачка), поэтому старт
   * следующего узла ничем не отличается от начала воспроизведения.
   */
  async #goToNode(nodeId: string, choice: ExitChoice): Promise<void> {
    this.#stopFrameLoop();
    this.#dropPending();

    this.#clock?.stop();
    this.#nodeId = nodeId;
    this.#segment = segmentOf(this.#project, nodeId);
    this.#chaptersPassed += 1;
    // ДО #mountSegment — тот же порядок, что и в #promotePendingIfStarted.
    this.#enterSegment(nodeId, choice);
    this.#clock = await this.#clocks.clockFor(this.#segment.source);

    // Часы усыплены остановкой на гейте (clock.ts). Забыть разбудить —
    // получить ТИШИНУ, а не ошибку: источник запустится в остановленное
    // время, и ни один юнит-тест этого не увидит.
    await this.#clock.wake();

    this.#mountSegment();
    this.#clock.start(this.#toClockTime(0));
    this.#setState('playing');
    this.#startFrameLoop();
  }

  /**
   * Отмечает переход и решает, повтор ли это.
   *
   * Повтор — это возвращение в уже слышанный кусок. Определяется по факту,
   * а не по разметке автора: правило выхода не знает, вперёд оно ведёт или
   * назад, и знать не может — граф не дерево.
   *
   * Вызывается ДО `#mountSegment` в обоих местах, откуда меняется сегмент
   * (`#goToNode`, `#promotePendingIfStarted`): та читает `#answeredHere`,
   * чтобы решить, какие остановки открывать, а эта функция его чистит.
   */
  #enterSegment(nodeId: string, choice: ExitChoice): void {
    this.#repeating = this.#visited.has(nodeId);
    this.#visited.add(nodeId);

    if (!this.#repeating) return;

    // Виновница спрашивает снова. Стираем след ровно тех остановок, чьи
    // ответы прочитало сработавшее правило: иначе возвращаться было бы
    // незачем — зритель попал бы в ту же развилку с тем же ответом
    // и уехал на повтор ещё раз, и так навсегда. Правило продукта живёт
    // в repeat.ts, а не здесь — своя копия в классе разошлась бы с юнитами
    // тихо (см. заголовок repeat.ts).
    for (const gateId of answersToClear(allSegments(this.#project), choice.rule)) {
      this.#answeredHere.delete(gateId);
    }
  }

  async #reachGate(): Promise<void> {
    const clock = this.#requireClock();
    const slides = this.#requireSlides();
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Гейт исчез между проверкой и остановкой');

    // Запланированный следующий узел снимается ДО остановки: иначе он
    // продолжил бы звучать поверх остановленного времени.
    this.#dropPending();

    // Время встаёт РОВНО на гейте, а не там, где мы успели заметить
    // пересечение: обнаружение ограничено длиной кадра (ADR-005).
    await clock.freezeAt(this.#toClockTime(scheduled.at));
    slides.seekSeconds(scheduled.at);

    /**
     * Незавершённый переход доводится до конца МГНОВЕННО — решение [Р]
     * product.md §3. Зритель не отвечает поверх едущих элементов: пока
     * они едут, непонятно даже, по чему именно кликать.
     *
     * Буквальное «доиграть переход» стоило бы 300–900 мс лишнего звука
     * после точки остановки, то есть нарушило бы инвариант №4 в полсотни
     * раз грубее, чем измеренный перелёт кадра 18.57 мс.
     */
    slides.settle();
    this.#openGate();
  }

  #openGate(): void {
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Нет гейта для открытия');

    // Гейт останавливает ВСЁ сразу (инвариант №4), картинку в том числе.
    // Одна точка на все виды гейта, включая гейт на нулевой секунде, где
    // видео ещё не играло: пауза уже остановленного безвредна.
    pauseVideos(collectVideos(this.#stage));
    this.#stopFrameLoop();
    this.#stage.style.pointerEvents = 'auto';
    this.#setState('at-gate');
    // Время стоит — окно бесплатное, поэтому прогрев подтверждается ещё раз.
    // Основной прогрев идёт с начала сегмента: ветвление живёт на выходе,
    // и ждать вопроса, чтобы узнать продолжения, больше не нужно.
    this.#warmExitTargets();
    const unboundOptions = this.#markAnswerElements(scheduled.gate);
    this.#events.onGateOpen?.(scheduled.gate, unboundOptions);
  }

  /** Греет дорожки всех продолжений сегмента: что ответят — неизвестно. */
  #warmExitTargets(): void {
    const segment = findSegment(this.#project, this.#nodeId);
    for (const target of preloadTargetsOfExit(segment)) {
      // Повторный прогрев одного и того же пути источник часов отсекает
      // сам: знание о том, что уже готово, принадлежит ему, а не плееру.
      this.#clocks.warm(segmentOf(this.#project, target).source);
    }
  }

  /**
   * ПЕРЕМОТКА СТЕНДА (ADR-036). У зрителя её нет.
   *
   * Работает, только если плеер создан с `standSeek`. Без признака —
   * БРОСАЕТ, а не молчит и не игнорирует: молчаливый отказ был бы ровно
   * тем «нарисовано, но не работает», из-за которого в этом проекте
   * заведена половина правил.
   *
   * ЧТО ПРОИСХОДИТ С ОСТАНОВКАМИ. Решение владельца 24.08.2026: остановка
   * спрашивается, только если головка дошла до неё естественным ходом.
   * Перемотал вперёд за остановку — она не откроется; перемотал назад —
   * снова откроется, когда до неё дойдёшь.
   *
   * Выражено ОДНИМ действием: ближайшей становится первая остановка, чьё
   * время больше новой позиции. Списка «уже спрошенных» и флагов
   * у остановок нет — рассогласовать нечего.
   *
   * Позиция — В ВРЕМЕНИ СЕГМЕНТА, как и `positionSeconds`. Перевод в время
   * дорожки делает `#toClockTime`: у главы с ненулевым окном эти шкалы
   * различаются, и путаница между ними уже роняла редактор (см. разбор
   * у `#toSegmentTime`).
   */
  seek(position: number): void {
    if (!this.#standSeek) {
      throw new Error(
        'Перемотка доступна только на стенде автора: плеер создан без признака standSeek (ADR-036)',
      );
    }
    if (!Number.isFinite(position)) {
      throw new RangeError(`Позиция перемотки не число: ${String(position)}`);
    }

    const clock = this.#requireClock();
    /*
     * `Clock` НАМЕРЕННО не умеет перематывать: перемотка объявлена
     * в `EditorClock`, и это и есть структурная опора — хост, держащий
     * `Clock`, перемотать не может ничем (clock.ts, шапка `EditorClock`).
     * Интерфейс не расширяется даже теперь: сужение делается здесь,
     * с проверкой, и проверка БРОСАЕТ, а не тихо ничего не делает.
     *
     * Обе живые реализации (`AudioClock`, `SilentClock`) перемотку умеют,
     * поэтому ветка отказа — про будущие часы, а не про сегодняшние.
     */
    const seekable = clock as Partial<EditorClock>;
    if (typeof seekable.seek !== 'function') {
      throw new Error('Часы этой главы не умеют перематывать: перемотка стенда недоступна');
    }
    const clamped = Math.min(Math.max(position, 0), this.#segment.duration);
    seekable.seek(this.#toClockTime(clamped));

    // Сцена и видео догоняют СРАЗУ, а не следующим кадром: в паузе кадров
    // нет вовсе, и без этого автор перемотал бы в тишину и смотрел на кадр
    // с прежней секунды.
    this.#requireSlides().seekSeconds(clamped);
    syncVideos(collectVideos(this.#stage), clock.position);

    // Ближайшая остановка — первая, до которой ещё НЕ дошли.
    this.#nextGateIndex = this.#gates.findIndex((scheduled) => scheduled.at > clamped);
    if (this.#nextGateIndex < 0) this.#nextGateIndex = this.#gates.length;

    this.#events.onFrame?.(clamped);
  }

  /**
   * Принимает ответ зрителя.
   *
   * Возвращает разбор попытки. Воспроизведение продолжается только тогда,
   * когда исход — `continue`.
   */
  async answer(value: GateAnswer): Promise<GateAttempt> {
    if (this.#state !== 'at-gate') {
      throw new Error(`Ответ вне гейта: состояние ${this.#state}`);
    }
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Нет открытого гейта');

    const { gate } = scheduled;
    // Оснастка рисует кнопками только те варианты, что отдал `onGateOpen`,
    // а скрытых среди них нет. Если ответ всё же пришёл по скрытому варианту —
    // это рассинхрон оснастки с плеером, и увидеть его надо здесь, а не
    // тремя переходами позже в виде ветки, куда зритель не мог попасть.
    if (gate.config.kind === 'choice') {
      const option = gate.config.options.find((candidate) => candidate.id === value);
      if (option && !this.#conditionsPass(option.when)) {
        throw new Error(`Вариант «${value}» скрыт условием и не может быть ответом`);
      }
    }
    const used = (this.#attempts.get(gate.id) ?? 0) + 1;
    this.#attempts.set(gate.id, used);

    const correct = isCorrect(gate, value);
    const exhausted = gate.maxAttempts !== null && used >= gate.maxAttempts;

    /*
     * У РАЗВИЛКИ НЕТ НЕВЕРНОГО ОТВЕТА, ЗНАЧИТ НЕЧЕГО И ПЕРЕСПРАШИВАТЬ.
     *
     * Куплено 26.08.2026 прогоном руками. С тех пор как метка с вариантами
     * стала развилкой (`correctId: null`), `isCorrect` не засчитывает
     * НИ ОДИН ответ — засчитывать не с чем. А `onWrong` у только что
     * поставленной метки равен `retry`, и зритель попадал в петлю: нажал
     * вариант, вопрос открылся заново, и так без конца. Владелец: «нажал
     * на вариант и нихрена не сработало».
     *
     * Правильность и ход рассказа — разные вещи: «верного ответа нет»
     * означает «любой ответ засчитан», а не «любой ответ неверен».
     * Поле `correct` при этом остаётся false честно: ничего не проверяли.
     */
    const nothingToGrade = gate.config.kind === 'choice' && gate.config.correctId === null;

    let outcome: GateAttempt['outcome'];
    if (correct) outcome = 'continue';
    else if (nothingToGrade) outcome = 'continue';
    else if (gate.onWrong === 'continue') outcome = 'continue';
    else if (gate.onWrong === 'inline-explain' || gate.onWrong === 'inline-hint') outcome = 'reveal';
    else outcome = exhausted ? 'reveal' : 'retry';

    const attempt: GateAttempt = { gate, correct, attemptsUsed: used, outcome };
    // Единственное, что гейт делает с ответом: записывает его в переменную.
    // Никуда не перекидывает — решение о следующем сегменте принимает выход.
    this.#answers = { ...this.#answers, [gate.recordAs]: { value: value ?? '', correct } };
    // След «отвечали в этом просмотре» — НЕ то же самое, что запись выше:
    // она переживает предпросмотр с засеянными ответами (конструктор), этот
    // след — нет. Отдельное множество нужно ровно затем, чтобы повтор молчал
    // по факту ответа, а не по значению, которое мог подставить предпросмотр.
    this.#answeredHere.add(gate.id);
    this.#events.onGateResolved?.(attempt);

    if (outcome === 'continue') await this.#leaveGate();
    else if (outcome === 'reveal') this.#openReveal(gate);
    return attempt;
  }

  /**
   * Открывает разбор на месте: сегмент не покидается, дорожка стоит.
   *
   * Сцена снова становится недоступной для мыши. Это не перестраховка:
   * варианты ответа нарисованы элементами сцены (ADR-011), и без этого
   * зритель мог бы ткнуть в них поверх открытого разбора — а `answer`
   * там уже не примут, потому что попытка разобрана.
   */
  #openReveal(gate: Gate): void {
    this.#unmarkAnswerElements();
    this.#stage.style.pointerEvents = 'none';

    const config = gate.config;
    this.#reveal = {
      gate,
      kind: gate.onWrong === 'inline-hint' ? 'inline-hint' : 'inline-explain',
      correctOption: config.kind === 'choice'
        ? config.options.find((option) => option.id === config.correctId)
        : undefined,
    };
    this.#setState('at-reveal');
    this.#events.onRevealOpen?.(this.#reveal);
  }

  /** Продолжает после разбора на месте. Дорожка идёт дальше с той же позиции. */
  async continueAfterReveal(): Promise<void> {
    if (this.#state !== 'at-reveal') {
      throw new Error(`Разбор не открыт: состояние ${this.#state}`);
    }
    await this.#leaveGate();
  }

  async #leaveGate(): Promise<void> {
    const clock = this.#requireClock();
    this.#reveal = null;
    this.#unmarkAnswerElements();
    this.#stage.style.pointerEvents = 'none';

    // Сегмент продолжается ВСЕГДА. Ответ уже записан в переменную, а куда
    // идти дальше, решит выход, когда дорожка доиграет. Раньше здесь стоял
    // прыжок в другой сегмент прямо из середины дорожки — от него и уходили.
    this.#nextGateIndex += 1;

    // Возобновление с ТОЙ ЖЕ позиции. Перемотки не возникает по построению:
    // источник стартует с числа, записанного при остановке.
    await clock.resumeFromFreeze();
    // Возобновление — тот же пуск по расписанию, что и в play(): позиция
    // берётся у часов после разморозки, а не запоминается до неё.
    startVideos(collectVideos(this.#stage), clock.position);
    this.#setState('playing');
    this.#startFrameLoop();
  }

  #finish(): void {
    this.#stopFrameLoop();
    pauseVideos(collectVideos(this.#stage));
    this.#dropPending();
    this.#clock?.stop();
    this.#setState('ended');
  }

  #stopFrameLoop(): void {
    if (this.#frameHandle !== null) {
      cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = null;
    }
  }

  destroy(): void {
    this.#stopFrameLoop();
    // Владение снимается с узла явно, а не «сцену всё равно снесут»:
    // хост вправе оставить контейнер себе, и капля осталась бы ужатой
    // с чужим `pointer-events` навсегда.
    const bubbleId = bubbleElementOf(this.#segment.elements);
    const bubbleNode = bubbleId === undefined ? undefined : this.#nodes.get(bubbleId);
    if (bubbleNode) clearOwnership(bubbleNode);
    this.#bubbleToggle?.remove();
    this.#bubbleToggle = null;
    pauseVideos(collectVideos(this.#stage));
    this.#dropPending();
    this.#resizeObserver?.disconnect();
    this.#clock?.stop();
    this.#slides?.destroy();
    void this.#clocks.close();
    // Пара к resolveProjectAssets в load() — тем же приёмом, что releaseAudioUrl
    // у резолва озвучки. Без отдачи каждый переход между узлами графа копил бы
    // blob:-адреса: утечка настоящая, а не теоретическая (ловушка №6 задания).
    releaseProjectAssets(this.#assets);
    this.#stage.remove();
    this.#setState('idle');
  }

  #requireClock(): Clock {
    if (!this.#clock) throw new Error('Плеер не загружен: сначала load()');
    return this.#clock;
  }

  /**
   * Кто распоряжается каплей в этот момент — и что из этого следует для DOM.
   *
   * Зовётся каждый кадр. Дешёвая: перебор отрезков одной главы плюс две
   * записи в стиль, и обе — на композиторе (`scale`, `pointer-events`).
   * Своего времени не заводит, позиция приходит доводом (инвариант №1).
   */
  #updateBubbleRights(position: number): void {
    const elementId = bubbleElementOf(this.#segment.elements);
    if (elementId === undefined) {
      this.#hideBubbleToggle();
      return;
    }

    const node = this.#nodes.get(elementId);
    if (!node) {
      // Капля есть в главе, но не на этом слайде — элемент без состояния
      // не рисуется вовсе (ADR-015). Владеть нечем, кнопке висеть не над чем.
      this.#hideBubbleToggle();
      return;
    }

    const owner = ownerAt(this.#segment.authorSpans, this.#segment.words, elementId, position);
    let viewer = this.#viewerBubbles.get(elementId);
    if (!viewer) {
      viewer = { collapsed: false };
      this.#viewerBubbles.set(elementId, viewer);
    }

    applyOwnership(node, owner, viewer);

    if (owner === 'author') {
      // Внутри отрезка зритель не может НИЧЕГО — кнопки тоже нет.
      this.#hideBubbleToggle();
      return;
    }
    this.#showBubbleToggle(node, elementId, viewer);
  }

  /** Кнопка «свернуть / показать» рядом с каплей. Живёт на сцене, но не в ней. */
  #showBubbleToggle(node: HTMLElement, elementId: string, viewer: ViewerState): void {
    let toggle = this.#bubbleToggle;
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'player-bubble-toggle';
      toggle.dataset['testid'] = 'bubble-toggle';
      // Указатель возвращается ОДНОМУ этому узлу — сцена остаётся мёртвой.
      // Измерено (S17): попадание в соседний элемент по-прежнему отдаёт body.
      // Стиль ИНЛАЙНОМ, а не классом. Инвариант №9: плеер собирается
      // в самостоятельный ESM-бандл и открывается в ГОЛОМ html-файле —
      // внешнего листа стилей там нет, и кнопка, оформленная классом,
      // приехала бы к зрителю голым системным прямоугольником.
      toggle.style.pointerEvents = 'auto';
      toggle.style.position = 'absolute';
      toggle.style.width = '36px';
      toggle.style.height = '36px';
      toggle.style.padding = '0';
      toggle.style.border = '0';
      toggle.style.borderRadius = '50%';
      toggle.style.background = 'rgba(17, 20, 26, 0.72)';
      toggle.style.color = '#f5f7fa';
      toggle.style.fontSize = '18px';
      toggle.style.lineHeight = '1';
      toggle.style.cursor = 'pointer';
      toggle.addEventListener('click', () => {
        const state = this.#viewerBubbles.get(elementId);
        if (!state) return;
        state.collapsed = !state.collapsed;
        // Применяем сразу, не дожидаясь кадра: на остановке кадров нет вовсе,
        // а капля вне отрезка обязана слушаться и там.
        const target = this.#nodes.get(elementId);
        if (target) applyOwnership(target, 'viewer', state);
        this.#paintBubbleToggle(toggle!, state);
      });
      this.#stage.appendChild(toggle);
      this.#bubbleToggle = toggle;
    }

    // Кнопка ставится по КООРДИНАТАМ СЦЕНЫ элемента, а не по его экранному
    // боксу: она лежит внутри той же сцены и делит с ней трансформацию
    // вписывания. Смешивать пространства нельзя — `getBoundingClientRect`
    // учитывает масштаб сцены, а `style.left` нет.
    const left = Number.parseFloat(node.style.left) || 0;
    const top = Number.parseFloat(node.style.top) || 0;
    const width = Number.parseFloat(node.style.width) || 0;
    toggle.style.left = `${left + width - 44}px`;
    toggle.style.top = `${top - 8}px`;
    toggle.style.zIndex = String((Number(node.style.zIndex) || 0) + 1);
    toggle.style.display = '';
    this.#paintBubbleToggle(toggle, viewer);
  }

  #paintBubbleToggle(toggle: HTMLButtonElement, viewer: ViewerState): void {
    // Надпись называет ДЕЙСТВИЕ: одинаковый текст в обоих положениях оставил
    // бы состояние жить только в атрибуте, который видит тест и не видит
    // зритель.
    toggle.textContent = viewer.collapsed ? '⤢' : '⤡';
    toggle.setAttribute(
      'aria-label',
      viewer.collapsed ? 'Показать говорящую голову' : 'Свернуть говорящую голову',
    );
    toggle.setAttribute('aria-pressed', String(viewer.collapsed));
  }

  #hideBubbleToggle(): void {
    if (this.#bubbleToggle) this.#bubbleToggle.style.display = 'none';
  }

  #requireSlides(): SlideEngine {
    if (!this.#slides) throw new Error('Плеер не загружен: сначала load()');
    return this.#slides;
  }
}

/** Проверка ответа. Чистая функция — вынесена, чтобы её можно было тестировать. */
export function isCorrect(gate: Gate, value: GateAnswer): boolean {
  const config = gate.config;
  switch (config.kind) {
    case 'continue':
      return true;
    case 'choice':
      return value === config.correctId;
    case 'input': {
      if (value === undefined) return false;
      const given = config.caseSensitive ? value.trim() : value.trim().toLowerCase();
      return config.accept.some(
        (accepted) => (config.caseSensitive ? accepted : accepted.toLowerCase()) === given,
      );
    }
  }
}

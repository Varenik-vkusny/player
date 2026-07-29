/**
 * Рантайм плеера: часы, ведомый таймлайн, рендер и гейты в одном месте.
 *
 * Главный принцип: всё на экране — чистая функция от одного числа, позиции
 * в аудио. Каждый кадр это число берётся у часов и раздаётся остальным.
 */
import type { Gate, GateOutcome, Project } from '@player/core';
import {
  nextNodeAfterGate,
  nextNodeAtEnd,
  nodeOf,
  preloadTargetsOfGate,
  resolveTimeRef,
} from '@player/core';

import { AudioClock, loadTrack } from './clock.js';
import { applyFit, renderScene } from './render.js';
import { entryNodeOf, segmentOf, type Segment } from './preview.js';
import { buildTimeline, disableEngineMainLoop, type DrivenTimeline } from './timeline.js';

export type PlayerState = 'idle' | 'loading' | 'ready' | 'playing' | 'at-gate' | 'ended';

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
   * Аудиоконтекст один на всю жизнь плеера, а часы — свои у каждого узла.
   *
   * Контекст переиспользуется намеренно: свой на каждый узел упёрся бы
   * в лимит браузера, а `destroy()` закрывает его один раз.
   */
  #ctx: AudioContext | null = null;

  /**
   * Декодированные дорожки по `src`.
   *
   * Дорожка следующего узла греется на открытии гейта, где время стоит,
   * а не на стыке. S9: декодирование 49-секундной дорожки — 63 мс, четыре
   * кадра; трёхсекундной — 4.8 мс. Ждать этого на стыке нельзя.
   */
  #tracks = new Map<string, AudioBuffer>();

  /**
   * Часы следующего узла, запланированные РОВНО на конец текущего.
   *
   * Так устроен стык по ребру «конец узла»: S9 намерил, что обнаружение
   * конца опросом в кадре даёт задержку 65 мс (это унаследованный
   * `outputLatency`, а не длина кадра) и щелчок на одном переходе
   * из двадцати. Расписание даёт ноль и по разрывам, и по задержке.
   */
  #pending: { clock: AudioClock; nodeId: string; startsAt: number } | null = null;

  /** Идёт декодирование дорожки следующего узла — второй раз просить незачем. */
  #warming: Promise<unknown> | null = null;

  /** Исход последней разобранной попытки: им выбирается ребро графа. */
  #lastOutcome: GateOutcome | null = null;

  #clock: AudioClock | null = null;
  #timeline: DrivenTimeline | null = null;
  #nodes: Map<string, HTMLElement> = new Map();
  #gates: ScheduledGate[] = [];
  #nextGateIndex = 0;
  #attempts = new Map<string, number>();
  #state: PlayerState = 'idle';
  #frameHandle: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  /** id вариантов, помеченных сейчас как кликабельные элементы гейта — снимается при выходе. */
  #markedOptionIds: string[] = [];

  constructor(host: HTMLElement, project: Project, events: PlayerEvents = {}) {
    this.#host = host;
    // Единственная точка чтения project.audio и project.scene (ADR-003,
    // ADR-011): переход на граф сегментов поменял segmentOf, а не Player.
    this.#project = project;
    this.#nodeId = entryNodeOf(project);
    this.#segment = segmentOf(project, this.#nodeId);
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
  get positionSeconds(): number { return this.#clock?.position ?? 0; }
  get currentGate(): Gate | undefined {
    return this.#state === 'at-gate' ? this.#gates[this.#nextGateIndex]?.gate : undefined;
  }

  #setState(state: PlayerState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#events.onStateChange?.(state);
  }

  /** Загружает аудио, строит сцену и таймлайн. После этого можно играть. */
  async load(): Promise<void> {
    this.#setState('loading');
    disableEngineMainLoop();

    // Пересчёт масштаба при изменении размера окна. Масштаб всегда берётся
    // из актуальных размеров, а не из сохранённого значения (ADR-007).
    this.#resizeObserver = new ResizeObserver(() => this.#fit());
    this.#resizeObserver.observe(this.#host);

    const ctx = new AudioContext();
    this.#ctx = ctx;
    this.#clock = new AudioClock(ctx, await this.#trackFor(this.#segment.src));

    this.#mountSegment();
    this.#setState('ready');
  }

  /** Декодированная дорожка по пути. Повторный запрос не декодирует заново. */
  async #trackFor(src: string): Promise<AudioBuffer> {
    const cached = this.#tracks.get(src);
    if (cached) return cached;

    const ctx = this.#ctx;
    if (!ctx) throw new Error('Нет аудиоконтекста: сначала load()');

    const track = await loadTrack(ctx, src);
    this.#tracks.set(src, track.buffer);
    return track.buffer;
  }

  /**
   * Ставит сцену, таймлайн и гейты текущего сегмента.
   *
   * Вызывается и при загрузке, и на каждом переходе по ребру графа: смена
   * узла — структурная правка по определению, собирать её наполовину нечего.
   */
  #mountSegment(): void {
    const clock = this.#requireClock();

    this.#nodes = renderScene(this.#stage, this.#segment.scene, this.#segment.stage);
    // Пометки кликабельных вариантов жили на элементах прошлой сцены,
    // а её больше нет: renderScene очищает контейнер (render.ts:107).
    this.#markedOptionIds = [];
    this.#fit();

    this.#timeline = buildTimeline(
      this.#segment.scene.cues,
      this.#nodes,
      this.#segment.words,
      { audioDuration: clock.duration },
    );

    // Гейты разрешаются в секунды один раз и сортируются: дальше плеер
    // движется по ним строго вперёд, потому что перемотки не существует.
    // Слова берутся ЭТОГО узла (инвариант №10): у каждого узла свой
    // транскрипт, и разрешить метку чужим — значит получить правдоподобные
    // секунды с видом настоящих.
    this.#gates = this.#segment.scene.gates
      .map((gate) => ({ gate, at: resolveTimeRef(gate.at, this.#segment.words) }))
      .sort((a, b) => a.at - b.at);
    this.#nextGateIndex = 0;
    // Попытки — свойство гейта, а гейты здесь другие. Счётчик чужого узла
    // отобрал бы у зрителя попытки, которых он не тратил.
    this.#attempts.clear();

    // Свежая сцена стоит на нуле: время выставляется до первого кадра,
    // иначе зритель увидит состояние до всех анимаций.
    this.#timeline.seekSeconds(0);
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
   * тогда, когда его `data-id` совпадает с id одного из вариантов
   * ТЕКУЩЕГО открытого гейта — во всех остальных случаях обработчик молчит.
   */
  readonly #handleStageClick = (event: MouseEvent): void => {
    if (this.#state !== 'at-gate') return;
    const gate = this.currentGate;
    if (!gate || gate.config.kind !== 'choice') return;

    const target = event.target;
    const node = target instanceof HTMLElement ? target.closest<HTMLElement>('[data-id]') : null;
    const id = node?.dataset['id'];
    if (id === undefined) return;
    if (!gate.config.options.some((option) => option.id === id)) return;

    void this.answer(id);
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
      const node = this.#nodes.get(option.id);
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

  /** Снимает отметку варианта ответа при выходе из гейта. */
  #unmarkAnswerElements(): void {
    for (const id of this.#markedOptionIds) {
      const node = this.#nodes.get(id);
      if (!node) continue;
      delete node.dataset['answerOption'];
      node.style.cursor = '';
    }
    this.#markedOptionIds = [];
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

    await clock.context.resume();

    // Гейт ровно на нулевой секунде: остановиться надо ДО первого звука,
    // иначе зритель услышит начало фразы, к которой относится вопрос.
    //
    // Часы при этом обязаны встать в определённое состояние, а не остаться
    // «нигде»: источник не запущен, но и заморозки не было — и ответ на такой
    // гейт возобновлять неоткуда. Раньше этой строки не было, и ответ падал
    // с «Часы не в состоянии паузы» уже после того, как зритель нажал кнопку.
    if (this.#gateDueAt(0)) {
      clock.holdBeforeStart(0);
      this.#openGate();
      return;
    }

    clock.start(this.#state === 'ended' ? 0 : clock.position);
    if (this.#state === 'ended') this.#nextGateIndex = 0;
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
      const timeline = this.#requireTimeline();

      const position = clock.position;
      // Инвариант №2 в одной строке: время таймлайна = время аудио.
      timeline.seekSeconds(position);
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

      if (position >= clock.duration - 0.02) {
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
    if (this.#pending || this.#warming) return;

    const ctx = this.#ctx;
    const clock = this.#clock;
    if (!ctx || !clock) return;

    const next = nextNodeAtEnd(nodeOf(this.#project, this.#nodeId));
    if (next === undefined) return;

    const remaining = clock.duration - position;
    if (remaining > PRELOAD_AHEAD_S) return;

    const src = segmentOf(this.#project, next).src;
    if (!this.#tracks.has(src)) {
      this.#warmTrack(src);
      return;
    }
    if (remaining > SCHEDULE_AHEAD_S) return;

    const endsAt = clock.endsAtContextTime;
    if (endsAt === null) return;

    const leadTime = endsAt - ctx.currentTime;
    // Не успели запланировать — конец узла обработает #reachEndOfNode
    // остановленным переходом. Это не заглушка, а второй настоящий путь:
    // он даёт паузу вместо щелчка, и оба измерены в S9.
    if (leadTime <= 0) return;

    const buffer = this.#tracks.get(src);
    if (!buffer) return;

    const pendingClock = new AudioClock(ctx, buffer);
    const startsAt = pendingClock.start(0, { leadTime });
    this.#pending = { clock: pendingClock, nodeId: next, startsAt };
  }

  /** Подменяет сцену и часы, когда запланированный узел начал звучать. */
  #promotePendingIfStarted(): boolean {
    const pending = this.#pending;
    const ctx = this.#ctx;
    if (!pending || !ctx || ctx.currentTime < pending.startsAt) return false;

    this.#clock?.stop();
    this.#clock = pending.clock;
    this.#nodeId = pending.nodeId;
    this.#segment = segmentOf(this.#project, pending.nodeId);
    this.#pending = null;

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
   * Греет дорожку на опережение.
   *
   * Ошибка декодирования здесь не глушится, а откладывается до места, где
   * с ней можно что-то сделать: кэш останется пустым, и `#trackFor` бросит
   * на самом переходе — там, где отсутствие дорожки действительно мешает.
   * Ронять открытие гейта из-за дорожки, которая понадобится через минуту,
   * было бы хуже: зритель потерял бы работающее объяснение целиком.
   */
  #warmTrack(src: string): void {
    this.#warming = this.#trackFor(src)
      .catch(() => undefined)
      .finally(() => { this.#warming = null; });
  }

  /** Конец дорожки: либо дальше по ребру, либо объяснение закончилось. */
  async #reachEndOfNode(): Promise<void> {
    const next = nextNodeAtEnd(nodeOf(this.#project, this.#nodeId));
    if (next === undefined) {
      this.#finish();
      return;
    }
    await this.#goToNode(next);
  }

  /**
   * Переход на другой узел из ОСТАНОВЛЕННОГО состояния.
   *
   * Стыком в смысле S9 это не является: по гейту звук уже сведён рампой
   * в ноль и контекст подвешен (S3: 0 разрывов, 0 мс скачка), поэтому старт
   * следующего узла ничем не отличается от начала воспроизведения.
   */
  async #goToNode(nodeId: string): Promise<void> {
    const ctx = this.#requireContext();
    this.#stopFrameLoop();
    this.#dropPending();

    // Контекст подвешен freezeAt (clock.ts). Забыть разбудить — получить
    // ТИШИНУ, а не ошибку: источник запустится в остановленный контекст,
    // и ни один юнит-тест этого не увидит.
    if (ctx.state === 'suspended') await ctx.resume();

    this.#clock?.stop();
    this.#nodeId = nodeId;
    this.#segment = segmentOf(this.#project, nodeId);
    this.#clock = new AudioClock(ctx, await this.#trackFor(this.#segment.src));

    this.#mountSegment();
    this.#clock.start(0);
    this.#setState('playing');
    this.#startFrameLoop();
  }

  async #reachGate(): Promise<void> {
    const clock = this.#requireClock();
    const timeline = this.#requireTimeline();
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Гейт исчез между проверкой и остановкой');

    // Запланированный следующий узел снимается ДО остановки: иначе он
    // продолжил бы звучать поверх остановленного времени.
    this.#dropPending();

    // Время встаёт РОВНО на гейте, а не там, где мы успели заметить
    // пересечение: обнаружение ограничено длиной кадра (ADR-005).
    await clock.freezeAt(scheduled.at);
    timeline.seekSeconds(scheduled.at);
    this.#openGate();
  }

  #openGate(): void {
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Нет гейта для открытия');

    this.#stopFrameLoop();
    this.#stage.style.pointerEvents = 'auto';
    this.#setState('at-gate');
    // Время стоит — это единственный гарантированный простой во всём
    // объяснении, и других окон для декодирования не будет.
    this.#warmTargetsOf(scheduled.gate.id);
    const unboundOptions = this.#markAnswerElements(scheduled.gate);
    this.#events.onGateOpen?.(scheduled.gate, unboundOptions);
  }

  /** Греет дорожки всех продолжений этого гейта: что ответят — неизвестно. */
  #warmTargetsOf(gateId: string): void {
    const node = nodeOf(this.#project, this.#nodeId);
    for (const target of preloadTargetsOfGate(node, gateId)) {
      const src = segmentOf(this.#project, target).src;
      if (this.#tracks.has(src)) continue;
      this.#warmTrack(src);
    }
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
    const used = (this.#attempts.get(gate.id) ?? 0) + 1;
    this.#attempts.set(gate.id, used);

    const correct = isCorrect(gate, value);
    const exhausted = gate.maxAttempts !== null && used >= gate.maxAttempts;

    let outcome: GateAttempt['outcome'];
    if (correct) outcome = 'continue';
    else if (gate.onWrong === 'continue') outcome = 'continue';
    else if (gate.onWrong === 'reveal') outcome = 'reveal';
    else outcome = exhausted ? 'reveal' : 'retry';

    const attempt: GateAttempt = { gate, correct, attemptsUsed: used, outcome };
    // Запоминается ДО выхода из гейта: ребро графа выбирается этим исходом,
    // а `continueAfterReveal` вызывается позже и самого ответа уже не знает.
    this.#lastOutcome = { optionId: value, correct };
    this.#events.onGateResolved?.(attempt);

    if (outcome === 'continue') await this.#leaveGate();
    return attempt;
  }

  /** Продолжает после гейта, у которого исход был `reveal`. */
  async continueAfterReveal(): Promise<void> {
    if (this.#state !== 'at-gate') throw new Error('Нет открытого гейта');
    await this.#leaveGate();
  }

  async #leaveGate(): Promise<void> {
    const clock = this.#requireClock();
    this.#unmarkAnswerElements();
    this.#stage.style.pointerEvents = 'none';

    // Ответ мог оказаться развилкой. `undefined` означает «у этого гейта
    // рёбер нет», то есть это обычный гейт, и продолжать надо внутри узла —
    // самый частый случай, так устроены все фикстуры версии схемы 1.
    const gate = this.#gates[this.#nextGateIndex]?.gate;
    const outcome = this.#lastOutcome;
    const next = gate && outcome
      ? nextNodeAfterGate(nodeOf(this.#project, this.#nodeId), gate.id, outcome)
      : undefined;

    if (next !== undefined) {
      await this.#goToNode(next);
      return;
    }

    this.#nextGateIndex += 1;

    // Возобновление с ТОЙ ЖЕ позиции. Перемотки не возникает по построению:
    // источник стартует с числа, записанного при остановке.
    await clock.resumeFromFreeze();
    this.#setState('playing');
    this.#startFrameLoop();
  }

  #finish(): void {
    this.#stopFrameLoop();
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
    this.#dropPending();
    this.#resizeObserver?.disconnect();
    this.#clock?.stop();
    void this.#clock?.context.close();
    this.#stage.remove();
    this.#setState('idle');
  }

  #requireContext(): AudioContext {
    if (!this.#ctx) throw new Error('Плеер не загружен: сначала load()');
    return this.#ctx;
  }

  #requireClock(): AudioClock {
    if (!this.#clock) throw new Error('Плеер не загружен: сначала load()');
    return this.#clock;
  }

  #requireTimeline(): DrivenTimeline {
    if (!this.#timeline) throw new Error('Плеер не загружен: сначала load()');
    return this.#timeline;
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

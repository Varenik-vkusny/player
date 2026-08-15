/**
 * Часы проекта: позиция в аудио и есть время (инвариант №1).
 *
 * Перенесено из spikes/lib/audio-clock.mjs, где измерено спайками S0b, S2, S3.
 * Решение и обоснование — docs/adr/ADR-002-time-and-animation.md.
 */
import { releaseAudioUrl, resolveAudioUrl, type AudioSource } from './assets.js';

/** Насколько расхождение getOutputTimestamp с currentTime считается разумным. */
const SANITY_LIMIT_S = 1;

/** Длительность рампы усиления. Симметрична для затухания и нарастания. */
const DEFAULT_RAMP_MS = 8;

/** Запас, с которым источник планируется вперёд, чтобы попасть в расписание. */
const DEFAULT_LEAD_S = 0.02;

export interface TrackLoad {
  buffer: AudioBuffer;
  bytesDownloaded: number;
  decodeMs: number;
  decodedBytes: number;
}

/**
 * Загружает и декодирует дорожку целиком.
 *
 * Стриминга нет осознанно: часы строятся на контекстном времени, а медиаэлемент
 * как источник позиции непригоден (в Safari до 27 его currentTime квантуется
 * по 250 мс). Цена — память: 10 минут моно при 48 кГц занимают ~110 МБ.
 */
export async function loadTrack(ctx: BaseAudioContext, url: string): Promise<TrackLoad> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить дорожку ${url}: HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const startedAt = performance.now();
  const buffer = await ctx.decodeAudioData(bytes);
  return {
    buffer,
    bytesDownloaded: bytes.byteLength,
    decodeMs: performance.now() - startedAt,
    decodedBytes: buffer.length * buffer.numberOfChannels * 4,
  };
}

interface Anchor {
  /** Контекстное время, в которое запланирован старт источника. */
  ctxTime: number;
  /** Позиция в дорожке, с которой источник стартует. */
  mediaTime: number;
}

export interface ClockStartOptions {
  /** Насколько вперёд планировать старт. Так делается стык сегментов. */
  leadTime?: number;
  rampMs?: number;
}

/**
 * ЧАСЫ СЕГМЕНТА — то, что двигает время. Плеер не знает, что внутри.
 *
 * Решение [Р] product.md: часы это интерфейс, а не класс, даже пока
 * реализация одна. Продукт уже назвал ещё две — `timer` для немого
 * объяснения и `manual` для тренажёра, — и обе обязаны уметь ровно то же
 * самое: сказать позицию, встать РОВНО на числе и продолжить с него же.
 *
 * Почему сейчас, а не когда появится вторая реализация. Пока она одна,
 * извлечение механическое: ни одна строка плеера не меняет смысла. Когда
 * появится вторая, ту же работу придётся делать под давлением сроков
 * и с риском, что интерфейс подгонят под то, что уже написано.
 *
 * **Шкала планирования** — намеренно нейтральное имя. У аудио это
 * контекстное время `AudioContext`, монотонное и общее для всех часов
 * плеера; у `timer` это будет своё монотонное время. Плееру важно только
 * одно её свойство: в ней можно назначить событие на будущий момент
 * и попасть точно. На этом стоит стык сегментов (S9: расписание даёт
 * 0 разрывов против щелчка раз в двадцать переходов при опросе в кадре).
 */
export interface Clock {
  /** Длительность сегмента, секунды. */
  readonly duration: number;
  /** Позиция во времени сегмента, секунды. Это и есть время проекта. */
  readonly position: number;
  readonly isFrozen: boolean;
  readonly isRunning: boolean;

  /** Текущий момент шкалы планирования. */
  readonly scheduleNow: number;
  /**
   * Момент шкалы планирования, в который время кончится.
   * `null` — старта не было либо часы не умеют планировать вперёд.
   */
  readonly scheduleEnd: number | null;

  /** Запускает с позиции. Возвращает момент шкалы, в который стартует. */
  start(offset?: number, options?: ClockStartOptions): number;
  /** Останавливает время РОВНО на позиции. */
  freezeAt(position: number, options?: { rampMs?: number }): Promise<void>;
  /** Останавливает ДО первого движения времени: для гейта на нулевой секунде. */
  holdBeforeStart(position: number): void;
  /** Возобновляет с той же позиции. Перемотки не возникает по построению. */
  resumeFromFreeze(): Promise<void>;
  /** Будит часы, усыплённые остановкой. Без этого получишь ТИШИНУ, а не ошибку. */
  wake(): Promise<void>;
  stop(): void;
}

/**
 * Часы, которыми редактор двигает головку.
 *
 * Отдельно от `Clock`, а не добавкой в него, потому что перемотки у ЗРИТЕЛЯ
 * не существует: тест инвариантов следит, чтобы у `Player` не появилось ни
 * `seek`, ни `pause`. Положи `seek` в общий интерфейс — и плеер получил бы
 * его в руки, а запрет остался бы только на словах.
 *
 * Обе реализации — `AudioClock` и `SilentClock` — ему удовлетворяют.
 */
export interface EditorClock extends Clock {
  readonly context: AudioContext;
  seek(position: number): void;
}

/**
 * Откуда плеер берёт часы. Он их не конструирует — он их просит.
 *
 * Здесь же живёт кэш уже готовых источников: декодирование 49-секундной
 * дорожки стоит 63 мс, четыре кадра (S9), и ждать этого на стыке нельзя.
 * Кэш принадлежит источнику часов, а не плееру, потому что «что именно
 * греется» — свойство реализации: у `manual` греть нечего вовсе.
 */
export interface ClockSource {
  /** Часы для сегмента. Повторный запрос не готовит источник заново. */
  clockFor(source: AudioSource): Promise<Clock>;
  /** Часы, готовые ПРЯМО СЕЙЧАС, без ожидания. `null` — ещё не готовы. */
  clockIfReady(source: AudioSource): Clock | null;
  /** Греет источник на опережение. Ошибку откладывает до места, где она мешает. */
  warm(source: AudioSource): void;
  /** Отпускает всё, что держал. */
  close(): Promise<void>;
}

/**
 * Ключ кэша декодированных дорожек.
 *
 * Живёт ТОЛЬКО в памяти и никогда не попадает в проект. Именно поэтому здесь
 * допустима строка с префиксом, хотя в схеме она была бы ошибкой: в схеме
 * такая строка пережила бы сохранение и разъехалась бы по читателям,
 * а этот ключ не покидает карту внутри одного источника часов.
 */
function cacheKey(source: AudioSource): string {
  if (source.kind === 'url') return `url:${source.url}`;
  if (source.kind === 'file') return `file:${source.fileId}`;
  // Немому сегменту декодировать нечего, и в кэш дорожек он не попадает
  // ни разу: обе точки входа (`clockFor`, `clockIfReady`) отводят его
  // раньше, чем дело доходит до ключа. Ветка существует, чтобы перечисление
  // оставалось исчерпывающим и молчаливого `undefined` в ключе не возникло.
  throw new Error('У немого сегмента нет дорожки, а значит и ключа кэша');
}

export interface ClockDiagnostics {
  usesOutputTimestamp: boolean;
  outputLatencyMs: number;
  sampleRate: number;
}

/**
 * Часы, ведомые аудио.
 *
 * Позиция считается от ЯКОРЯ — пары (контекстное время, позиция в дорожке),
 * зафиксированной в момент старта. Благодаря этому пауза через ctx.suspend()
 * переживается без пересчёта: контекстные часы замирают вместе со звуком.
 */
export class AudioClock implements Clock {
  readonly #ctx: AudioContext;
  readonly #buffer: AudioBuffer;
  readonly #gain: GainNode;
  readonly #useOutputTimestamp: boolean;

  #source: AudioBufferSourceNode | null = null;
  #anchor: Anchor | null = null;
  #frozenPosition: number | null = null;

  constructor(ctx: AudioContext, buffer: AudioBuffer) {
    this.#ctx = ctx;
    this.#buffer = buffer;
    this.#gain = ctx.createGain();
    this.#gain.connect(ctx.destination);
    this.#useOutputTimestamp = isOutputTimestampUsable(ctx);
  }

  get context(): AudioContext { return this.#ctx; }
  get duration(): number { return this.#buffer.duration; }

  /**
   * Контекстное время, в которое дорожка доиграет. `null` — старта не было.
   *
   * Нужно, чтобы следующий узел графа можно было запланировать РОВНО на этот
   * момент, а не поймать конец опросом в кадре. S9 намерил цену опроса:
   * задержка 65 мс — это не длина кадра, а унаследованный `outputLatency`,
   * и раз в двадцать переходов на стыке щёлкает.
   *
   * Считается здесь, а не снаружи, потому что снаружи пришлось бы повторить
   * формулу якоря — а два описания одного вычисления расходятся тихо.
   */
  get scheduleEnd(): number | null {
    const anchor = this.#anchor;
    if (!anchor) return null;
    return anchor.ctxTime + (this.#buffer.duration - anchor.mediaTime);
  }

  /** Шкала планирования аудиочасов — контекстное время. */
  get scheduleNow(): number { return this.#ctx.currentTime; }

  /**
   * Будит контекст, если он усыплён остановкой на гейте.
   *
   * Забыть разбудить — получить ТИШИНУ, а не ошибку: источник запустится
   * в остановленный контекст, и ни один юнит-тест этого не увидит.
   */
  async wake(): Promise<void> {
    if (this.#ctx.state === 'suspended') await this.#ctx.resume();
  }

  get isFrozen(): boolean { return this.#frozenPosition !== null; }
  get isRunning(): boolean { return this.#source !== null && this.#frozenPosition === null; }

  get diagnostics(): ClockDiagnostics {
    return {
      usesOutputTimestamp: this.#useOutputTimestamp,
      outputLatencyMs: this.#ctx.outputLatency * 1000,
      sampleRate: this.#ctx.sampleRate,
    };
  }

  /** Подключает дополнительный приёмник к тому же сигналу, что идёт на выход. */
  connectTap(node: AudioNode): void {
    this.#gain.connect(node);
  }

  /**
   * Позиция в дорожке, секунды. Это и есть время проекта.
   * Во время паузы возвращает замороженное значение без пересчёта.
   */
  get position(): number {
    if (this.#frozenPosition !== null) return this.#frozenPosition;
    const anchor = this.#anchor;
    if (!anchor) return 0;

    const raw = anchor.mediaTime + (this.#audibleContextTime() - anchor.ctxTime);
    // Нижняя граница — точка якоря, а не ноль: до запланированного старта
    // не прозвучало ещё ничего, и позиция равна смещению старта.
    return Math.min(Math.max(raw, anchor.mediaTime), this.#buffer.duration);
  }

  /** Контекстное время сэмпла, который звучит ПРЯМО СЕЙЧАС. */
  #audibleContextTime(): number {
    if (this.#useOutputTimestamp) return this.#ctx.getOutputTimestamp().contextTime ?? 0;
    // Задержку читаем каждый раз: она меняется при смене устройства вывода
    // и равна нулю до начала воспроизведения.
    return this.#ctx.currentTime - (this.#ctx.baseLatency + this.#ctx.outputLatency);
  }

  /**
   * Запускает воспроизведение с указанной позиции.
   * AudioBufferSourceNode одноразовый: каждый старт создаёт новый узел
   * и заново фиксирует якорь.
   */
  start(offset = 0, options: ClockStartOptions = {}): number {
    if (this.#source) throw new Error('Источник уже запущен, сначала stop()');
    if (!(offset >= 0 && offset <= this.#buffer.duration)) {
      throw new RangeError(`Позиция ${offset} вне дорожки [0, ${this.#buffer.duration}]`);
    }

    const leadTime = options.leadTime ?? DEFAULT_LEAD_S;
    const rampMs = options.rampMs ?? DEFAULT_RAMP_MS;

    const source = this.#ctx.createBufferSource();
    source.buffer = this.#buffer;
    source.connect(this.#gain);

    const startAt = this.#ctx.currentTime + leadTime;

    // Нарастание, зеркальное затуханию при паузе. Без него выход прыгает
    // от тишины сразу к текущей амплитуде волны — это щелчок при КАЖДОМ
    // возобновлении, то есть в самом частом действии продукта (S3).
    this.#gain.gain.cancelScheduledValues(startAt);
    this.#gain.gain.setValueAtTime(0, startAt);
    this.#gain.gain.linearRampToValueAtTime(1, startAt + rampMs / 1000);
    source.start(startAt, offset);

    this.#source = source;
    this.#anchor = { ctxTime: startAt, mediaTime: offset };
    this.#frozenPosition = null;
    return startAt;
  }

  /**
   * Останавливает время РОВНО на targetPosition.
   *
   * Логическое время встаёт точно на цели, потому что мы его туда записываем,
   * а не «где успели затормозить»: обнаружение ограничено длиной кадра
   * (~18.7 мс), а требование к перелёту — 20 мс. Физическая остановка
   * происходит на несколько миллисекунд позже, когда звук уже сведён рампой
   * в ноль и слышать нечего.
   */
  async freezeAt(targetPosition: number, options: { rampMs?: number } = {}): Promise<void> {
    const source = this.#source;
    const anchor = this.#anchor;
    if (!source || !anchor) throw new Error('Нечего останавливать: источник не запущен');

    const ramp = (options.rampMs ?? DEFAULT_RAMP_MS) / 1000;
    const now = this.#ctx.currentTime;
    const target = anchor.ctxTime + (targetPosition - anchor.mediaTime);
    const rampEnd = Math.max(now + 0.001, target);

    this.#gain.gain.cancelScheduledValues(now);
    this.#gain.gain.setValueAtTime(this.#gain.gain.value, Math.max(now, rampEnd - ramp));
    this.#gain.gain.linearRampToValueAtTime(0, rampEnd);

    this.#frozenPosition = targetPosition;

    source.stop(rampEnd);
    source.disconnect();
    this.#source = null;

    await this.#ctx.suspend();
  }

  /**
   * Пауза ДО первого звука: логическая позиция записана, источник не запускался.
   *
   * Нужна для гейта в самом начале — первого, что построит автор на пустом
   * проекте. Там останавливаться надо раньше, чем прозвучит хоть один сэмпл,
   * поэтому `freezeAt` неприменим: ему нечего останавливать, он требует
   * запущенный источник и падает без него.
   *
   * Без этого состояния часы после такого гейта оставались «нигде»: не играют,
   * но и не заморожены, — и `resumeFromFreeze` справедливо отказывался
   * возобновлять с неизвестной позиции. ADR-005 требует, чтобы логическое
   * время записывалось явно; здесь оно записывается так же явно, как в
   * `freezeAt`, просто без звуковой части.
   *
   * Источник обязан быть не запущен: это не способ поставить паузу посреди
   * воспроизведения, для этого есть `freezeAt` с его рампой.
   */
  holdBeforeStart(position: number): void {
    if (this.#source) {
      throw new Error('Источник уже запущен: остановка до начала здесь неуместна');
    }
    if (!(position >= 0)) {
      throw new RangeError(`Позиция паузы до начала должна быть неотрицательной, получено ${position}`);
    }
    this.#frozenPosition = position;
  }

  /** Возобновляет с той же позиции. Перемотки не возникает по построению. */
  async resumeFromFreeze(): Promise<void> {
    if (this.#frozenPosition === null) throw new Error('Часы не в состоянии паузы');
    const at = this.#frozenPosition;
    await this.#ctx.resume();
    this.#frozenPosition = null;
    this.start(at);
  }

  /**
   * Перемотка на произвольную позицию.
   *
   * Существует ради редактора: автор таскает головку по дорожке, и без этого
   * ему пришлось бы заводить второй транспорт рядом с нашим — ровно та
   * причина, по которой отвергнут wavesurfer.js (docs/research/audio.md).
   * Реализация одна, здесь, с той же симметричной рампой: собственная
   * перемотка в редакторе вернула бы щелчок, разобранный в S3.
   *
   * У ЗРИТЕЛЯ перемотки не существует, и это не забыто: класс Player этот
   * метод не вызывает, а тест инвариантов следит, чтобы у Player не появилось
   * ни seek, ни pause. Возобновление после гейта по-прежнему идёт через
   * resumeFromFreeze с записанной позиции.
   */
  seek(position: number): void {
    if (!(position >= 0 && position <= this.#buffer.duration)) {
      throw new RangeError(`Позиция ${position} вне дорожки [0, ${this.#buffer.duration}]`);
    }

    const wasRunning = this.isRunning;
    if (this.#source) {
      this.#source.stop();
      this.#source.disconnect();
      this.#source = null;
    }

    if (wasRunning) {
      // Новый источник и новый якорь: одноразовость AudioBufferSourceNode
      // здесь не ограничение, а то, что делает перемотку точной.
      this.#anchor = null;
      this.#frozenPosition = null;
      this.start(position);
      return;
    }

    // Стоим — значит достаточно переписать замороженную позицию. Контекст
    // при этом не трогаем: он может быть усыплён паузой, и будить его,
    // чтобы просто передвинуть головку, незачем.
    this.#anchor = null;
    this.#frozenPosition = position;
  }

  stop(): void {
    if (this.#source) {
      this.#source.stop();
      this.#source.disconnect();
      this.#source = null;
    }
    this.#anchor = null;
    this.#frozenPosition = null;
  }
}

/**
 * Часы немого сегмента (схема v13): длительность объявлена, звука нет.
 *
 * **Почему это НЕ нарушает инвариант №1.** Время и у озвученного сегмента
 * берётся не из дорожки, а из `AudioContext`: `AudioClock.position` считает
 * его от якоря по контекстному времени, а буфер только звучит. Здесь ровно
 * тот же механизм и тот же контекст — просто без буфера. Никакого
 * `setInterval`, счётчика кадров или второго таймера не появляется, и часы
 * остаются теми же аппаратными, у которых S0b намерил наклон −0.014 мс/мин
 * за десять минут. → ADR-030
 *
 * От `AudioClock` расходится ровно в двух местах, и оба — следствие того,
 * что слушать нечего:
 *
 * 1. **Задержка вывода не вычитается.** У озвученного сегмента она нужна,
 *    чтобы картинка совпала с тем, что СЛЫШНО: `outputLatency` — это лаг
 *    между планированием сэмпла и его звучанием (S9 намерил на нём 65 мс
 *    задержки при опросе в кадре). Здесь выходом является сама картинка,
 *    совмещать её не с чем, и вычитание задержки сдвинуло бы слайды назад
 *    относительно расписания без всякой причины.
 * 2. **Рампы усиления нет.** Симметричная рампа в 8 мс существует против
 *    щелчка при возобновлении (S3), а щёлкать нечему.
 *
 * Заморозка при этом делается ТАК ЖЕ — через `ctx.suspend()`. Это не
 * подражание ради единообразия: приостановленный контекст останавливает
 * `currentTime`, и позиция переживает паузу без пересчёта. Своя арифметика
 * паузы была бы вторым описанием одного смысла.
 */
export class SilentClock implements Clock {
  readonly #ctx: AudioContext;
  readonly #duration: number;

  #anchor: Anchor | null = null;
  #frozenPosition: number | null = null;
  #running = false;

  constructor(ctx: AudioContext, durationSeconds: number) {
    if (!(durationSeconds > 0 && Number.isFinite(durationSeconds))) {
      throw new RangeError(
        `Длительность немого сегмента должна быть положительной, получено ${durationSeconds}`,
      );
    }
    this.#ctx = ctx;
    this.#duration = durationSeconds;
  }

  get context(): AudioContext { return this.#ctx; }
  get duration(): number { return this.#duration; }
  get scheduleNow(): number { return this.#ctx.currentTime; }

  get scheduleEnd(): number | null {
    const anchor = this.#anchor;
    if (!anchor) return null;
    return anchor.ctxTime + (this.#duration - anchor.mediaTime);
  }

  get isFrozen(): boolean { return this.#frozenPosition !== null; }
  get isRunning(): boolean { return this.#running && this.#frozenPosition === null; }

  async wake(): Promise<void> {
    if (this.#ctx.state === 'suspended') await this.#ctx.resume();
  }

  get position(): number {
    if (this.#frozenPosition !== null) return this.#frozenPosition;
    const anchor = this.#anchor;
    if (!anchor) return 0;

    const raw = anchor.mediaTime + (this.#ctx.currentTime - anchor.ctxTime);
    return Math.min(Math.max(raw, anchor.mediaTime), this.#duration);
  }

  start(offset = 0, options: ClockStartOptions = {}): number {
    if (this.#running) throw new Error('Часы уже запущены, сначала stop()');
    if (!(offset >= 0 && offset <= this.#duration)) {
      throw new RangeError(`Позиция ${offset} вне сегмента [0, ${this.#duration}]`);
    }

    // Опережение сохранено, хотя запускать нечего: на нём стоит СТЫК узлов.
    // Следующий узел планируется ровно на `scheduleEnd` предыдущего, и если
    // немой сегмент начнёт отсчёт не так, как озвученный, стык поедет ровно
    // на величину опережения — S9 намерил, что цена неточного стыка это
    // щелчок на одном переходе из двадцати.
    const startAt = this.#ctx.currentTime + (options.leadTime ?? DEFAULT_LEAD_S);

    this.#running = true;
    this.#anchor = { ctxTime: startAt, mediaTime: offset };
    this.#frozenPosition = null;
    return startAt;
  }

  async freezeAt(targetPosition: number): Promise<void> {
    if (!this.#running || !this.#anchor) {
      throw new Error('Нечего останавливать: часы не запущены');
    }
    this.#frozenPosition = targetPosition;
    this.#running = false;
    await this.#ctx.suspend();
  }

  holdBeforeStart(position: number): void {
    if (this.#running) {
      throw new Error('Часы уже запущены: остановка до начала здесь неуместна');
    }
    if (!(position >= 0)) {
      throw new RangeError(`Позиция паузы до начала должна быть неотрицательной, получено ${position}`);
    }
    this.#frozenPosition = position;
  }

  async resumeFromFreeze(): Promise<void> {
    if (this.#frozenPosition === null) throw new Error('Часы не в состоянии паузы');
    const at = this.#frozenPosition;
    await this.#ctx.resume();
    this.#frozenPosition = null;
    this.start(at);
  }

  /** Перемотка головки в редакторе. Смысл тот же, что у `AudioClock.seek`. */
  seek(position: number): void {
    if (!(position >= 0 && position <= this.#duration)) {
      throw new RangeError(`Позиция ${position} вне сегмента [0, ${this.#duration}]`);
    }

    const wasRunning = this.isRunning;
    this.#running = false;
    this.#anchor = null;
    this.#frozenPosition = null;

    if (wasRunning) {
      this.start(position);
      return;
    }
    this.#frozenPosition = position;
  }

  stop(): void {
    this.#running = false;
    this.#anchor = null;
    this.#frozenPosition = null;
  }
}

/**
 * Источник аудиочасов: один контекст, кэш декодированных дорожек.
 *
 * Контекст один на всю жизнь плеера намеренно: свой на каждый сегмент упёрся
 * бы в лимит браузера. Кэш живёт здесь, а не в плеере, потому что «дорожка
 * по пути» — это подробность аудио: часам режима `manual` греть нечего.
 */
export class AudioClocks implements ClockSource {
  #ctx: AudioContext | null = null;
  readonly #tracks = new Map<string, AudioBuffer>();
  /** Идёт декодирование — второй раз просить незачем. */
  readonly #warming = new Map<string, Promise<unknown>>();

  /**
   * Контекст создаётся лениво, при первом запросе часов.
   *
   * Создать его в конструкторе значило бы завести живой аудиоконтекст
   * у каждого плеера, который построили, но так и не загрузили.
   */
  #context(): AudioContext {
    this.#ctx ??= new AudioContext();
    return this.#ctx;
  }

  async clockFor(source: AudioSource): Promise<Clock> {
    const ctx = this.#context();
    // Немой сегмент не имеет дорожки, значит и кэшировать нечего: часы
    // строятся из объявленной длительности за ноль работы.
    if (source.kind === 'silent') return new SilentClock(ctx, source.seconds);

    const key = cacheKey(source);
    const cached = this.#tracks.get(key);
    if (cached) return new AudioClock(ctx, cached);

    // Единственное место во всём плеере, где источник превращается в адрес.
    // Адрес загруженного файла отзывается сразу после декодирования: дальше
    // живёт AudioBuffer, а удержанный blob-адрес держал бы в памяти ещё
    // и байты файла целиком.
    const url = await resolveAudioUrl(source);
    try {
      const track = await loadTrack(ctx, url);
      this.#tracks.set(key, track.buffer);
      return new AudioClock(ctx, track.buffer);
    } finally {
      releaseAudioUrl(source, url);
    }
  }

  clockIfReady(source: AudioSource): Clock | null {
    // Немые часы готовы ВСЕГДА: греть нечего, ждать нечего. Возврат null
    // здесь заставил бы стык узлов ловить конец опросом в кадре — а S9
    // намерил на этом 65 мс задержки и щелчок на одном переходе из двадцати.
    if (source.kind === 'silent') return new SilentClock(this.#context(), source.seconds);

    const buffer = this.#tracks.get(cacheKey(source));
    if (!buffer) return null;
    return new AudioClock(this.#context(), buffer);
  }

  /**
   * Греет дорожку на опережение.
   *
   * Ошибка декодирования здесь не глушится, а откладывается до места, где
   * с ней можно что-то сделать: кэш останется пустым, и `clockFor` бросит
   * на самом переходе — там, где отсутствие дорожки действительно мешает.
   * Ронять открытие гейта из-за дорожки, которая понадобится через минуту,
   * было бы хуже: зритель потерял бы работающее объяснение целиком.
   */
  warm(source: AudioSource): void {
    const key = cacheKey(source);
    if (this.#tracks.has(key) || this.#warming.has(key)) return;
    const pending = this.clockFor(source)
      .catch(() => undefined)
      .finally(() => { this.#warming.delete(key); });
    this.#warming.set(key, pending);
  }

  async close(): Promise<void> {
    const ctx = this.#ctx;
    this.#ctx = null;
    this.#tracks.clear();
    this.#warming.clear();
    if (ctx) await ctx.close();
  }
}

/**
 * Проверяет, вменяем ли getOutputTimestamp в этом браузере.
 *
 * В Safari он исторически возвращал contextTime, отличающийся от currentTime
 * на порядки. Молча подставить запасную формулу нельзя — это должно быть видно
 * в консоли, иначе расхождение будет списано на что угодно другое.
 */
function isOutputTimestampUsable(ctx: AudioContext): boolean {
  const timestamp = ctx.getOutputTimestamp?.();
  if (!timestamp || typeof timestamp.contextTime !== 'number') {
    console.warn('[clock] getOutputTimestamp недоступен, беру запасную формулу');
    return false;
  }
  const delta = Math.abs(timestamp.contextTime - ctx.currentTime);
  if (!(delta < SANITY_LIMIT_S)) {
    console.warn(
      `[clock] getOutputTimestamp невменяем: contextTime=${timestamp.contextTime}, `
      + `currentTime=${ctx.currentTime}, расхождение ${delta.toFixed(3)} с. Беру запасную формулу.`,
    );
    return false;
  }
  return true;
}

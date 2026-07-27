/**
 * Часы проекта: позиция в аудио и есть время (инвариант №1).
 *
 * Перенесено из spikes/lib/audio-clock.mjs, где измерено спайками S0b, S2, S3.
 * Решение и обоснование — docs/adr/ADR-002-time-and-animation.md.
 */

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
export class AudioClock {
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
  start(offset = 0, options: { leadTime?: number; rampMs?: number } = {}): number {
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

  /** Возобновляет с той же позиции. Перемотки не возникает по построению. */
  async resumeFromFreeze(): Promise<void> {
    if (this.#frozenPosition === null) throw new Error('Часы не в состоянии паузы');
    const at = this.#frozenPosition;
    await this.#ctx.resume();
    this.#frozenPosition = null;
    this.start(at);
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

/**
 * Транспорт редактора: воспроизведение, пауза, перемотка.
 *
 * React здесь нет намеренно. Это требование к устройству редактора, а не
 * стиль: вид рано или поздно перепишут целиком, и всё, что умеет продукт,
 * обязано пережить эту переписку. Компонент дорожки будет тонкой оболочкой
 * над этим классом.
 *
 * Второго транспорта при этом не появляется. Часы — тот самый AudioClock
 * из плеера, с теми же измеренными в S0b/S2/S3 свойствами: позиция считается
 * от якоря, пауза не рвёт звук, рампа усиления симметрична. Своей работы
 * со звуком у редактора ноль строк — ровно по той причине, по которой
 * отвергнут wavesurfer.js (docs/research/audio.md).
 *
 * Отличие от плеера одно: здесь перемотка есть. У зрителя её не существует
 * (инвариант №4), поэтому она живёт в часах, а не в классе Player.
 */
import { AudioClock, loadTrack } from '@player/player';

export type TransportState = 'idle' | 'loading' | 'ready' | 'playing' | 'failed';

export interface TransportEvents {
  /** Вызывается каждый кадр во время игры и один раз при любой перемотке. */
  readonly onPosition?: (seconds: number) => void;
  readonly onStateChange?: (state: TransportState) => void;
  /**
   * Дорожка не загрузилась.
   *
   * Не проглатывание ошибки, а её доставка тому, кто может что-то сделать.
   * Три эталонные фикстуры ссылаются на аудиофайлы, которых нет на диске,
   * и падение всего редактора лишило бы автора возможности править сцену
   * из-за отсутствующего звука. Причина показывается на дорожке дословно,
   * а не превращается в пустую волну, изображающую тишину.
   */
  readonly onLoadFailed?: (reason: string) => void;
}

export class Transport {
  readonly #events: TransportEvents;
  #ctx: AudioContext | null = null;
  #clock: AudioClock | null = null;
  #buffer: AudioBuffer | null = null;
  #state: TransportState = 'idle';
  #frame = 0;
  /** Позиция до загрузки дорожки: автор вправе двигать головку и раньше. */
  #pending = 0;

  constructor(events: TransportEvents = {}) {
    this.#events = events;
  }

  get state(): TransportState {
    return this.#state;
  }

  get isPlaying(): boolean {
    return this.#state === 'playing';
  }

  get positionSeconds(): number {
    return this.#clock ? this.#clock.position : this.#pending;
  }

  get durationSeconds(): number {
    return this.#buffer ? this.#buffer.duration : 0;
  }

  /** Декодированная дорожка — из неё считаются пики волны. */
  get buffer(): AudioBuffer | null {
    return this.#buffer;
  }

  /**
   * Загружает и декодирует дорожку.
   *
   * Контекст создаётся здесь же и остаётся усыплённым до первого жеста
   * автора: браузер не даст звучать раньше, и делать вид, что даст, незачем.
   */
  async load(src: string): Promise<AudioBuffer | null> {
    this.#setState('loading');
    const ctx = new AudioContext();
    this.#ctx = ctx;

    let buffer: AudioBuffer;
    try {
      ({ buffer } = await loadTrack(ctx, src));
    } catch (error) {
      // Причина доносится до автора дословно и остаётся видимой, а не
      // превращается в тишину. Редактор при этом продолжает работать:
      // сцену править можно и без звука.
      this.#setState('failed');
      // Путь обязателен в сообщении: «Unable to decode audio data» без него
      // не говорит автору, какой именно файл сломан, а в проекте дорожка
      // может быть не одна, когда появятся сегменты.
      const reason = error instanceof Error ? error.message : String(error);
      this.#events.onLoadFailed?.(`${src} — ${reason}`);
      return null;
    }

    this.#buffer = buffer;
    this.#clock = new AudioClock(ctx, buffer);
    // Позиция, выставленная до загрузки, не теряется.
    if (this.#pending > 0) this.#clock.seek(Math.min(this.#pending, buffer.duration));
    this.#setState('ready');
    this.#emitPosition();
    return buffer;
  }

  async play(): Promise<void> {
    const clock = this.#clock;
    if (!clock || this.#state === 'playing') return;
    // Контекст просыпается только по жесту автора — это политика браузера,
    // а не наша предосторожность.
    await clock.context.resume();

    if (clock.isFrozen) await clock.resumeFromFreeze();
    else clock.start(this.positionSeconds);

    this.#setState('playing');
    this.#startLoop();
  }

  async pause(): Promise<void> {
    const clock = this.#clock;
    if (!clock || this.#state !== 'playing') return;
    this.#stopLoop();
    // Останавливаемся ровно там, где стоим. Тот же приём, что у гейта:
    // время записывается, а звук сводится рампой, чтобы не щёлкнуло.
    await clock.freezeAt(clock.position);
    this.#setState('ready');
    this.#emitPosition();
  }

  /**
   * Перемотка. Во время игры звук продолжается с новой точки, в паузе —
   * просто переезжает головка.
   */
  seek(seconds: number): void {
    const clamped = Math.max(0, Math.min(seconds, this.durationSeconds || seconds));
    if (!this.#clock) {
      this.#pending = clamped;
      this.#emitPosition();
      return;
    }
    this.#clock.seek(clamped);
    this.#emitPosition();
  }

  destroy(): void {
    this.#stopLoop();
    this.#clock?.stop();
    void this.#ctx?.close();
    this.#clock = null;
    this.#ctx = null;
    this.#buffer = null;
    this.#setState('idle');
  }

  #startLoop(): void {
    const tick = (): void => {
      const clock = this.#clock;
      if (!clock || this.#state !== 'playing') return;
      this.#emitPosition();
      // Дорожка кончилась — останавливаемся сами, иначе позиция упрётся
      // в конец и будет молча стоять, делая вид, что всё идёт.
      if (clock.position >= clock.duration) {
        void this.pause();
        return;
      }
      this.#frame = requestAnimationFrame(tick);
    };
    this.#frame = requestAnimationFrame(tick);
  }

  #stopLoop(): void {
    if (this.#frame) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  #emitPosition(): void {
    this.#events.onPosition?.(this.positionSeconds);
  }

  #setState(state: TransportState): void {
    if (this.#state === state) return;
    this.#state = state;
    this.#events.onStateChange?.(state);
  }
}

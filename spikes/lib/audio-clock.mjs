// Часы проекта. Черновая реализация для спайков S1-S3.
//
// Ключевая идея (docs/research/audio.md §1.3): позиция считается не от
// ctx.currentTime напрямую, а от ЯКОРЯ — пары (контекстное время, медиавремя),
// зафиксированной в момент старта источника. Тогда пауза через ctx.suspend()
// переживается без пересчёта: контекстные часы замирают вместе со звуком,
// и якорь остаётся верным.
//
// Читаем позицию через getOutputTimestamp(), потому что нас интересует то, что
// СЛЫШНО прямо сейчас, а не то, что уже отдано звуковой подсистеме. Разница —
// это outputLatency: 0-20 мс на проводных, до 178 мс на Bluetooth.

const SANITY_LIMIT_S = 1;

/**
 * Проверяет, что getOutputTimestamp() в этом браузере вменяем.
 * В Safari он исторически возвращал contextTime, отличающийся от currentTime
 * на порядки. Молча подставлять запасной вариант нельзя — это должно быть видно.
 */
function outputTimestampUsable(ctx) {
  const ts = ctx.getOutputTimestamp?.();
  if (!ts || typeof ts.contextTime !== 'number') {
    console.warn('[audio-clock] getOutputTimestamp отсутствует или пуст, беру запасную формулу');
    return false;
  }
  const delta = Math.abs(ts.contextTime - ctx.currentTime);
  if (!(delta < SANITY_LIMIT_S)) {
    console.warn(
      `[audio-clock] getOutputTimestamp невменяем: contextTime=${ts.contextTime}, ` +
      `currentTime=${ctx.currentTime}, расхождение ${delta.toFixed(3)} с. Беру запасную формулу.`
    );
    return false;
  }
  return true;
}

export class AudioClock {
  #ctx;
  #buffer;
  #gain;
  #source = null;
  #anchor = null;
  #useOutputTimestamp;
  #frozenPosition = null;

  constructor(ctx, buffer) {
    this.#ctx = ctx;
    this.#buffer = buffer;
    this.#gain = ctx.createGain();
    this.#gain.connect(ctx.destination);
    this.#useOutputTimestamp = outputTimestampUsable(ctx);
  }

  /**
   * Подключает дополнительный приёмник к тому же сигналу, что идёт на выход.
   * Нужно для S3: щелчок надо искать в том, что реально прозвучало, а не
   * в том, что мы намеревались воспроизвести.
   */
  connectTap(node) {
    this.#gain.connect(node);
  }

  get context() { return this.#ctx; }
  get duration() { return this.#buffer.duration; }
  get usesOutputTimestamp() { return this.#useOutputTimestamp; }
  get running() { return this.#source !== null && this.#frozenPosition === null; }

  /** Контекстное время того сэмпла, который звучит ПРЯМО СЕЙЧАС. */
  #audibleContextTime() {
    if (this.#useOutputTimestamp) return this.#ctx.getOutputTimestamp().contextTime;
    // outputLatency читаем каждый раз: он меняется на лету при переключении
    // устройства вывода (воткнули наушники — значение скачет).
    return this.#ctx.currentTime - (this.#ctx.baseLatency + this.#ctx.outputLatency);
  }

  /**
   * Позиция в дорожке, секунды. Это и есть «время проекта».
   * Во время паузы возвращает замороженное значение — ровно то, на котором
   * встали, без пересчёта.
   */
  get position() {
    if (this.#frozenPosition !== null) return this.#frozenPosition;
    if (!this.#anchor) return 0;
    const raw = this.#anchor.mediaTime + (this.#audibleContextTime() - this.#anchor.ctxTime);
    // Нижняя граница — точка якоря, а не ноль. Источник планируется на несколько
    // миллисекунд вперёд, и до этого момента не прозвучало ещё ничего: позиция
    // равна смещению старта, а не «чуть раньше него».
    return Math.min(Math.max(raw, this.#anchor.mediaTime), this.#buffer.duration);
  }

  /**
   * Запускает воспроизведение с указанной позиции.
   * AudioBufferSourceNode одноразовый — каждый старт создаёт новый узел,
   * и каждый старт заново фиксирует якорь.
   */
  start(offset = 0, { leadTime = 0.02, rampMs = 8 } = {}) {
    if (this.#source) throw new Error('Источник уже запущен, сначала stop()');
    if (offset < 0 || offset > this.#buffer.duration) {
      throw new Error(`Позиция ${offset} вне дорожки [0, ${this.#buffer.duration}]`);
    }

    const source = this.#ctx.createBufferSource();
    source.buffer = this.#buffer;
    source.connect(this.#gain);

    // Небольшой запас вперёд, чтобы попасть в расписание, а не в прошлое.
    const startAt = this.#ctx.currentTime + leadTime;

    // Нарастание, зеркальное затуханию при паузе. Без него выход прыгает
    // от тишины сразу к текущей амплитуде волны — это щелчок, слышимый
    // при каждом возобновлении. Симметрия здесь не эстетика, а требование:
    // разрыв сигнала одинаково слышен в обе стороны.
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
   * Останавливает время ровно на targetPosition.
   *
   * Логическое время встаёт ТОЧНО на цели — потому что мы его туда и записываем,
   * а не «где успели затормозить». Физическая остановка происходит на несколько
   * миллисекунд позже, но звук к этому моменту уже сведён в ноль рампой, так что
   * услышать этот хвост нельзя. Возобновление стартует новый источник с offset =
   * targetPosition, поэтому перемотки не возникает по построению.
   *
   * @param {number} targetPosition — позиция гейта, секунды
   * @param {number} rampMs — длительность рампы гейна, миллисекунды
   */
  async freezeAt(targetPosition, { rampMs = 8 } = {}) {
    if (!this.#source) throw new Error('Нечего останавливать: источник не запущен');

    const ramp = rampMs / 1000;
    const now = this.#ctx.currentTime;
    // Рампа заканчивается тогда, когда до выхода дойдёт целевая позиция.
    const target = this.#anchor.ctxTime + (targetPosition - this.#anchor.mediaTime);
    const rampEnd = Math.max(now + 0.001, target);

    this.#gain.gain.cancelScheduledValues(now);
    this.#gain.gain.setValueAtTime(this.#gain.gain.value, Math.max(now, rampEnd - ramp));
    this.#gain.gain.linearRampToValueAtTime(0, rampEnd);

    this.#frozenPosition = targetPosition;

    this.#source.stop(rampEnd);
    this.#source.disconnect();
    this.#source = null;

    await this.#ctx.suspend();
    return { frozenAt: targetPosition, rampEndCtxTime: rampEnd };
  }

  /** Возобновляет с той же позиции, на которой встали. */
  async resumeFromFreeze() {
    if (this.#frozenPosition === null) throw new Error('Не в состоянии паузы');
    const at = this.#frozenPosition;
    await this.#ctx.resume();
    this.#frozenPosition = null;
    return this.start(at);
  }

  stop() {
    if (this.#source) {
      this.#source.stop();
      this.#source.disconnect();
      this.#source = null;
    }
    this.#anchor = null;
    this.#frozenPosition = null;
  }
}

/** Загружает и декодирует дорожку целиком. Стриминга нет — это осознанная цена. */
export async function loadTrack(ctx, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить ${url}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const t0 = performance.now();
  const buffer = await ctx.decodeAudioData(bytes);
  return {
    buffer,
    bytesDownloaded: bytes.byteLength,
    decodeMs: performance.now() - t0,
    decodedBytes: buffer.length * buffer.numberOfChannels * 4,
  };
}

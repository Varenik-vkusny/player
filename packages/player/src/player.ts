/**
 * Рантайм плеера: часы, ведомый таймлайн, рендер и гейты в одном месте.
 *
 * Главный принцип: всё на экране — чистая функция от одного числа, позиции
 * в аудио. Каждый кадр это число берётся у часов и раздаётся остальным.
 */
import type { Gate, Project } from '@player/core';
import { resolveTimeRef } from '@player/core';

import { AudioClock, loadTrack } from './clock.js';
import { applyFit, renderScene } from './render.js';
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

export interface PlayerEvents {
  onStateChange?: (state: PlayerState) => void;
  onGateOpen?: (gate: Gate) => void;
  onGateResolved?: (attempt: GateAttempt) => void;
  onFrame?: (positionSeconds: number) => void;
}

interface ScheduledGate {
  gate: Gate;
  at: number;
}

export class Player {
  readonly #host: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #project: Project;
  readonly #events: PlayerEvents;

  #clock: AudioClock | null = null;
  #timeline: DrivenTimeline | null = null;
  #gates: ScheduledGate[] = [];
  #nextGateIndex = 0;
  #attempts = new Map<string, number>();
  #state: PlayerState = 'idle';
  #frameHandle: number | null = null;
  #resizeObserver: ResizeObserver | null = null;

  constructor(host: HTMLElement, project: Project, events: PlayerEvents = {}) {
    this.#host = host;
    this.#project = project;
    this.#events = events;

    this.#stage = document.createElement('div');
    this.#stage.className = 'player-stage';
    // Инвариант №3: вне гейта сцена физически недоступна для мыши.
    // Обработчики при этом никогда не снимаются — недоступность обеспечивает
    // браузер, а не наша аккуратность.
    this.#stage.style.pointerEvents = 'none';
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

    const stage = {
      width: this.#project.meta.stageWidth,
      height: this.#project.meta.stageHeight,
    };
    const nodes = renderScene(this.#stage, this.#project.scene, stage);
    this.#fit();

    // Пересчёт масштаба при изменении размера окна. Масштаб всегда берётся
    // из актуальных размеров, а не из сохранённого значения (ADR-007).
    this.#resizeObserver = new ResizeObserver(() => this.#fit());
    this.#resizeObserver.observe(this.#host);

    const ctx = new AudioContext();
    const track = await loadTrack(ctx, this.#project.audio.src);
    this.#clock = new AudioClock(ctx, track.buffer);

    this.#timeline = buildTimeline(
      this.#project.scene.cues,
      nodes,
      this.#project.audio.words,
      { audioDuration: track.buffer.duration },
    );

    // Гейты разрешаются в секунды один раз и сортируются: дальше плеер
    // движется по ним строго вперёд, потому что перемотки не существует.
    this.#gates = this.#project.scene.gates
      .map((gate) => ({ gate, at: resolveTimeRef(gate.at, this.#project.audio.words) }))
      .sort((a, b) => a.at - b.at);
    this.#nextGateIndex = 0;

    // Первый кадр рисуется сразу: до нажатия на «играть» зритель должен
    // видеть сцену в состоянии нулевой секунды, а не пустоту.
    this.#timeline.seekSeconds(0);
    this.#setState('ready');
  }

  #fit(): void {
    applyFit(this.#stage, this.#host.clientWidth, this.#host.clientHeight, {
      width: this.#project.meta.stageWidth,
      height: this.#project.meta.stageHeight,
    });
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
    if (this.#gateDueAt(0)) {
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
    const clock = this.#requireClock();
    const timeline = this.#requireTimeline();

    const frame = (): void => {
      if (this.#state !== 'playing') return;

      const position = clock.position;
      // Инвариант №2 в одной строке: время таймлайна = время аудио.
      timeline.seekSeconds(position);
      this.#events.onFrame?.(position);

      if (this.#gateDueAt(position)) {
        void this.#reachGate();
        return;
      }
      if (position >= clock.duration - 0.02) {
        this.#finish();
        return;
      }
      this.#frameHandle = requestAnimationFrame(frame);
    };
    this.#frameHandle = requestAnimationFrame(frame);
  }

  async #reachGate(): Promise<void> {
    const clock = this.#requireClock();
    const timeline = this.#requireTimeline();
    const scheduled = this.#gates[this.#nextGateIndex];
    if (!scheduled) throw new Error('Гейт исчез между проверкой и остановкой');

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
    this.#events.onGateOpen?.(scheduled.gate);
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
    this.#stage.style.pointerEvents = 'none';
    this.#nextGateIndex += 1;

    // Возобновление с ТОЙ ЖЕ позиции. Перемотки не возникает по построению:
    // источник стартует с числа, записанного при остановке.
    await clock.resumeFromFreeze();
    this.#setState('playing');
    this.#startFrameLoop();
  }

  #finish(): void {
    this.#stopFrameLoop();
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
    this.#resizeObserver?.disconnect();
    this.#clock?.stop();
    void this.#clock?.context.close();
    this.#stage.remove();
    this.#setState('idle');
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

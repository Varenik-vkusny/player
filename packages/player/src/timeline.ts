/**
 * Ведомый таймлайн: он создаётся в паузе и НИКОГДА не играет сам (инвариант №2).
 *
 * Главный цикл движка выключается глобально — после этого anime.js физически
 * не может двигать время. Это не «мы не вызываем play», а «цикла не существует».
 */
import { createTimeline, engine } from 'animejs';
import type { Cue, Word } from '@player/core';
import { resolveTimeRef } from '@player/core';

/**
 * Выключает главный цикл движка. Вызывается один раз при инициализации плеера.
 *
 * Вынесено в функцию, а не в побочный эффект модуля, чтобы факт выключения
 * был виден в коде плеера, а не прятался в импорте.
 */
export function disableEngineMainLoop(): void {
  engine.useDefaultMainLoop = false;
}

export interface DrivenTimeline {
  /** Выставляет время таймлайна, секунды. Единственный способ его двигать. */
  seekSeconds(seconds: number): void;
  /** Длительность таймлайна, секунды. */
  readonly durationSeconds: number;
}

export interface BuildTimelineOptions {
  /**
   * Длительность дорожки, секунды.
   *
   * Таймлайн ОБЯЗАН покрывать всю дорожку: при выставлении времени за пределы
   * своей длительности anime.js прижимает его к концу. Время замрёт, пока
   * аудио идёт, и ошибки при этом не будет — оно просто тихо перестанет
   * двигаться (обнаружено в S1).
   */
  audioDuration: number;
}

/** Узел, к которому anime.js применяет анимацию. */
type Target = HTMLElement;

export function buildTimeline(
  cues: readonly Cue[],
  nodes: ReadonlyMap<string, Target>,
  words: readonly Word[],
  options: BuildTimelineOptions,
): DrivenTimeline {
  const timeline = createTimeline({ autoplay: false });

  for (const cue of cues) {
    const node = nodes.get(cue.targetId);
    if (!node) {
      // Валидация схемы это уже проверила; если мы здесь — расхождение между
      // проверенным проектом и построенной сценой, и оно должно быть громким.
      throw new Error(`Анимация «${cue.id}» ссылается на элемент «${cue.targetId}», которого нет на сцене`);
    }

    const at = resolveTimeRef(cue.at, words);
    const { property, from, to, duration, ease } = cue.animation;

    timeline.add(
      node,
      {
        [property]: from === undefined ? to : [from, to],
        duration,
        ease,
      },
      at * 1000,
    );
  }

  // Распорка до конца дорожки. Анимация «из единицы в единицу» ничего не
  // меняет визуально, но задаёт длительность таймлайна, чтобы время не
  // упиралось в конец последней анимации.
  const spanMs = options.audioDuration * 1000;
  if (spanMs > timeline.duration) {
    const anyNode = nodes.values().next().value;
    if (anyNode) timeline.add(anyNode, { opacity: [1, 1], duration: spanMs }, 0);
  }

  return {
    seekSeconds(seconds: number): void {
      timeline.currentTime = seconds * 1000;
    },
    get durationSeconds(): number {
      return timeline.duration / 1000;
    },
  };
}

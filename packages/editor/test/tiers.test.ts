import { describe, expect, test } from 'vitest';

import {
  clampTrackHeight,
  COLLAPSE_PULL,
  hiddenNote,
  laneHeight,
  lanesOf,
  minHeightOf,
  resolveDrag,
  TRACK_MAX_H,
  TRACK_MIN_H,
  trackTier,
  type TrackTier,
} from '../src/track/tiers.js';

const TIERS: readonly TrackTier[] = ['full', 'compact', 'dense', 'minimal'];

describe('ступени дорожки: сколько полос помещается в высоту', () => {
  test('порог каждой ступени — это её собственная высота, с обеих сторон', () => {
    // Ради чего тест: порог, съехавший на пиксель, даёт ступень, которая
    // не помещается в отведённую ей высоту, — полоса обрезается молча.
    for (const tier of TIERS) {
      expect(trackTier(minHeightOf(tier)), `на своей высоте ${tier}`).toBe(tier);
    }
    // И на пиксель ниже — уже НЕ она, кроме самой тесной, ниже которой
    // высота не опускается вовсе.
    for (const tier of TIERS) {
      if (tier === 'minimal') continue;
      expect(trackTier(minHeightOf(tier) - 1), `на пиксель ниже ${tier}`).not.toBe(tier);
    }
  });

  test('чем просторнее ступень, тем больше её высота', () => {
    // Покраснеет, если перепутать перечни полос местами: тогда «тесная»
    // ступень окажется выше «просторной», и trackTier начнёт выбирать
    // не ту при каждой высоте.
    const heights = TIERS.map(minHeightOf);
    const sortedDescending = [...heights].sort((a, b) => b - a);
    expect(heights).toEqual(sortedDescending);
  });

  test('все высоты целые', () => {
    // Грабля Сессии 18: дробная высота протекает вверх по flex-колонке
    // до .ed-stage-host и роняет e2e про целые размеры сцены.
    for (const tier of TIERS) {
      expect(Number.isInteger(minHeightOf(tier)), `высота ${tier}`).toBe(true);
      for (const lane of lanesOf(tier)) {
        expect(Number.isInteger(laneHeight(lane, tier)), `полоса ${lane} на ${tier}`).toBe(true);
      }
    }
    expect(Number.isInteger(clampTrackHeight(200.4))).toBe(true);
  });

  test('самая тесная ступень показывает СЛИТУЮ полосу меток', () => {
    // Это сегодняшнее поведение продукта, и оно обязано остаться живым:
    // слитый путь MarksLane иначе становится мёртвым кодом, который
    // однажды тихо перестанет работать.
    expect(lanesOf('minimal')).toContain('marks');
    expect(lanesOf('minimal')).not.toContain('slides');
    expect(lanesOf('minimal')).not.toContain('stops');
  });

  test('просторные ступени показывают слайды и остановки РАЗДЕЛЬНО', () => {
    for (const tier of ['full', 'compact', 'dense'] as const) {
      expect(lanesOf(tier), `${tier} разделяет метки`).toContain('slides');
      expect(lanesOf(tier), `${tier} разделяет метки`).toContain('stops');
      expect(lanesOf(tier), `${tier} не сливает метки`).not.toContain('marks');
    }
  });

  test('волна ужимается раньше меток', () => {
    // Метка при 20 px перестаёт быть мишенью, а волна остаётся волной —
    // поэтому первой сжимается именно она.
    expect(laneHeight('sound', 'compact')).toBeLessThan(laneHeight('sound', 'full'));
    expect(laneHeight('slides', 'compact')).toBe(laneHeight('slides', 'full'));
    expect(laneHeight('ruler', 'compact')).toBe(laneHeight('ruler', 'full'));
  });
});

describe('тяга и складывание', () => {
  test('на самом минимуме дорожка НЕ складывается', () => {
    expect(resolveDrag(TRACK_MIN_H)).toEqual({ collapsed: false, height: TRACK_MIN_H });
  });

  test('запас складывания РЕАЛЬНЫЙ: 10 px ниже минимума ещё не складывают', () => {
    // Число здесь намеренно ЛИТЕРАЛ, а не COLLAPSE_PULL. Через саму константу
    // тест оказался декоративным: он проходил и при COLLAPSE_PULL === 0, то
    // есть не проверял того, что называл. Свойство продукта такое: рука,
    // промахнувшаяся на десяток пикселей ниже минимума, НЕ складывает дорожку.
    expect(resolveDrag(TRACK_MIN_H - 10).collapsed).toBe(false);
    expect(COLLAPSE_PULL).toBeGreaterThanOrEqual(10);
  });

  test('утянутая за запас кромка складывает дорожку', () => {
    expect(resolveDrag(TRACK_MIN_H - COLLAPSE_PULL - 1).collapsed).toBe(true);
    expect(resolveDrag(0).collapsed).toBe(true);
  });

  test('сложенная дорожка запоминает высоту не меньше минимума', () => {
    // Иначе разворачивание показало бы дорожку такой же нечитаемой,
    // до какой её дотянули, — то есть кнопка «развернуть» не работала бы.
    const pulled = resolveDrag(-500);
    expect(pulled.collapsed).toBe(true);
    expect(pulled.height).toBeGreaterThanOrEqual(TRACK_MIN_H);
  });

  test('высота зажимается с обеих сторон', () => {
    expect(clampTrackHeight(TRACK_MAX_H + 500)).toBe(TRACK_MAX_H);
    expect(clampTrackHeight(TRACK_MIN_H - 500)).toBe(TRACK_MIN_H);
  });
});

describe('скрытая полоса называет себя', () => {
  test('ступени, которые ничего не прячут, молчат', () => {
    expect(hiddenNote('full')).toBeUndefined();
    expect(hiddenNote('compact')).toBeUndefined();
  });

  test('ступени, которые прячут, говорят об этом', () => {
    // Правило screens.md §6 «погашенное управление обязано назвать причину»,
    // применённое к спрятанному: иначе автор решит, что полосы нет в проекте.
    for (const tier of ['dense', 'minimal'] as const) {
      const note = hiddenNote(tier);
      expect(note, `${tier} обязана назвать скрытое`).toBeDefined();
      expect(note?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test('молчат ровно те, у кого полос столько же, сколько у самой просторной', () => {
    // Связывает подсказку с фактом, а не с перечислением ступеней вручную:
    // добавив ступень и забыв подсказку, получишь красное.
    const widest = lanesOf('full').length;
    for (const tier of TIERS) {
      const hidesSomething = lanesOf(tier).length < widest;
      expect(hiddenNote(tier) !== undefined, `${tier} прячет: ${hidesSomething}`).toBe(
        hidesSomething,
      );
    }
  });
});

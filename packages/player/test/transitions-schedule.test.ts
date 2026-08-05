/**
 * Арифметика расписания фикстуры `fixtures/projects/transitions.json`.
 *
 * Числа в `docs/design/transitions-fixture.md` §3 гниют: сдвинули метку —
 * доля вышла из окна перехода, а скриншотные эталоны остались зелёными,
 * потому что покой снимается не хуже движения (§1 того же документа).
 * Этот тест — единственная защита арифметики расписания, не зависящая
 * от снимка.
 *
 * Расписание считается через `phaseAt`/`morphSecondsFor` плеера, а не своей
 * формулой: свой пересчёт стал бы вторым описанием одного и того же
 * расписания и разошёлся бы с ним тихо (см. предупреждение в шапке
 * `e2e/morph.spec.ts`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject, TRANSITIONS } from '@player/core';
import { morphSecondsFor, phaseAt, type SlideSchedule } from '@player/player';

const FIXTURE_PATH = fileURLToPath(
  new URL('../../../fixtures/projects/transitions.json', import.meta.url),
);

function loadFixture() {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
  return loadProject(raw);
}

/** Строит расписание слайдов ровно так, как это делает плеер. */
function scheduleOf(project: ReturnType<typeof loadFixture>): SlideSchedule[] {
  const segment = project.segments[0]!;
  const slides = segment.slides;
  const seconds = slides.map((slide) => {
    if (slide.at.kind !== 'seconds') throw new Error('фикстура transitions.json обязана нести только секундные метки');
    return slide.at.t;
  });

  return slides.map((slide, index) => ({
    seconds: seconds[index]!,
    morphSeconds: morphSecondsFor(slide.transition, slide.transitionSeconds, index, seconds),
  }));
}

describe('расписание transitions.json: три доли внутри окон перехода', () => {
  const project = loadFixture();
  const schedule = scheduleOf(project);

  it('доли 12.15 / 24.30 / 36.45 попадают ВНУТРЬ окна перехода', () => {
    // §3 спецификации: доля 0.25 окна dissolve (11.75–13.35), доля 0.75 окна
    // scale (23.10–24.70), доля 0.30 окна wipe (35.85–37.85).
    expect(phaseAt(schedule, 12.15)).toEqual({ kind: 'morph', index: 3 });
    expect(phaseAt(schedule, 24.30)).toEqual({ kind: 'morph', index: 5 });
    expect(phaseAt(schedule, 36.45)).toEqual({ kind: 'morph', index: 7 });
  });

  it('доли 0 и 48.6 (начало и конец дорожки) — покой, а не переход', () => {
    expect(phaseAt(schedule, 0).kind).toBe('still');
    expect(phaseAt(schedule, 48.6).kind).toBe('still');
  });

  it('у каждого слайда объявленная transitionSeconds не режется расстоянием до предыдущей метки', () => {
    // Если бы gap оказался меньше, morphSecondsFor (`Math.min(transitionSeconds,
    // gap)`, morph.ts:73) урезал бы длительность, и объявленное в файле число
    // разошлось бы с играемым — ровно тот дефект, который §3 называет
    // «худшим видом оснастки».
    const segment = project.segments[0]!;
    const slides = segment.slides;
    for (let i = 1; i < slides.length; i++) {
      const gap = slides[i]!.at.kind === 'seconds' && slides[i - 1]!.at.kind === 'seconds'
        ? (slides[i]!.at as { t: number }).t - (slides[i - 1]!.at as { t: number }).t
        : Number.NaN;
      expect(slides[i]!.transitionSeconds, `слайд ${slides[i]!.id}`).toBeLessThanOrEqual(gap);
    }
  });

  it('приёмы фикстуры покрывают перечисление TRANSITIONS целиком', () => {
    const used = new Set(project.segments[0]!.slides.map((slide) => slide.transition));
    expect([...used].sort()).toEqual([...TRANSITIONS].sort());
  });
});

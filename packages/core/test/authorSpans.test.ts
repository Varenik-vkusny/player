/**
 * Отрезки «моё» — схема v14.
 *
 * До v14 промежуток был НЕВЫРАЗИМ: слайд хранит состояние в точке, а «с 1-й
 * по 3-ю секунду хозяин — автор» двумя точками не записывается. Поэтому
 * первый тест здесь непуст — он проверяет то, чего раньше не существовало.
 *
 * Каждому тесту ниже назван СЛОМ: что именно надо испортить, чтобы он
 * покраснел. Тест, для которого слома не находится, — декоративный.
 *
 * → docs/adr/ADR-032-viewer-rights.md, docs/design/bubble.md §2
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject } from '../src/load.js';
import { resolveTimeRef } from '../src/time.js';
import type { Project } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

/** Фикстура v14 с правкой: удобнее ломать её точечно, чем городить проект руками. */
function tweaked(change: (project: any) => void): any {
  const project = raw('bubble-spans.json');
  change(project);
  return project;
}

describe('отрезки «моё»: разбор', () => {
  it('отрезки доезжают до модели, и края разрешаются в секунды', () => {
    // СЛОМ: убрать `authorSpans` из SegmentSchema — поле отбросится молча
    // (Zod выкидывает незнакомые ключи без единого слова), и длина станет 0.
    // СЛОМ-2: сдвинуть `wordIndex` первого края на 1 — 1.0 станет 1.3.
    const project: Project = loadProject(raw('bubble-spans.json'));
    const segment = project.segments[0]!;
    const words = segment.audio.words;

    expect(segment.authorSpans).toHaveLength(2);

    const seconds = segment.authorSpans.map((span) => [
      resolveTimeRef(span.from, words),
      resolveTimeRef(span.to, words),
    ]);

    // Первый отрезок привязан к СЛОВАМ, второй к секундам: инвариант №10
    // разрешает секунды там, где слова нет, и фикстура обязана задействовать
    // оба вида — иначе половина закона остаётся непроверенной.
    expect(seconds).toEqual([[1, 3], [7, 9]]);
    expect(segment.authorSpans[0]!.from.kind).toBe('word');
    expect(segment.authorSpans[1]!.from.kind).toBe('seconds');
  });

  it('старому проекту миграция даёт ПУСТОЙ список, а не выдуманный', () => {
    // Умолчание обязано воспроизводить сегодняшнее поведение: помеченных
    // элементов нет, значит зритель не трогает ничего.
    //
    // СЛОМ: поставить в схеме `.default([{ elementId: 'head', ... }])` —
    // и капля в каждом старом объяснении окажется во власти автора там,
    // где раньше была ничья.
    const project = loadProject(raw('video.json'));

    expect(raw('video.json').schemaVersion).toBe(11);
    expect(project.segments[0]!.authorSpans).toEqual([]);
  });
});

describe('отрезки «моё»: что схема делает невыразимым', () => {
  it('отрезок на несуществующем элементе не разбирается', () => {
    // СЛОМ: убрать проверку `elementIds.has(span.elementId)`. Разбор пройдёт,
    // а полоса нарисует клип, за которым нет элемента, — и «кто хозяин»
    // станет вопросом без ответа.
    const project = tweaked((p) => {
      p.segments[0].authorSpans[0].elementId = 'нет-такого';
    });

    expect(() => loadProject(project)).toThrow(/нет-такого/);
  });

  it('отрезок нулевой длины не разбирается', () => {
    // Владеть нечем: это описка, а не «мгновение автора».
    // СЛОМ: заменить `to <= from` на `to < from` — нулевой отрезок пройдёт.
    const project = tweaked((p) => {
      p.segments[0].authorSpans[1] = {
        elementId: 'head',
        from: { kind: 'seconds', t: 7 },
        to: { kind: 'seconds', t: 7 },
      };
    });

    expect(() => loadProject(project)).toThrow(/не позже/);
  });

  it('перекрывающиеся отрезки ОДНОГО элемента не разбираются', () => {
    // Хозяин бинарен — на этом стоит всё решение владельца. Два отрезка
    // внахлёст означали бы двух хозяев одновременно, то есть ровно тот
    // конфликт, ради снятия которого отрезки и выбраны вместо приоритетов.
    //
    // СЛОМ: убрать сравнение `from < previousEnd` — разбор пройдёт.
    const project = tweaked((p) => {
      p.segments[0].authorSpans[1] = {
        elementId: 'head',
        from: { kind: 'seconds', t: 2 },
        to: { kind: 'seconds', t: 8 },
      };
    });

    expect(() => loadProject(project)).toThrow(/перекрываются/);
  });

  it('отрезки РАЗНЫХ элементов пересекаться вправе', () => {
    // Этот тест ловит ошибку, которая была допущена и поймана при написании
    // самой проверки: общий счётчик конца вместо счётчика ПО ЭЛЕМЕНТУ.
    // У каждого элемента свой хозяин в свой момент, и время у них общее.
    //
    // СЛОМ: заменить `lastEndOf` (Map по элементу) на одну переменную —
    // тест немедленно покраснеет, а три теста выше останутся зелёными.
    const project = tweaked((p) => {
      p.segments[0].elements.push({ id: 'second-head', type: 'video', content: '/video/talking-head.mp4' });
      for (const slide of p.segments[0].slides) {
        slide.states['second-head'] = {
          x: 0, y: 0, width: 100, height: 100,
          rotation: 0, zIndex: 3, opacity: 1, visible: true, style: {},
        };
      }
      p.segments[0].authorSpans.push({
        elementId: 'second-head',
        from: { kind: 'seconds', t: 2 },
        to: { kind: 'seconds', t: 8 },
      });
    });

    expect(() => loadProject(project)).not.toThrow();
  });

  it('отрезки ВСТЫК законны — их порождает разрез главы', () => {
    // Соприкосновение краёв разрешено намеренно: два отрезка встык это один
    // отрезок, записанный двумя, и запрет сломал бы деление при разрезе.
    //
    // СЛОМ: заменить `from < previousEnd` на `from <= previousEnd` —
    // тест покраснеет, и вместе с ним развалится разрез главы поперёк отрезка.
    const project = tweaked((p) => {
      p.segments[0].authorSpans[1] = {
        elementId: 'head',
        from: { kind: 'seconds', t: 3 },
        to: { kind: 'seconds', t: 8 },
      };
    });

    expect(() => loadProject(project)).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Project, Segment } from '@player/core';

import { branchTree } from '../src/state/branchTree.js';

/**
 * Раскладка дерева веток объяснения на полосы (`design/branches.md` §5).
 * Чистая логика, без React и DOM — как её сосед `exits.test.ts`.
 *
 * Проверки идут на РЕАЛЬНЫХ фикстурах (`fixtures/projects/`), не на
 * собранных руками мини-проектах: правило 7 («стык продолжает полосу
 * развилки, если несколько её детей сошлись в одну точку») требует ветвления
 * такой формы, что собрать его вручную — значит переписать саму фикстуру,
 * а не проверить код.
 */

const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

function loadFixture(name: string) {
  return loadProject(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')));
}

function laneOf(lanes: ReturnType<typeof branchTree>, id: string) {
  const lane = lanes.find((candidate) => candidate.id === id);
  if (!lane) throw new Error(`В раскладке нет полосы «${id}»: ${lanes.map((l) => l.id).join(', ')}`);
  return lane;
}

describe('branchTree', () => {
  /**
   * split-track.json: развилка `s-head` без `default` шлёт в `s-left`
   * и `s-right`, у обеих `default: s-tail`.
   *
   * Что сломает: убрать правило 7 (стык, куда независимо сошлись обе дочерние
   * полосы, продолжает полосу развилки) — тогда `s-tail` осядет в одной
   * из дочерних полос (первой построенной) вместо корневой, и это проверка
   * ПРИНАДЛЕЖНОСТИ плитки конкретной полосе, а не просто числа полос.
   * Верно ли при любой реализации: нет — «столько же полос» тест был бы
   * пуст (три полосы получаются и при неверной раскладке `s-tail`), а вот
   * ЧТО именно лежит в каждой — специфично для правила 3, 6 и 7.
   */
  it('split-track: развилка без default отдаёт стык КОРНЕВОЙ полосе, а не дочерней', () => {
    const project = loadFixture('split-track.json');
    const lanes = branchTree(project);

    expect(lanes).toHaveLength(3);

    const root = laneOf(lanes, 's-head');
    expect(root.chapters.map((c) => c.id)).toEqual(['s-head', 's-tail']);
    expect(root.depth).toBe(0);
    expect(root.parentLaneId).toBeNull();
    expect(root.anchorIndex).toBe(-1);
    expect(root.tail).toEqual({ kind: 'end' });

    const left = laneOf(lanes, 's-left');
    expect(left.chapters.map((c) => c.id)).toEqual(['s-left']);
    expect(left.depth).toBe(1);
    expect(left.parentLaneId).toBe('s-head');
    expect(left.anchorIndex).toBe(0);
    expect(left.anchorSeconds).toBeCloseTo(2.5);
    expect(left.tail).toEqual({ kind: 'goto', toChapterId: 's-tail', toTitle: 'После развилки — общее продолжение', repeat: false });

    const right = laneOf(lanes, 's-right');
    expect(right.chapters.map((c) => c.id)).toEqual(['s-right']);
    expect(right.depth).toBe(1);
    expect(right.anchorIndex).toBe(0);
    expect(right.tail.kind).toBe('goto');
  });

  /**
   * conditions.json: `s-next` — развилка (одно правило на `s-deep`),
   * но её `default` не `null`, а `s-end`.
   *
   * Что сломает: убрать правило 3 (продолжение той же полосы по `default`
   * развилки) — тогда `s-end` не попадёт в корневую полосу вовсе (обрыв
   * цепочки на развилке) либо уедет в свою полосу, и проверка длины
   * и состава `root.chapters` покраснеет.
   * Верно при любой реализации: нет — без правила 3 корневая полоса
   * заканчивалась бы на `s-next`.
   */
  it('conditions: default развилки продолжает ЕЁ ЖЕ полосу, а не обрывает цепочку', () => {
    const project = loadFixture('conditions.json');
    const lanes = branchTree(project);

    expect(lanes).toHaveLength(2);

    const root = laneOf(lanes, 's-count');
    expect(root.chapters.map((c) => c.id)).toEqual(['s-count', 's-next', 's-end']);
    expect(root.tail).toEqual({ kind: 'end' });

    const deep = laneOf(lanes, 's-deep');
    expect(deep.chapters.map((c) => c.id)).toEqual(['s-deep']);
    expect(deep.depth).toBe(1);
    expect(deep.parentLaneId).toBe('s-count');
    // Развилка `s-next` — вторая плитка корневой полосы (индекс 1), а не первая.
    expect(deep.anchorIndex).toBe(1);
    expect(deep.anchorSeconds).toBeCloseTo(2.904 + 2.736);
    expect(deep.tail).toEqual({ kind: 'end' });
  });

  /**
   * exit-branch.json: развилка на самом первом сегменте, `default: null`,
   * обе цели — новые главы без своих правил выхода.
   *
   * Что сломает: сломать порядок обхода правил (например, `reverse()`
   * список правил перед разбором) — полосы `s-right`/`s-left` поменяются
   * местами в списке. Проверка порядка ЗНАЧИМА здесь, потому что порядок
   * задаёт task: «в порядке обхода».
   * Верно при любой реализации: нет — порядок правил в фикстуре (`r-yes`
   * на `s-right` первым) конкретен, симметричная реализация («что первое
   * встретилось по ключам объекта») дала бы другой порядок только случайно.
   */
  it('exit-branch: три полосы с хвостом end, порядок — по порядку правил', () => {
    const project = loadFixture('exit-branch.json');
    const lanes = branchTree(project);

    expect(lanes.map((lane) => lane.id)).toEqual(['s-ask', 's-right', 's-left']);
    for (const lane of lanes) {
      expect(lane.tail).toEqual({ kind: 'end' });
    }
    expect(laneOf(lanes, 's-right').anchorIndex).toBe(0);
    expect(laneOf(lanes, 's-left').anchorIndex).toBe(0);
  });

  /**
   * repeat.json: `s-b` шлёт правилом `r-repeat` обратно на `s-a` — главу,
   * уже стоящую в ЕГО ЖЕ полосе.
   *
   * Что сломает: подменить признак повтора (`leadsBack`) на константу
   * `false` — связь останется связью (цель уже занята), но `repeat` соврёт.
   * Отдельно: если убрать саму проверку «уже занято» (п. 5), `s-a` начал бы
   * вторую полосу вместо связи — тест на состав `links` и на отсутствие
   * лишней полосы поймает и это.
   * Верно при любой реализации: нет — без проверки занятости получилось бы
   * 3 полосы, а не 2, и без `leadsBack` `repeat` был бы `false`, а не `true`.
   */
  it('repeat: цель, уже стоящая в полосе, становится связью с repeat: true, а не новой полосой', () => {
    const project = loadFixture('repeat.json');
    const lanes = branchTree(project);

    expect(lanes).toHaveLength(2);

    const root = laneOf(lanes, 's-a');
    expect(root.chapters.map((c) => c.id)).toEqual(['s-a', 's-b']);
    expect(root.links).toEqual([
      { fromChapterId: 's-b', toChapterId: 's-a', toTitle: 'Кусок A: молчащая внутри остановка', repeat: true },
    ]);
    expect(root.tail).toEqual({ kind: 'end' });

    const end = laneOf(lanes, 's-end');
    expect(end.chapters.map((c) => c.id)).toEqual(['s-end']);
    expect(end.depth).toBe(1);
    expect(end.anchorIndex).toBe(1);
    expect(end.anchorSeconds).toBeCloseTo(2.904 + 2.736);
  });

  /**
   * Имя корневой полосы — «Основная» независимо от заголовка её первой
   * главы; имя дочерней — заголовок её первой главы.
   *
   * Что сломает: убрать ветвление `depth === 0 ? 'Основная' : …` и всегда
   * брать заголовок первой главы — тест на корневую полосу (заголовок её
   * первой главы «До развилки», а НЕ «Основная») покраснеет.
   * Верно при любой реализации: нет — если бы имя всегда было заголовком
   * первой главы, у корневой полосы `split-track.json` было бы имя
   * «До развилки», а не «Основная».
   */
  it('имя полосы: у корневой — «Основная», у дочерней — заголовок её первой главы', () => {
    const project = loadFixture('split-track.json');
    const lanes = branchTree(project);

    expect(laneOf(lanes, 's-head').name).toBe('Основная');
    expect(laneOf(lanes, 's-left').name).toBe('Налево');
  });

  /**
   * Проект собран руками (образец — `exits.test.ts` строки 30–45, `project()`
   * там же): `s-first.exit.default` ведёт в `s-second`, у `s-second` выхода
   * нет, `s-third` не достижима ни из одной главы вовсе.
   *
   * Что сломает: убрать второй проход (сирот) из `branchTree` — тест
   * покраснеет, потому что полос останется одна и `s-third` не найдётся
   * нигде. Пять существующих тестов при этом не тронуты и обязаны
   * оставаться зелёными: сирот в их фикстурах нет (проверено — 0 сирот
   * в 24 фикстурах проекта), значит второй проход для них — no-op.
   * Верно при любой реализации: нет — реализация, вернувшая только
   * достижимое (как до этой сессии), даёт одну полосу, а не две.
   */
  it('branchTree показывает СИРОТУ: главу, в которую не ведёт ни одно ребро выхода', () => {
    const segmentOf = (id: string, overrides: Partial<Segment> = {}): Segment => ({
      id,
      title: id,
      description: '',
      audio: { src: `audio/${id}.mp3`, offset: 0, duration: 1, words: [] },
      elements: [],
      authorSpans: [],
      slides: [{ id: `${id}-slide`, at: { kind: 'seconds', t: 0 }, transition: 'cut', transitionSeconds: 0.6, states: {} }],
      gates: [],
      exit: { rules: [], default: null },
      ...overrides,
    });

    const first = segmentOf('s-first', { exit: { rules: [], default: 's-second' } });
    const second = segmentOf('s-second');
    const third = segmentOf('s-third');

    const proj: Project = {
      schemaVersion: SCHEMA_VERSION,
      meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
      entry: 's-first',
      styles: [],
      segments: [first, second, third],
    };

    const lanes = branchTree(proj);

    expect(lanes).toHaveLength(2);

    const main = laneOf(lanes, 's-first');
    expect(main.orphan).toBe(false);
    expect(main.chapters.map((c) => c.id)).toEqual(['s-first', 's-second']);

    const orphan = laneOf(lanes, 's-third');
    expect(orphan.orphan).toBe(true);
    expect(orphan.chapters.map((c) => c.id)).toEqual(['s-third']);
    expect(orphan.depth).toBe(0);
    expect(orphan.parentLaneId).toBeNull();
    expect(orphan.anchorIndex).toBe(-1);
    expect(orphan.anchorSeconds).toBe(0);
  });
});

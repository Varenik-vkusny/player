import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject, ProjectSchema, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Condition, Project, Segment } from '@player/core';

import { branchTree } from '../src/state/branchTree.js';
import { extractBlockedReason, extractToBranch } from '../src/state/extractBranch.js';

/**
 * «Вынести диапазон глав в ветку» (требование владельца 16.08.2026).
 * Чистая логика, без React и DOM — как её соседи `branchTree.test.ts`
 * и `exits.test.ts`.
 *
 * Фикстуры грузятся через `loadProject` (образец — `branchTree.test.ts`
 * строки 20–25): `ProjectSchema.parse` напрямую фикстуры не примет,
 * они лежат в старых версиях схемы.
 */

const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

function loadFixture(name: string): Project {
  return loadProject(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')));
}

/** Минимальная глава для проектов, собранных руками (образец — `exits.test.ts` строки 30–45). */
function segmentOf(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
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
  };
}

function projectOf(segments: readonly Segment[], entry: string): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry,
    styles: [],
    segments: [...segments],
  };
}

describe('extractBlockedReason', () => {
  it('пустое выделение — отказ', () => {
    const project = loadFixture('conditions.json');
    expect(extractBlockedReason(project, [])).toMatch('Ничего не выделено');
  });

  /**
   * conditions.json: `s-next` — развилка (`exit.rules` непусто, ведёт
   * в `s-deep`). Причина 3.
   *
   * Слом 2: убрать проверку причины 3 — обязана покраснеть.
   * Верно при любой реализации: нет — реализация без этой проверки пропустит
   * `s-next` молча, и результат (после `extractToBranch`) увёл бы `s-deep`
   * в никуда, не будь проверки вовсе.
   */
  it('conditions: развилка внутри выделения («s-next») — отказ по причине 3', () => {
    const project = loadFixture('conditions.json');
    const reason = extractBlockedReason(project, ['s-next']);
    expect(reason).toBeDefined();
    expect(reason).toMatch('развилка');
    expect(reason).toMatch('Спрашивает, куда двигаться, и часть вариантов прячет');
  });

  /**
   * split-track.json: `s-tail` — это `c1` выделения `['s-tail']`, а причина 4
   * говорит про `c2…cn`. Ссылка на `c1` снаружи законна.
   *
   * Что должно сломаться: реализация, которая проверяет причину 4 по ВСЕМ
   * главам выделения (включая `c1`), а не только по `c2…cn`, — вернула бы
   * здесь строку про отказ, хотя выделение из одной главы отказом быть
   * не должно (`c2…cn` тут пусто по определению).
   * Верно при любой реализации: нет — при неверной трактовке причины 4
   * этот тест обязан был бы получить строку, а не `undefined`.
   */
  it('split-track: ссылка на c1 снаружи (s-tail — единственная глава выделения) — НЕ отказ', () => {
    const project = loadFixture('split-track.json');
    expect(extractBlockedReason(project, ['s-tail'])).toBeUndefined();
  });

  /**
   * Причина 4 в чистом виде: собранный руками проект `b1 → b2 → b3`, плюс
   * глава `x` ВНЕ выделения, чьё правило выхода ведёт в `b3` — это `cn`,
   * то есть `c2…cn`. Выделение — `['b2', 'b3']`.
   *
   * Что должно сломаться: снять проверку причины 4 целиком — `extractToBranch`
   * потом молча оборвал бы правило главы `x`, а `x` осталась бы ссылаться
   * на «главу», которой больше нет в достижимой части графа никаким
   * заметным для неё способом. Проверка ловит это ДО того, как случится.
   * Верно при любой реализации: нет — реализация без проверки не отличает
   * этот случай от `split-track`: `s-tail`, где такой же формы ссылка
   * на `c1` законна.
   */
  it('ссылка на середину выделения (c2…cn) снаружи — отказ по причине 4', () => {
    const b1 = segmentOf('b1', { exit: { rules: [], default: 'b2' } });
    const b2 = segmentOf('b2', { exit: { rules: [], default: 'b3' } });
    const b3 = segmentOf('b3');
    const condition: Condition = { kind: 'equals', variable: 'какая-то', value: 'штука' };
    const x = segmentOf('x', { exit: { rules: [{ id: 'r', when: [condition], goto: 'b3' }], default: null } });

    const project = projectOf([b1, b2, b3, x], 'b1');
    const reason = extractBlockedReason(project, ['b2', 'b3']);
    expect(reason).toBeDefined();
    expect(reason).toMatch('x');
    expect(reason).toMatch('b3');
  });

  /**
   * Причина 5: выносится ВСЁ объяснение — `c1` это вход, а `after` (default
   * последней главы диапазона) — `null`. Собранный руками проект: одна
   * глава без выхода, она же вход.
   */
  it('выносится всё объяснение целиком — отказ по причине 5', () => {
    const only = segmentOf('only');
    const project = projectOf([only], 'only');
    expect(extractBlockedReason(project, ['only'])).toMatch('всё объяснение');
  });

  it('главы выделения повторяются — не цепочка (причина 2)', () => {
    const project = loadFixture('conditions.json');
    expect(extractBlockedReason(project, ['s-count', 's-count'])).toMatch('не идут подряд');
  });
});

describe('extractToBranch', () => {
  /**
   * conditions.json: `s-count` — вход, `s-count.exit.default = 's-next'`.
   * `after = 's-next'`, значит новый вход — `s-next`.
   *
   * Слом 3: не переносить `project.entry`, когда выносится вход — обязана
   * покраснеть проверка `project.entry`.
   * Верно при любой реализации: нет — без переноса `project.entry` остался
   * бы `s-count`, указывающим на главу, которая только что стала сиротой:
   * объяснение открывалось бы в сироте.
   */
  it('conditions: вынос входа («s-count») переносит project.entry и делает главу сиротой', () => {
    const project = loadFixture('conditions.json');
    const result = extractToBranch(project, ['s-count']);

    expect(result.entry).toBe('s-next');
    const count = result.segments.find((s) => s.id === 's-count')!;
    // cn.exit.default не трогается операцией вовсе — здесь c1 === cn.
    expect(count.exit.default).toBe('s-next');

    // Результат обязан ЗАГРУЖАТЬСЯ: тотальность выхода и ссылки — по схеме.
    expect(() => ProjectSchema.parse(result)).not.toThrow();

    const lanes = branchTree(result);
    const orphanLane = lanes.find((lane) => lane.chapters.some((c) => c.id === 's-count'));
    expect(orphanLane).toBeDefined();
    expect(orphanLane!.orphan).toBe(true);
  });

  /**
   * split-track.json: в `s-left` ведёт ПРАВИЛО `s-head`, а не `default` —
   * значит `prev` (по определению задачи — глава, чей `default` равен `c1`)
   * не существует. Смыкать нечего: `s-head.exit` обязан остаться БУКВАЛЬНО
   * тем же, и `s-left` не должна стать сиротой.
   *
   * Что должно сломаться: реализация, которая наивно ищет РОВНО ОДНУ такую
   * главу и бросает при её отсутствии (вместо «смыкать нечего, это законно»),
   * упала бы здесь, хотя падать не должна — задание прямо требует трактовать
   * пустой набор предшественников как «безвредно».
   */
  it('split-track: вынос "s-left" (в неё ведёт правило, не default) — смыкания нет, сиротой не становится', () => {
    const project = loadFixture('split-track.json');
    const result = extractToBranch(project, ['s-left']);

    const head = result.segments.find((s) => s.id === 's-head')!;
    expect(head.exit).toEqual({
      rules: [
        { id: 'rule-1', when: [{ kind: 'equals', variable: 'куда', value: 'left' }], goto: 's-left' },
        { id: 'rule-2', when: [{ kind: 'equals', variable: 'куда', value: 'right' }], goto: 's-right' },
      ],
      default: null,
    });

    const lanes = branchTree(result);
    const leftLane = lanes.find((lane) => lane.chapters.some((c) => c.id === 's-left'));
    expect(leftLane).toBeDefined();
    expect(leftLane!.orphan).toBe(false);
  });

  /**
   * split-track.json: `s-tail` — единственная глава выделения, `c1 = cn`.
   * В нее ведут ДВА `default` (`s-left` и `s-right`) — задание описывает
   * `prev` в единственном числе, реальный граф даёт двух. Обобщение:
   * смыкание применяется к КАЖДОМУ найденному `prev` (см. комментарий
   * в `extractBranch.ts`).
   *
   * Слом 1 (генерализованный — «не смыкать основную линию: prev.exit.default
   * оставить прежним»): именно этот тест ловит его, а НЕ тест на `conditions`
   * (см. отчёт сессии — там нет ни одной главы, у которой есть настоящий
   * `prev`, не ломающая тотальность выхода где-то ещё).
   * Что должно сломаться: пропустить цикл по `prevIds` (оставить
   * `s-left`/`s-right` как есть) — обе проверки ниже покраснеют: `s-tail`
   * останется ДОСТИЖИМОЙ (не сиротой), а `s-left.exit.default` не станет `null`.
   * Верно при любой реализации: нет — без редиректа `s-left`/`s-right`
   * продолжали бы вести в `s-tail`, и она никогда не стала бы сиротой.
   */
  it('split-track: вынос "s-tail" смыкает ОБА default (s-left и s-right), делает её сиротой', () => {
    const project = loadFixture('split-track.json');
    const result = extractToBranch(project, ['s-tail']);

    const left = result.segments.find((s) => s.id === 's-left')!;
    const right = result.segments.find((s) => s.id === 's-right')!;
    expect(left.exit.default).toBeNull();
    expect(right.exit.default).toBeNull();

    expect(() => ProjectSchema.parse(result)).not.toThrow();

    const lanes = branchTree(result);
    const orphanLane = lanes.find((lane) => lane.chapters.some((c) => c.id === 's-tail'));
    expect(orphanLane).toBeDefined();
    expect(orphanLane!.orphan).toBe(true);
  });

  /**
   * ДЫРА ЗАДАНИЯ, найдена прогоном, не рассуждением (см. отчёт сессии,
   * пункт 4). `conditions.json`: вынос `['s-end']` не запрещён НИ ОДНОЙ
   * из пяти причин (`s-end` — не вход, `prev` единственный — `s-next`,
   * ссылка на `c1` снаружи законна, развилки в выделении нет). Но
   * `prev` (`s-next`) сам — развилка с ДВУУСЛОВНЫМ правилом `r-deep`
   * (`compare` И `notEquals`), и её тотальность выхода держится ИМЕННО
   * на `default: 's-end'` — схема не умеет доказать покрытие по правилу
   * с двумя условиями (`schema.ts`: «Покрытие доказуемо только у правил
   * с ОДНИМ условием»). Смыкание обнуляет этот `default`, и результат
   * не проходит `ProjectSchema.parse` — вопреки требованию задания
   * «результат обязан загружаться».
   *
   * Ни одна из пяти перечисленных причин отказа этого не ловила. ДЫРА
   * ЗАКРЫТА шестой причиной, и закрыта не шестым перечнем условий, а
   * ВОПРОСОМ К СХЕМЕ: `extractBlockedReason` собирает результат и спрашивает
   * `ProjectSchema.safeParse`. Второй перечень условий тотальности разъехался
   * бы со схемой молча — а так источник правды остаётся один.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: убрать шестую причину из
   * `extractBlockedReason` — вернётся `undefined`, и первое же утверждение
   * упадёт. Либо перестать звать `applyExtract` из проверки (спросить схему
   * о неизменённом проекте) — тот же результат.
   *
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Отказ здесь — не общее свойство
   * операции: соседние тесты этого же файла показывают вынос, который
   * РАЗРЕШЁН. Разница именно в том, что тут `prev` — развилка, чья
   * тотальность держится на запасном выходе.
   */
  it('conditions: вынос "s-end" ОТКЛОНЁН — он оставил бы развилку без запасного выхода', () => {
    const project = loadFixture('conditions.json');

    const reason = extractBlockedReason(project, ['s-end']);
    expect(reason).toBeDefined();
    // Причина названа автору именем ГЛАВЫ, а не идентификатором: «s-next»
    // ему ничего не говорит, а заголовок он сам и написал.
    expect(reason).toContain('Спрашивает, куда двигаться');
    expect(reason).toContain('развилка');

    // И операция не строит незагружаемый проект молча — она отказывает
    // той же строкой, что показала бы автору.
    expect(() => extractToBranch(project, ['s-end'])).toThrow(/развилка/);

    // Контроль прибора: проект ДО операции загружается. Без этого «не
    // загружается» ничего не доказывало бы — оно могло бы быть верным
    // и до всякого выноса.
    expect(() => ProjectSchema.parse(project)).not.toThrow();
  });
});

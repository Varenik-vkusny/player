import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from '@player/core';

import { durationRange } from '../src/state/durationRange.js';

/**
 * Вилка длительностей объяснения (`docs/design/branches.md` §8): min/max
 * длины пути зрителя от входа. Чистая логика, без React и DOM — как её
 * соседи `exits.test.ts` и `branchTree.test.ts`.
 *
 * Фикстуры грузятся через `loadProject`, а не `ProjectSchema.parse`: часть
 * лежит в старой версии схемы и доходит до текущей только через миграцию
 * (`branchTree.test.ts` — тот же приём).
 *
 * ЛОВУШКА, которой тут нарочно нет: проверка «min ≤ max» пуста — она верна
 * при ЛЮБОЙ реализации, включая ту, что дважды возвращает одно и то же
 * число. Каждая проверка ниже сравнивает с КОНКРЕТНЫМ литералом, посчитанным
 * вручную по фикстуре, и с точностью 1e-9 — числа с плавающей точкой
 * складываются в разном порядке при обходе разных путей.
 */

const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

function loadFixture(name: string) {
  return loadProject(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')));
}

const EPS = 1e-9;

describe('durationRange', () => {
  /**
   * split-track.json: развилка в s-head без default, оба рукава (s-left,
   * s-right) по 0.6 с и оба default'ом ведут в один и тот же s-tail.
   * Оба пути РАВНОЙ длины: 2.5 + 0.6 + 1.5 = 4.6 для обоих рукавов.
   *
   * ЭТО ВАЖНЫЙ СЛУЧАЙ: развилка в проекте ЕСТЬ, а вилки — нет, концы
   * совпадают. Что сломает: `single` захардкоженный в `false` — см. слом №3
   * ниже, воспроизведён и задокументирован отдельно.
   * Верно ли при любой реализации: нет — сравниваются числа с конкретными
   * фикстурными длительностями (2.5, 0.6, 0.6, 1.5), совпадение по случайности
   * этой конкретной фикстуры маловероятно при неверном алгоритме сложения.
   */
  it('split-track: развилка есть, а вилки нет — min = max = 4.6', () => {
    const project = loadFixture('split-track.json');
    const result = durationRange(project);
    expect(result.minSeconds).toBeCloseTo(4.6, 9);
    expect(result.maxSeconds).toBeCloseTo(4.6, 9);
    expect(Math.abs(result.maxSeconds - result.minSeconds)).toBeLessThan(EPS);
    expect(result.single).toBe(true);
    expect(result.repeatsIgnored).toBe(false);
  });

  /**
   * exit-branch.json: s-ask (2.904) ведёт либо в s-right (2.736), либо
   * в s-left (2.4). min = 2.904 + 2.4 = 5.304, max = 2.904 + 2.736 = 5.64.
   * Что сломает: перепутать min/max местами, или взять только один рукав
   * (например, только первое правило) вместо обоих.
   */
  it('exit-branch: два неравных пути — min 5.304, max 5.64', () => {
    const project = loadFixture('exit-branch.json');
    const result = durationRange(project);
    expect(result.minSeconds).toBeCloseTo(5.304, 9);
    expect(result.maxSeconds).toBeCloseTo(5.64, 9);
    expect(result.single).toBe(false);
    expect(result.repeatsIgnored).toBe(false);
  });

  /**
   * conditions.json: s-count (2.904) → s-next (2.736) по default, дальше
   * либо по правилу в s-deep (2.4), либо по default в s-end (2.904).
   * min = 2.904 + 2.736 + 2.4 = 8.04 (короткий путь идёт по ПРАВИЛУ),
   * max = 2.904 + 2.736 + 2.904 = 8.544 (длинный путь идёт по DEFAULT).
   *
   * Что сломает: слом №1 ниже (выкинуть `exit.default` из набора рёбер) —
   * пропадёт путь до s-end, а с ним и правильный max. Воспроизведено
   * и задокументировано отдельно.
   */
  it('conditions: рёбра из ОБОИХ источников — правил и default — min 8.04, max 8.544', () => {
    const project = loadFixture('conditions.json');
    const result = durationRange(project);
    expect(result.minSeconds).toBeCloseTo(8.04, 9);
    expect(result.maxSeconds).toBeCloseTo(8.544, 9);
    expect(result.single).toBe(false);
    expect(result.repeatsIgnored).toBe(false);
  });

  /**
   * repeat.json: s-a (2.904) → s-b (2.736) по default, дальше у s-b правило
   * «неверно» ведёт НАЗАД в s-a (повтор — отбрасывается) и правило «верно»
   * ведёт в s-end (2.904). Единственный путь БЕЗ повтора: 2.904 + 2.736 +
   * 2.904 = 8.544. min = max = 8.544, но `repeatsIgnored: true` — путь через
   * повтор существует в графе и был сознательно отброшен, а не отсутствует.
   *
   * Что сломает: слом №2 ниже (убрать множество посещённых на пути) —
   * обход зависает на ребре s-b → s-a → s-b → s-a … Воспроизведено
   * и задокументировано отдельно, с таймаутом.
   */
  it('repeat: путь назад отбрасывается, min = max = 8.544, repeatsIgnored: true', () => {
    const project = loadFixture('repeat.json');
    const result = durationRange(project);
    expect(result.minSeconds).toBeCloseTo(8.544, 9);
    expect(result.maxSeconds).toBeCloseTo(8.544, 9);
    expect(result.single).toBe(true);
    expect(result.repeatsIgnored).toBe(true);
  });

  /**
   * demo.json: одна глава, ни одной развилки и ни одного правила выхода —
   * простейший случай, где вилки нет по определению (не потому, что концы
   * случайно совпали), и повторов тоже нет.
   */
  it('demo: одна глава без развилок — single, без повторов', () => {
    const project = loadFixture('demo.json');
    const result = durationRange(project);
    expect(result.single).toBe(true);
    expect(result.repeatsIgnored).toBe(false);
    expect(Math.abs(result.maxSeconds - result.minSeconds)).toBeLessThan(EPS);
  });
});

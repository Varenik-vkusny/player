import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from '@player/core';

import { branchTree, type BranchLane } from '../src/state/branchTree.js';
import { ARC_HEADROOM, layoutLanes, NAME_WIDTH, ROW_HEIGHT, ROW_GAP } from '../src/track/branchLayout.js';

/**
 * Раскладка дерева веток в координаты пространства (`design/branches.md` §5).
 * Чистая арифметика — как её соседи `branchTree.test.ts` и `chapters.test.ts`.
 *
 * Контрольные числа посчитаны РУКАМИ (длительность × 40 px/с), а не взяты
 * из полей самой раскладки — иначе тест сравнивал бы формулу сама с собой
 * и был бы пуст по построению (см. предупреждение в задании).
 */

const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

function loadFixture(name: string) {
  return loadProject(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')));
}

function rowOf(rows: ReturnType<typeof layoutLanes>['rows'], laneId: string) {
  const row = rows.find((candidate) => candidate.laneId === laneId);
  if (!row) throw new Error(`В раскладке нет строки «${laneId}»: ${rows.map((r) => r.laneId).join(', ')}`);
  return row;
}

const NO_COLLAPSED: ReadonlySet<string> = new Set();

describe('layoutLanes', () => {
  /**
   * split-track: s-head (2.5с) и s-tail (1.5с) в корневой полосе.
   * 2.5×40=100, 1.5×40=60 — оба выше MIN_TILE_PX (24), клиппинга нет.
   *
   * Что сломает: любая ошибка в переводе секунд в пиксели (п. 1) или
   * в стыковке плиток (п. 2) — сдвинутся сами числа x/width.
   * Верно ли при любой реализации: нет — сравнение идёт с литералами,
   * посчитанными отдельно от кода раскладки.
   */
  it('корневая полоса split-track: иксы и ширины плиток против литералов', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);
    const root = rowOf(layout.rows, 's-head');

    expect(root.tiles[0]).toMatchObject({ id: 's-head', x: 0, width: 100 });
    expect(root.tiles[1]).toMatchObject({ id: 's-tail', x: 100, width: 60 });
    expect(root.tail).toEqual({ kind: 'end', label: 'конец', x: 160, repeat: false });
  });

  /**
   * Икс начала ОБЕИХ дочерних полос обязан быть 100 — правый край плитки
   * `s-head` (0 + 100), не левый (0) и не сумма секунд самой ветки.
   *
   * Что сломает: п. 3 переписан на левый край анкер-плитки (сабораж 2
   * из задания) или на анкер-секунды вместо анкер-индекса.
   * Верно ли при любой реализации: нет — при левом крае получилось бы 0,
   * число из независимо посчитанного литерала это ловит.
   */
  it('дочерние полосы split-track начинаются под правым краем плитки-развилки, литерал 100', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(rowOf(layout.rows, 's-left').startX).toBe(100);
    expect(rowOf(layout.rows, 's-right').startX).toBe(100);
    expect(rowOf(layout.rows, 's-left').tiles[0]).toMatchObject({ x: 100, width: 24 });
  });

  /**
   * Пустая глава (0 секунд) получает MIN_TILE_PX, а следующая плитка
   * не наезжает на неё — начинается там, где кончилась пустая, ПО ШИРИНЕ.
   * Собрано руками из `BranchLane`, потому что в фикстурах пустой главы,
   * за которой сразу идёт следующая в той же полосе, нет.
   *
   * Что сломает: накопление икса по секундам вместо ширины (сабораж 1
   * из задания) — тогда обе плитки лягут на 0, наехав друг на друга.
   * Верно ли при любой реализации: нет — при накоплении по секундам
   * вторая плитка получила бы x=0, а не 24.
   */
  it('пустая глава получает MIN_TILE_PX, следующая плитка не наезжает', () => {
    const lane: BranchLane = {
      id: 'r',
      name: 'Основная',
      depth: 0,
      chapters: [
        { id: 'c-empty', title: 'Пустая', seconds: 0, forksAfter: false },
        { id: 'c-normal', title: 'Обычная', seconds: 1, forksAfter: false },
      ],
      parentLaneId: null,
      anchorIndex: -1,
      anchorSeconds: 0,
      seconds: 1,
      tail: { kind: 'end' },
      links: [],
      // Полоса достижимая: сироты — отдельный случай, и раскладке он
      // безразличен (она не знает, кто до полосы доходит, и знать не должна).
      orphan: false,
    };
    const layout = layoutLanes([lane], NO_COLLAPSED);
    const row = rowOf(layout.rows, 'r');

    expect(row.tiles[0]).toMatchObject({ x: 0, width: 24 });
    expect(row.tiles[1]).toMatchObject({ x: 24, width: 40 });
  });

  /**
   * `y` строк идёт по номеру ВИДИМОЙ строки, СМЕЩЁННОМУ на запас сверху:
   * 24, 92 (24+68), 160 (24+2×68). Шаг между строками — 68 (56+12).
   *
   * ЗАПАС `ARC_HEADROOM` появился 17.08.2026 и появился не из вкуса:
   * без него дуге повтора из ПЕРВОЙ строки некуда было выгибаться вверх,
   * и она пряталась за плитками. Видно это было только глазами в живом
   * редакторе — разметка дуги в DOM присутствовала.
   *
   * Что сломает: подсчёт `y` по общему индексу в `lanes` вместо номера
   * среди видимых — при свёрнутых полосах числа разъедутся; здесь же,
   * без сворачивания, отличило бы неверный шаг (не 68) от верного.
   * Верно ли при любой реализации: нет — шаг ROW_HEIGHT+ROW_GAP это
   * конкретное число 68, а не любое приращение.
   */
  it('y строк против литералов 24 / 92 / 160, шаг 68', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(rowOf(layout.rows, 's-head').y).toBe(24);
    expect(rowOf(layout.rows, 's-left').y).toBe(92);
    expect(rowOf(layout.rows, 's-right').y).toBe(160);
    expect(ROW_HEIGHT + ROW_GAP).toBe(68);
    // Запас сверху ОБЯЗАН быть положительным: на нуле дуга повтора первой
    // строки снова уедет под плитки, и это не будет видно ни одному числу
    // выше — только глазами.
    expect(ARC_HEADROOM).toBeGreaterThan(0);
  });

  /**
   * Связка родитель→ребёнок: `x` = 100 (как startX ребёнка), `fromY` = низ
   * строки родителя (24+56=80), `toY` = середина строки ребёнка
   * (92+28=120).
   *
   * Что сломает: перепутанные fromY/toY или взятие координаты не той строки.
   * Верно ли при любой реализации: нет — числа считаются от независимых
   * литералов ROW_HEIGHT=56, ARC_HEADROOM=24 и шага 68.
   */
  it('связки родитель-ребёнок: x/fromY/toY против литералов', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(layout.connectors).toHaveLength(2);
    const toLeft = layout.connectors.find((c) => c.toLaneId === 's-left');
    expect(toLeft).toEqual({ fromLaneId: 's-head', toLaneId: 's-left', x: 100, fromY: 80, toY: 120 });
  });

  /**
   * Сворачивание: `collapsed = {s-head}` прячет ВСЕХ потомков (s-left,
   * s-right) — в rows остаётся одна строка, у неё `collapsed: true`
   * и `hasChildren: true` (факт наличия детей не зависит от того, что
   * их не видно), связок ноль.
   *
   * Что сломает: сабораж 3 из задания — перестать фильтровать потомков
   * по `hiddenByLaneId` (п. 6 отключён) — тогда rows.length станет 3.
   * Верно ли при любой реализации: нет — при отсутствии фильтрации
   * получилось бы 3 строки и 2 связки вместо 1 и 0.
   */
  it('сворачивание убирает потомков из rows и их связки', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, new Set(['s-head']));

    expect(layout.rows).toHaveLength(1);
    const root = layout.rows[0]!;
    expect(root.laneId).toBe('s-head');
    expect(root.collapsed).toBe(true);
    expect(root.hasChildren).toBe(true);
    expect(layout.connectors).toHaveLength(0);
  });

  /**
   * repeat.json: `s-b → s-a` дуга-повтор. `s-a` 2.904с, `s-b` 2.736с,
   * обе в одной (корневой) полосе. fromX — правый край s-b = (2.904+2.736)×40
   * = 225.6, toX — левый край s-a = 0, обе точки на y=52 (единственная
   * строка: ARC_HEADROOM 24 + ROW_HEIGHT/2 28).
   *
   * Что сломает: перепутанные from/to края плиток (например, взять левый
   * край s-b вместо правого) — число разошлось бы с 225.6.
   * Верно ли при любой реализации: нет — 225.6 получается только из
   * конкретной суммы двух длительностей, а не из произвольной точки.
   */
  it('дуга повтора repeat.json: fromX/toX против литералов 225.6 и 0', () => {
    const lanes = branchTree(loadFixture('repeat.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(layout.arcs).toHaveLength(1);
    const arc = layout.arcs[0]!;
    expect(arc.fromChapterId).toBe('s-b');
    expect(arc.toChapterId).toBe('s-a');
    expect(arc.repeat).toBe(true);
    expect(arc.fromX).toBeCloseTo(225.6);
    expect(arc.toX).toBe(0);
    expect(arc.fromY).toBe(52);
    expect(arc.toY).toBe(52);
  });

  /**
   * `bounds` охватывает самый правый ХВОСТ, а не только плитки: у split-track
   * корневой хвост стоит дальше (x=160+120=280), чем хвосты веток
   * (124+120=244), и именно он должен определить правый край коробки.
   *
   * Что сломает: расчёт `bounds` по правому краю последней ПЛИТКИ вместо
   * хвоста — потерялся бы запас TAIL_WIDTH, число не сошлось бы с 280
   * (и тем более с 460 для ширины).
   * Верно ли при любой реализации: нет — числа зависят от конкретной
   * ширины подписи хвоста (константа TAIL_WIDTH), а не любого положительного запаса.
   */
  it('bounds охватывает самый правый хвост, литералы -180/0/460/216', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    // Высота выросла на ARC_HEADROOM: коробка по-прежнему начинается на нуле,
    // но последняя строка сдвинута вниз вместе со всеми.
    expect(layout.bounds).toEqual({ x: -NAME_WIDTH, y: 0, width: 460, height: 216 });
  });

  /**
   * Пустой список полос — коробка нулевого размера в начале координат,
   * а не `NaN` от `Math.min`/`Math.max` на пустом массиве.
   *
   * Что сломает: отсутствие ранней проверки на пустой список — `Math.min()`
   * без аргументов даёт `Infinity`, а не 0.
   * Верно ли при любой реализации: нет — без явной обработки пустоты
   * получился бы `Infinity`/`NaN`, а не форма из задания.
   */
  it('пустой список полос даёт коробку нулевого размера, а не NaN', () => {
    const layout = layoutLanes([], NO_COLLAPSED);
    expect(layout.rows).toEqual([]);
    expect(layout.connectors).toEqual([]);
    expect(layout.arcs).toEqual([]);
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

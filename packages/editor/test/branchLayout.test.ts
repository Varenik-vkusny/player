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
 * Контрольные числа посчитаны РУКАМИ, а не взяты из полей самой раскладки:
 * иначе тест сравнивал бы формулу сама с собой и был бы пуст по построению.
 *
 * ФОРМУЛА ШИРИНЫ (изменена владельцем 24.08.2026, разбор у констант
 * в `branchLayout.ts`):
 *
 *   width = MIN + (MAX − MIN) × √(seconds / longest),  MIN 34, MAX 260
 *
 * где `longest` — длительность самой длинной главы ВСЕЙ доски. Плитки идут
 * с зазором TILE_GAP = 8.
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
   * split-track: s-head (2.5 с) и s-tail (1.5 с) в корневой полосе.
   * Самая длинная глава доски — s-head, 2.5 с, она и берёт MAX = 260.
   *
   *   s-head: √(2.5/2.5) = 1     → 34 + 226×1     = 260
   *   s-tail: √(1.5/2.5) = 0.7746 → 34 + 226×0.7746 = 209.0588…
   *
   * Икс второй плитки — правый край первой плюс зазор: 260 + 8 = 268.
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

    expect(root.tiles[0]).toMatchObject({ id: 's-head', x: 0, width: 260 });
    expect(root.tiles[1]!.id).toBe('s-tail');
    expect(root.tiles[1]!.x).toBe(268);
    expect(root.tiles[1]!.width).toBeCloseTo(209.0588, 3);
    // Хвост — за правым краем последней плитки плюс зазор:
    // 268 + 209.0588… + 8 = 485.0588…
    expect(root.tail.kind).toBe('end');
    expect(root.tail.label).toBe('конец');
    expect(root.tail.x).toBeCloseTo(485.0588, 3);
  });

  /**
   * Икс начала ОБЕИХ дочерних полос обязан быть 260 — правый край плитки
   * `s-head` (0 + 260), не левый (0) и не сумма секунд самой ветки.
   *
   *   s-left и s-right: 0.6 с, √(0.6/2.5) = 0.4899 → 34 + 226×0.4899
   *   = 144.7169…
   *
   * Что сломает: п. 3 переписан на левый край анкер-плитки (сабораж 2
   * из задания) или на анкер-секунды вместо анкер-индекса.
   * Верно ли при любой реализации: нет — при левом крае получилось бы 0,
   * число из независимо посчитанного литерала это ловит.
   */
  it('дочерние полосы split-track начинаются под правым краем плитки-развилки, литерал 260', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(rowOf(layout.rows, 's-left').startX).toBe(260);
    expect(rowOf(layout.rows, 's-right').startX).toBe(260);
    expect(rowOf(layout.rows, 's-left').tiles[0]!.x).toBe(260);
    expect(rowOf(layout.rows, 's-left').tiles[0]!.width).toBeCloseTo(144.7169, 3);
  });

  /**
   * Пустая глава (0 секунд) получает МИНИМУМ, а следующая плитка
   * не наезжает на неё — начинается там, где кончилась пустая, ПО ШИРИНЕ,
   * плюс зазор. Собрано руками из `BranchLane`, потому что в фикстурах
   * пустой главы, за которой сразу идёт следующая в той же полосе, нет.
   *
   * Самая длинная глава здесь — «Обычная», 1 с, она берёт MAX = 260.
   * Пустая: √(0/1) = 0 → 34 + 226×0 = 34, ровно MIN.
   * Икс второй: 34 + 8 = 42.
   *
   * Что сломает: накопление икса по секундам вместо ширины — тогда обе
   * плитки лягут на 0, наехав друг на друга; или потерянный зазор — тогда
   * вторая встанет на 34.
   * Верно ли при любой реализации: нет — при накоплении по секундам
   * вторая плитка получила бы x = 0, а не 42.
   */
  it('пустая глава получает минимальную ширину, следующая плитка не наезжает', () => {
    const lane: BranchLane = {
      id: 'r',
      name: 'Основная',
      depth: 0,
      chapters: [
        { id: 'c-empty', title: 'Пустая', seconds: 0, forksAfter: false, description: '', badge: undefined, blank: false, order: 1 },
        { id: 'c-normal', title: 'Обычная', seconds: 1, forksAfter: false, description: '', badge: undefined, blank: false, order: 2 },
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
      entryCondition: null,
    };
    const layout = layoutLanes([lane], NO_COLLAPSED);
    const row = rowOf(layout.rows, 'r');

    expect(row.tiles[0]).toMatchObject({ x: 0, width: 34 });
    expect(row.tiles[1]).toMatchObject({ x: 42, width: 260 });
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
   * Связка родитель→ребёнок: `x` = 260 (как startX ребёнка), `fromY` = низ
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
    expect(toLeft).toEqual({ fromLaneId: 's-head', toLaneId: 's-left', x: 260, fromY: 80, toY: 120 });
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
   * repeat.json: `s-b → s-a` дуга-повтор. `s-a` 2.904 с, `s-b` 2.736 с,
   * обе в одной (корневой) полосе. Самая длинная глава доски — 2.904
   * (`s-a` и `s-end` равны), она берёт MAX = 260.
   *
   *   s-a: √(2.904/2.904) = 1        → 260
   *   s-b: √(2.736/2.904) = 0.97073… → 34 + 226×0.97073… = 253.3654…
   *
   * fromX — правый край s-b: 260 + 8 (зазор) + 253.3654… = 521.3654…
   * toX — левый край s-a = 0. Обе точки на y = 52 (единственная строка:
   * ARC_HEADROOM 24 + ROW_HEIGHT/2 28).
   *
   * Что сломает: перепутанные from/to края плиток (например, взять левый
   * край s-b вместо правого) — число разошлось бы с 521.3654.
   * Верно ли при любой реализации: нет — это число получается только
   * из конкретных двух длительностей и зазора, а не из произвольной точки.
   */
  it('дуга повтора repeat.json: fromX/toX против литералов 521.3654 и 0', () => {
    const lanes = branchTree(loadFixture('repeat.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    expect(layout.arcs).toHaveLength(1);
    const arc = layout.arcs[0]!;
    expect(arc.fromChapterId).toBe('s-b');
    expect(arc.toChapterId).toBe('s-a');
    expect(arc.repeat).toBe(true);
    expect(arc.fromX).toBeCloseTo(521.3654, 3);
    expect(arc.toX).toBe(0);
    expect(arc.fromY).toBe(52);
    expect(arc.toY).toBe(52);
  });

  /**
   * `bounds` охватывает самый правый ХВОСТ, а не только плитки.
   *
   * Ширины (longest = 2.5 с у s-head):
   *   s-head 260, s-tail 209.0588…, s-left и s-right по 144.7169…
   *
   * Корневой хвост: 260 + 8 + 209.0588… + 8 = 485.0588…, правый край
   * с подписью 485.0588… + 120 = 605.0588…
   * Хвост ветки:    260 + 144.7169… + 8 = 412.7169…, правый край 532.7169…
   *
   * Правый край коробки задаёт КОРНЕВОЙ хвост, он дальше. Ширина коробки —
   * от левого края ярлыка имени: 605.0588… + 180 = 785.0588…
   *
   * Что сломает: расчёт `bounds` по правому краю последней ПЛИТКИ вместо
   * хвоста — потерялся бы запас TAIL_WIDTH; или взятие хвоста ветки вместо
   * корневого — разница 72.34 px.
   * Верно ли при любой реализации: нет — число зависит от конкретной
   * ширины подписи хвоста (TAIL_WIDTH) и от зазора, а не от любого
   * положительного запаса.
   */
  it('bounds охватывает самый правый хвост', () => {
    const lanes = branchTree(loadFixture('split-track.json'));
    const layout = layoutLanes(lanes, NO_COLLAPSED);

    // Высота выросла на ARC_HEADROOM: коробка по-прежнему начинается на нуле,
    // но последняя строка сдвинута вниз вместе со всеми.
    expect(layout.bounds.x).toBe(-NAME_WIDTH);
    expect(layout.bounds.y).toBe(0);
    expect(layout.bounds.width).toBeCloseTo(785.0588, 3);
    expect(layout.bounds.height).toBe(216);
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

/**
 * Раскладка дерева веток в координаты пространства (`design/branches.md` §5).
 *
 * Дерево полос уже посчитано (`branchTree.ts`): кто чей родитель, под какой
 * плиткой висит, сколько секунд. Этот модуль превращает его в числа —
 * иксы, игреки, ширины, — по которым вид рисует прямоугольники и линии.
 * Чистая арифметика: ни DOM, ни React, ни SVG здесь нет и не будет —
 * вид, который это нарисует, пишет другой исполнитель.
 *
 * Смысл раскладки (§5): вправо — время внутри своей ветки, вниз — вложенность.
 * Ширина плитки равна длительности главы, поэтому пропорции читаются без
 * цифр. Полоса ветки начинается ровно на том иксе, где стоит метка,
 * из которой ветка выходит, — то есть под правым краем плитки-развилки
 * в родителе, а не где-то ещё. Ветка не обязана никуда помещаться по длине:
 * сумма ширин плиток может уйти далеко за пределы экрана, и это законно.
 */
import type { Box } from './branchSpace.js';
import type { BranchLane } from '../state/branchTree.js';
import { MIN_TILE_PX } from './chapters.js';

export const PX_PER_SECOND = 40;
export const ROW_HEIGHT = 56;
export const ROW_GAP = 12;
/** Ширина ярлыка с именем ветки и её длительностью, слева от первой плитки. */
export const NAME_WIDTH = 180;
/** Приблизительная ширина подписи хвоста — для вписывания вида, не для отрисовки. */
export const TAIL_WIDTH = 120;

export interface TileBox {
  readonly id: string;
  readonly title: string;
  readonly seconds: number;
  readonly x: number;
  readonly width: number;
  readonly forksAfter: boolean;
}

export interface LaneRow {
  readonly laneId: string;
  readonly name: string;
  readonly depth: number;
  readonly seconds: number;
  readonly y: number;
  /** Икс левого края первой плитки. Имя стоит левее, в NAME_WIDTH от него. */
  readonly startX: number;
  readonly tiles: readonly TileBox[];
  /** Есть ли у полосы свёрнутые дети (их строк в раскладке нет). */
  readonly collapsed: boolean;
  readonly hasChildren: boolean;
  readonly tail: { readonly kind: 'end' | 'goto'; readonly label: string; readonly x: number; readonly repeat: boolean };
}

/** Линия от метки родителя вниз к началу дочерней полосы. */
export interface LaneConnector {
  readonly fromLaneId: string;
  readonly toLaneId: string;
  readonly x: number; // икс метки: правый край плитки-развилки
  readonly fromY: number; // низ строки родителя
  readonly toY: number; // середина строки ребёнка
}

/** Связь развилки на главу, уже стоящую в какой-то полосе (в т.ч. дуга повтора назад). */
export interface LinkArc {
  readonly fromChapterId: string;
  readonly toChapterId: string;
  readonly repeat: boolean;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
}

export interface BranchLayout {
  readonly rows: readonly LaneRow[];
  readonly connectors: readonly LaneConnector[];
  readonly arcs: readonly LinkArc[];
  /** Коробка всего нарисованного — по ней вписывают вид «показать всё». */
  readonly bounds: Box;
}

const EMPTY_BOUNDS: Box = { x: 0, y: 0, width: 0, height: 0 };

/**
 * @param lanes  результат `branchTree` — в ПОРЯДКЕ ОБХОДА, родитель раньше детей
 * @param collapsed  идентификаторы полос, чьи ПОТОМКИ спрятаны
 */
export function layoutLanes(lanes: readonly BranchLane[], collapsed: ReadonlySet<string>): BranchLayout {
  if (lanes.length === 0) {
    return { rows: [], connectors: [], arcs: [], bounds: EMPTY_BOUNDS };
  }

  // «Есть ли дети» смотрит на ИСХОДНЫЙ список — сворачивание прячет строки,
  // но не стирает сам факт, что у полосы есть потомки: без этого вид не
  // узнает, рисовать ли стрелку сворачивания у полосы без единого видимого
  // ребёнка.
  const hasChildrenIds = new Set<string>();
  for (const lane of lanes) {
    if (lane.parentLaneId !== null) hasChildrenIds.add(lane.parentLaneId);
  }

  // Полоса спрятана, если спрятан её родитель (каскад) ИЛИ сам родитель
  // свёрнут. Порядок `lanes` гарантирует, что родитель обработан раньше
  // ребёнка (`branchTree.ts`: обход — préorder, полоса кладётся в список
  // раньше собственных потомков), поэтому карту можно строить за один проход.
  const hiddenByLaneId = new Map<string, boolean>();
  for (const lane of lanes) {
    if (lane.parentLaneId === null) {
      hiddenByLaneId.set(lane.id, false);
      continue;
    }
    const parentHidden = hiddenByLaneId.get(lane.parentLaneId) ?? false;
    const parentCollapsed = collapsed.has(lane.parentLaneId);
    hiddenByLaneId.set(lane.id, parentHidden || parentCollapsed);
  }

  const rows: LaneRow[] = [];
  const rowByLaneId = new Map<string, LaneRow>();
  let visibleIndex = 0;

  for (const lane of lanes) {
    if (hiddenByLaneId.get(lane.id)) continue;

    // Икс начала полосы: у корневой — 0, у дочерней — правый край плитки
    // родителя, ПОД которой висит развилка (правило 3). Родитель уже
    // видим (иначе была бы видима и эта полоса) и уже обработан выше.
    const startX =
      lane.parentLaneId === null
        ? 0
        : (() => {
            const parentRow = rowByLaneId.get(lane.parentLaneId);
            if (!parentRow) {
              throw new Error(`Полоса «${lane.id}»: родитель «${lane.parentLaneId}» не найден в раскладке раньше неё`);
            }
            const anchorTile = parentRow.tiles[lane.anchorIndex];
            if (!anchorTile) {
              throw new Error(`Полоса «${lane.id}»: у родителя «${lane.parentLaneId}» нет плитки с индексом ${lane.anchorIndex}`);
            }
            return anchorTile.x + anchorTile.width;
          })();

    // Плитки идут встык: следующая начинается там, где кончилась предыдущая
    // ПО ШИРИНЕ, а не по сумме секунд — у пустой главы ширина поднята до
    // MIN_TILE_PX, и по секундам плитки наехали бы друг на друга.
    const tiles: TileBox[] = [];
    let cursorX = startX;
    for (const chapter of lane.chapters) {
      const width = Math.max(MIN_TILE_PX, chapter.seconds * PX_PER_SECOND);
      tiles.push({
        id: chapter.id,
        title: chapter.title,
        seconds: chapter.seconds,
        x: cursorX,
        width,
        forksAfter: chapter.forksAfter,
      });
      cursorX += width;
    }

    const tailX = tiles.length > 0 ? cursorX : startX;
    const tail =
      lane.tail.kind === 'end'
        ? { kind: 'end' as const, label: 'конец', x: tailX, repeat: false }
        : { kind: 'goto' as const, label: `дальше → ${lane.tail.toTitle}`, x: tailX, repeat: lane.tail.repeat };

    const row: LaneRow = {
      laneId: lane.id,
      name: lane.name,
      depth: lane.depth,
      seconds: lane.seconds,
      y: visibleIndex * (ROW_HEIGHT + ROW_GAP),
      startX,
      tiles,
      collapsed: collapsed.has(lane.id),
      hasChildren: hasChildrenIds.has(lane.id),
      tail,
    };

    rows.push(row);
    rowByLaneId.set(lane.id, row);
    visibleIndex += 1;
  }

  // Связки: одна на каждую видимую дочернюю полосу. К спрятанным полосам
  // связок не бывает — их родительский цикл выше их и не создал.
  const connectors: LaneConnector[] = [];
  for (const lane of lanes) {
    if (lane.parentLaneId === null) continue;
    const childRow = rowByLaneId.get(lane.id);
    if (!childRow) continue; // спрятана сворачиванием
    const parentRow = rowByLaneId.get(lane.parentLaneId);
    if (!parentRow) continue; // не должно случиться: видимый ребёнок при спрятанном родителе невозможен
    connectors.push({
      fromLaneId: lane.parentLaneId,
      toLaneId: lane.id,
      x: childRow.startX,
      fromY: parentRow.y + ROW_HEIGHT,
      toY: childRow.y + ROW_HEIGHT / 2,
    });
  }

  // Дуги: где какая глава физически стоит, ищем один раз по всем видимым
  // строкам — цель связи может лежать в ЛЮБОЙ уже построенной полосе,
  // включая ту же самую (повтор внутри одной полосы, `repeat.json`).
  const tileLocation = new Map<string, { readonly row: LaneRow; readonly tile: TileBox }>();
  for (const row of rows) {
    for (const tile of row.tiles) {
      tileLocation.set(tile.id, { row, tile });
    }
  }

  const arcs: LinkArc[] = [];
  for (const lane of lanes) {
    if (hiddenByLaneId.get(lane.id)) continue;
    for (const link of lane.links) {
      const from = tileLocation.get(link.fromChapterId);
      const to = tileLocation.get(link.toChapterId);
      if (!from || !to) continue; // одна из плиток спрятана сворачиванием — дуга не рисуется
      arcs.push({
        fromChapterId: link.fromChapterId,
        toChapterId: link.toChapterId,
        repeat: link.repeat,
        fromX: from.tile.x + from.tile.width,
        fromY: from.row.y + ROW_HEIGHT / 2,
        toX: to.tile.x,
        toY: to.row.y + ROW_HEIGHT / 2,
      });
    }
  }

  const bounds: Box = boundsOf(rows);

  return { rows, connectors, arcs, bounds };
}

/** Коробка, охватывающая все строки: имя слева, хвост (с запасом на подпись) справа. */
function boundsOf(rows: readonly LaneRow[]): Box {
  if (rows.length === 0) return EMPTY_BOUNDS;

  const minStartX = Math.min(...rows.map((row) => row.startX));
  const maxRight = Math.max(...rows.map((row) => row.tail.x + TAIL_WIDTH));
  const lastRow = rows[rows.length - 1]!;

  const x = minStartX - NAME_WIDTH;
  return {
    x,
    y: 0,
    width: maxRight - x,
    height: lastRow.y + ROW_HEIGHT,
  };
}

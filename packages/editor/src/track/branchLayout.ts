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

/**
 * ШИРИНА ПЛИТКИ — СЖАТАЯ ДОЛЯ ОТ САМОЙ ДЛИННОЙ ГЛАВЫ, а не секунды на множитель.
 *
 * Решение владельца 24.08.2026, дословно: «если слишком длинно всё будет,
 * то пиздец неудобный будет вид, так что надо сразу это нормализовать
 * как-то, чтобы было видно различие длин плиток друг от друга, но и при
 * этом ничего не ломалось, если в одном проекте плитка час, а в другом
 * пару минут».
 *
 * ЧТО БЫЛО. `width = seconds * PX_PER_SECOND`. Прямая пропорция ломается
 * с обоих концов: часовая глава даёт 36 000 px при множителе 10, а рядом
 * пятисекундная ветка — 50 px, и на одном экране они несопоставимы. Замер
 * на `showcase` 24.08.2026: главная 365 px против веток 18, 21 и 45 —
 * на плитке в 18 px не помещается ни имя, ни что-либо ещё.
 *
 * ЧТО СТАЛО. Доля считается от САМОЙ ДЛИННОЙ главы доски и сжимается
 * корнем:
 *
 *   width = MIN + (MAX − MIN) × √(seconds / longest)
 *
 * Корень выбран не «чтобы красиво». Он сохраняет ПОРЯДОК (длиннее глава —
 * шире плитка, всегда) и убивает произвол масштаба: час против двух минут
 * это отношение 30, а корень сжимает его до 5.5 — разница видна, но одна
 * глава не выдавливает остальные с экрана. Логарифм сжал бы сильнее, но
 * у него нет нуля: глава нулевой длительности законна (немая заготовка
 * ветки), и её пришлось бы обрабатывать отдельным случаем.
 *
 * ПОЧЕМУ ЭТО НЕ ПРОТИВОРЕЧИТ §5.2 `branches.md` («ширина плитки равна
 * длительности главы, поэтому пропорции читаются без цифр»). Пропорции
 * по-прежнему читаются, и порядок по-прежнему верен; изменилась ШКАЛА —
 * с линейной на корневую. Правило записано владельцем, им же и изменено,
 * той же датой в §9.
 */
export const MIN_TILE_W = 34;
export const MAX_TILE_W = 260;

/**
 * Зазор между соседними плитками, px.
 *
 * Решение владельца 24.08.2026: «надо сделать плитки чуть подальше друг
 * от друга, а то сейчас проблема со стыками». Встык две плитки читались
 * как одна длинная: границу между главами было видно только по смене
 * оттенка, а на узких плитках и её не хватало.
 */
export const TILE_GAP = 8;


/**
 * Ширина плитки по её длительности и длительности самой длинной главы доски.
 *
 * `longest <= 0` — на доске нет ни одной звучащей главы (всё немое или
 * пустое). Тогда все плитки одинаковы: сравнивать нечего, и делать вид,
 * что есть, было бы враньём.
 */
export function tileWidth(seconds: number, longest: number): number {
  if (!(longest > 0)) return MIN_TILE_W;
  const share = Math.sqrt(Math.max(0, seconds) / longest);
  return MIN_TILE_W + (MAX_TILE_W - MIN_TILE_W) * Math.min(1, share);
}

export const ROW_HEIGHT = 56;
export const ROW_GAP = 12;

/**
 * Запас сверху над первой строкой — под дугу повтора.
 *
 * Не косметика. Дуга повтора выгибается ВВЕРХ над строкой, из которой
 * выходит, чтобы её нельзя было спутать с обычной ломаной вниз. У повтора
 * из ПЕРВОЙ строки (фикстура `repeat`) выгибаться было некуда: вершина
 * уходила выше полотна и срезалась, а прижатая к нулю дуга проходила
 * прямо сквозь плитки и пряталась за ними. Замерено глазами 17.08.2026
 * на живом редакторе: разметка дуги в DOM есть, на экране её нет.
 *
 * 24 px — чуть больше половины высоты плитки, этого хватает, чтобы вершина
 * вышла над её верхним краем и дуга читалась как дуга.
 */
export const ARC_HEADROOM = 24;
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
  /** Порядковый номер главы на доске — им плитка и опознаётся. */
  readonly order: number;
  /** Описание главы: показывается по правой кнопке, на плитке его нет. */
  readonly description: string;
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
  readonly tail: {
    readonly kind: 'end' | 'goto';
    /** Что печатается: «конец» или «дальше → 3». Коротко, номером. */
    readonly label: string;
    /** Полное имя главы-цели — только для подсказки, на экране его нет. */
    readonly toTitle: string;
    readonly x: number;
    readonly repeat: boolean;
  };
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

  /*
   * Самая длинная глава ВСЕЙ доски — мера, от которой считаются доли ширин.
   * Берётся по всем полосам, а не по каждой отдельно: иначе одинаковые
   * по длительности главы в разных ветках вышли бы разной ширины, и доска
   * врала бы о пропорциях ровно там, где их и показывает.
   *
   * Считается по ИСХОДНОМУ списку, до сворачивания: свернул автор ветку
   * или нет — мера не должна ездить, иначе все плитки на доске меняли бы
   * ширину от щелчка по чужой стрелке.
   */
  /*
   * Номер главы по её идентификатору — чтобы хвост назывался ТЕМ ЖЕ номером,
   * что стоит на плитке. Без этого «дальше → Как работает остановка» и сама
   * плитка «1» опознаются как разные вещи, а это одна и та же глава.
   */
  const orderById = new Map<string, number>();
  for (const lane of lanes) {
    for (const chapter of lane.chapters) orderById.set(chapter.id, chapter.order);
  }

  const longestSeconds = lanes.reduce(
    (longest, lane) => lane.chapters.reduce((best, chapter) => Math.max(best, chapter.seconds), longest),
    0,
  );

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

    // Плитки идут с ЗАЗОРОМ: следующая начинается там, где кончилась
    // предыдущая, плюс TILE_GAP. По сумме секунд их ставить нельзя —
    // ширина считается сжатой шкалой (см. tileWidth), и по секундам плитки
    // наехали бы друг на друга.
    const tiles: TileBox[] = [];
    let cursorX = startX;
    for (const chapter of lane.chapters) {
      const width = tileWidth(chapter.seconds, longestSeconds);
      tiles.push({
        id: chapter.id,
        title: chapter.title,
        seconds: chapter.seconds,
        x: cursorX,
        width,
        forksAfter: chapter.forksAfter,
        order: chapter.order,
        description: chapter.description,
      });
      cursorX += width + TILE_GAP;
    }

    const tailX = tiles.length > 0 ? cursorX : startX;
    const tail =
      lane.tail.kind === 'end'
        ? { kind: 'end' as const, label: 'конец', toTitle: '', x: tailX, repeat: false }
        : {
          kind: 'goto' as const,
          /*
            ТОЛЬКО НОМЕР, без имени главы.

            Имя тут было третьим повторением одной строки на экране: оно уже
            стоит ярлыком ветки и стояло на плитке. Владелец 25.08.2026:
            «текст абсолютно не нужен, визуально очень шумно из-за него».
            Номер — то же указание, но читается за один взгляд и совпадает
            с числом на самой плитке. Полное имя остаётся в подсказке хвоста.
          */
          label: (() => {
            const order = orderById.get(lane.tail.toChapterId);
            return order === undefined ? 'дальше' : `дальше → ${order}`;
          })(),
          toTitle: lane.tail.toTitle,
          x: tailX,
          repeat: lane.tail.repeat,
        };

    const row: LaneRow = {
      laneId: lane.id,
      name: lane.name,
      depth: lane.depth,
      seconds: lane.seconds,
      y: ARC_HEADROOM + visibleIndex * (ROW_HEIGHT + ROW_GAP),
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

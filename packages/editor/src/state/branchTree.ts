/**
 * Раскладка дерева веток объяснения для вида «Ветки» (`design/branches.md` §5).
 * Модель для него уже была (`exits.ts`: главы с правилами выхода) — не хватало
 * только раскладки на полосы.
 *
 * Чистый модуль: без React, без DOM. Обход графа не второй — `leadsBack`
 * (значит, и `reachableFrom` под ним) и форма плитки `ChapterTile`
 * переиспользуются из `exits.ts`: два обхода одного графа расходятся тихо,
 * а вид «Ветки» и панель гейта обязаны видеть один и тот же ответ на вопрос
 * «куда ведёт эта развилка» и «это повтор или нет».
 */
import type { Project, Segment } from '@player/core';

import { type ChapterTile, leadsBack } from './exits.js';

/**
 * Связь развилки на плитку, уже занявшую место в другой полосе.
 *
 * Не новая полоса: цель правила выхода, которую уже показывает какая-то
 * полоса, рисуется на доске стрелкой на неё, а не второй копией той же
 * главы.
 */
export interface BranchLink {
  readonly fromChapterId: string;
  readonly toChapterId: string;
  readonly toTitle: string;
  /** Ведёт ли связь НАЗАД — можно ли из цели снова дойти до развилки. */
  readonly repeat: boolean;
}

/** Чем кончается полоса: дальше рассказывать нечего, либо цепочка ведёт в главу другой полосы. */
export type BranchTail =
  | { readonly kind: 'end' }
  | { readonly kind: 'goto'; readonly toChapterId: string; readonly toTitle: string; readonly repeat: boolean };

/** Одна полоса дерева веток: цепочка подряд идущих глав своей глубины. */
export interface BranchLane {
  readonly id: string;
  /** «Основная» у корневой; иначе — имя первой главы полосы. */
  readonly name: string;
  /** 0 у корневой полосы. */
  readonly depth: number;
  readonly chapters: readonly ChapterTile[];
  readonly parentLaneId: string | null;
  /** Индекс плитки в родительской полосе, ПОСЛЕ которой висит эта ветка. −1 у корневой. */
  readonly anchorIndex: number;
  /** Секунды от начала родительской полосы до метки, из которой ветка выходит. 0 у корневой. */
  readonly anchorSeconds: number;
  /** Сумма длительностей глав полосы. */
  readonly seconds: number;
  readonly tail: BranchTail;
  readonly links: readonly BranchLink[];
  /**
   * В эту полосу не ведёт ни одно ребро выхода — зритель сюда не попадёт
   * никогда. `false` у всех полос, найденных обходом от `project.entry`;
   * `true` у полос, построенных ВТОРЫМ проходом из глав, не занявших места
   * ни в одной из них (Сессия 43). Полосы-потомки сиротской полосы (свои
   * развилки внутри вынесенного куска) тоже сироты — признак наследуется
   * при обходе, а не выставляется заново.
   */
  readonly orphan: boolean;
}

/** Плитка главы — та же форма, что кладёт в цепочку `branchChapters` (`exits.ts`). */
function tileOf(segment: Segment): ChapterTile {
  return {
    id: segment.id,
    title: segment.title || segment.id,
    seconds: segment.audio.duration,
    forksAfter: segment.exit.rules.length > 0,
  };
}

/**
 * Раскладывает объяснение на полосы дерева веток.
 *
 * **Полоса** — цепочка глав по `exit.default`, пока у главы нет правил
 * выхода. Развилка (правила выхода есть) кончает цепочку своей полосы,
 * но её `exit.default`, если он не `null`, — «иначе, идём туда», основной
 * ход рассказа, — ПРОДОЛЖАЕТ ТУ ЖЕ полосу, а не начинает новую.
 *
 * Цель правила выхода, которую ещё никто не занял, начинает дочернюю
 * полосу глубиной на 1 больше. Цель, уже стоящую в какой-то полосе, —
 * это не полоса, а СВЯЗЬ развилки на неё; признак повтора считает
 * `leadsBack` (реально ли из цели снова дойти до развилки), а не порядковый
 * номер сегмента в списке — список не задаёт порядок проигрывания, граф
 * не дерево.
 *
 * Цепочка полосы обрывается ПЕРЕД стыком — главой с двумя и более разными
 * источниками ссылок (`default` или `goto` правила): такая глава не своя,
 * она принадлежит полосе-предку. Исключение — развилка БЕЗ `default`,
 * у которой две и более ТОЛЬКО ЧТО построенных дочерних полосы независимо
 * дошли хвостом до одного и того же стыка: тогда стык продолжает полосу
 * самой развилки, потому что «иначе» у всех исходов молча совпало.
 *
 * Обход не зацикливается никогда (`repeat.json` несёт ребро назад по
 * построению продукта, а не по ошибке): каждая полоса помнит пройденные
 * ею самой главы и останавливается ПЕРЕД повтором, отдавая хвост `goto`
 * вместо того, чтобы войти в цикл заново.
 *
 * **Сироты (Сессия 43).** Обход от `entry` находит только ДОСТИЖИМОЕ.
 * Глава, в которую не ведёт ни одно ребро выхода, — законное состояние
 * (например, только что вынесенная `extractToBranch.ts` ветка, пока автор
 * не подключил её обратно правилом), и она обязана остаться ВИДИМОЙ, иначе
 * автор не сможет её ни увидеть, ни починить. После обхода от `entry`
 * вторым проходом по `project.segments` достраиваются полосы для глав, не
 * занявших места ни в одной из уже построенных, — тем же `buildLane`,
 * помеченные `orphan: true`.
 */
export function branchTree(project: Project): readonly BranchLane[] {
  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));

  const requireSegment = (id: string): Segment => {
    const segment = byId.get(id);
    if (!segment) throw new Error(`Главы «${id}» нет в проекте: дерево веток на ней обрывается в никуда`);
    return segment;
  };

  // Стык — глава, на которую ссылаются (через `default` или `goto` правила)
  // ДВЕ и более РАЗНЫЕ главы. Источники — множество, а не счётчик ссылок:
  // если бы у одной главы `default` и правило целились в одну и ту же цель,
  // это один источник, а не два.
  const incoming = new Map<string, Set<string>>();
  for (const segment of project.segments) {
    const addEdge = (to: string): void => {
      const sources = incoming.get(to) ?? new Set<string>();
      sources.add(segment.id);
      incoming.set(to, sources);
    };
    if (segment.exit.default !== null) addEdge(segment.exit.default);
    for (const rule of segment.exit.rules) addEdge(rule.goto);
  }
  const isJunction = (id: string): boolean => (incoming.get(id)?.size ?? 0) >= 2;

  const gotoTail = (toChapterId: string, repeat: boolean): BranchTail => ({
    kind: 'goto',
    toChapterId,
    toTitle: requireSegment(toChapterId).title || toChapterId,
    repeat,
  });

  // Глава, уже занявшая место в какой-то полосе. Общий для ВСЕГО дерева,
  // не для одной полосы: вторая ссылка на ту же главу — это связь (п. 5
  // выше), и определить это можно только глядя на дерево целиком.
  const placed = new Set<string>();

  function buildLane(
    startId: string,
    depth: number,
    parentLaneId: string | null,
    anchorIndex: number,
    anchorSeconds: number,
    orphan: boolean,
  ): { lane: BranchLane; descendants: readonly BranchLane[] } {
    const laneId = startId;
    const chapters: ChapterTile[] = [];
    const links: BranchLink[] = [];
    const descendants: BranchLane[] = [];
    // Свои для ЭТОЙ полосы: стык считается по всему дереву (`incoming`),
    // а вот «уже была в ЭТОЙ цепочке» — локальная защита от зацикливания
    // (п. 8), когда `default` где-то ведёт назад мимо развилки.
    const seenHere = new Set<string>();

    let cursor: string | null = startId;
    let lastPushed = startId;
    let secondsTotal = 0;
    let tail: BranchTail;

    for (;;) {
      if (cursor === null) {
        tail = { kind: 'end' };
        break;
      }
      if (seenHere.has(cursor)) {
        tail = gotoTail(cursor, leadsBack(project, lastPushed, cursor));
        break;
      }

      const segment = requireSegment(cursor);
      seenHere.add(cursor);
      placed.add(cursor);
      secondsTotal += segment.audio.duration;
      chapters.push(tileOf(segment));
      lastPushed = cursor;

      if (segment.exit.rules.length === 0) {
        const next = segment.exit.default;
        // Проверка стыка — только при ПРОДОЛЖЕНИИ цепочки (в полосе уже
        // есть плитка): для головы полосы стык не проверяется вовсе (п. 6).
        if (next !== null && isJunction(next)) {
          tail = gotoTail(next, leadsBack(project, cursor, next));
          break;
        }
        cursor = next;
        continue;
      }

      // Развилка. Её правила разбираются здесь и сразу, по порядку: цель,
      // которую ещё никто не занял, тут же достраивается ДО КОНЦА дочерней
      // полосой — отложить на потом значило бы, что следующее правило
      // ЭТОЙ ЖЕ развилки не узнает о свежем занятии места (п. 5 смотрит
      // на порядок правил, а не только на факт «где-то есть»).
      const forkId = cursor;
      const forkIndex = chapters.length - 1;
      const forkSeconds = secondsTotal;
      const children: BranchLane[] = [];
      for (const rule of segment.exit.rules) {
        const target = rule.goto;
        if (placed.has(target)) {
          links.push({
            fromChapterId: forkId,
            toChapterId: target,
            toTitle: requireSegment(target).title || target,
            repeat: leadsBack(project, forkId, target),
          });
          continue;
        }
        const built = buildLane(target, depth + 1, laneId, forkIndex, forkSeconds, orphan);
        children.push(built.lane);
        descendants.push(built.lane, ...built.descendants);
      }

      if (segment.exit.default !== null) {
        const next = segment.exit.default;
        if (isJunction(next)) {
          tail = gotoTail(next, leadsBack(project, forkId, next));
          break;
        }
        cursor = next;
        continue;
      }

      // `default` нет: единственный шанс продолжить ТУ ЖЕ полосу — п. 7,
      // когда две и более дочерних полосы, только что построенные выше,
      // независимо дошли хвостом до ОДНОЙ и ТОЙ ЖЕ главы-стыка. Совпадение
      // проверяется среди прямых детей ЭТОЙ развилки, не всего дерева.
      const convergeCounts = new Map<string, number>();
      for (const child of children) {
        if (child.tail.kind !== 'goto') continue;
        convergeCounts.set(child.tail.toChapterId, (convergeCounts.get(child.tail.toChapterId) ?? 0) + 1);
      }
      const converge = [...convergeCounts].find(([, count]) => count >= 2)?.[0] ?? null;
      if (converge !== null) {
        cursor = converge; // намеренно МИМО проверки стыка — п. 7 её и есть исключение
        continue;
      }

      tail = { kind: 'end' };
      break;
    }

    const lane: BranchLane = {
      id: laneId,
      name: depth === 0 ? 'Основная' : chapters[0]!.title,
      depth,
      chapters,
      parentLaneId,
      anchorIndex,
      anchorSeconds,
      seconds: secondsTotal,
      tail,
      links,
      orphan,
    };
    return { lane, descendants };
  }

  const root = buildLane(project.entry, 0, null, -1, 0, false);
  const reachable = [root.lane, ...root.descendants];

  // Второй проход: главы, не занявшие места ни в одной достижимой полосе.
  // Порядок — как в `project.segments`, а не как в графе: граф не дерево,
  // и у сироты нет «естественного» порядка, кроме порядка в списке автора.
  // `buildLane` использован тот же самый — сирота может тянуть за собой
  // цепочку и собственные развилки, а не быть одной главой (п. 2 задачи).
  const orphans: BranchLane[] = [];
  for (const segment of project.segments) {
    if (placed.has(segment.id)) continue;
    const built = buildLane(segment.id, 0, null, -1, 0, true);
    orphans.push(built.lane, ...built.descendants);
  }

  return [...reachable, ...orphans];
}

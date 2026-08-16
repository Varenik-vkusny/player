/**
 * «Вынести диапазон глав в ветку» — требование владельца 16.08.2026.
 *
 * Автор выделяет подряд идущие главы (щелчок по первой, Shift-щелчок по
 * последней) и нажимает кнопку: основная линия смыкается над вынесенным
 * куском, а сам кусок остаётся в проекте нетронутым — ни гейты, ни правила
 * выхода внутри него, ни слайды, ни звук не меняются. У него просто
 * пропадают входящие ссылки, и он становится СИРОТОЙ (`branchTree.ts`,
 * Сессия 43): автор увидит его на доске и подключит обратно, когда захочет,
 * обычным правилом выхода (`connect`, `exits.ts`). Само правило здесь
 * не создаётся — вопроса с вариантами может не быть вовсе, а выдуманный
 * гейт был бы работой, которой автор не просил.
 *
 * Чистый модуль: без React, без DOM. `extractToBranch` зовёт
 * `extractBlockedReason` и бросает с той же строкой, если та вернула
 * причину, — один источник правды на два входа, тем же приёмом, что пара
 * `splitBlockedReason`/`splitSegmentAtGate` в `split.ts`.
 */
import { ProjectSchema } from '@player/core';
import type { Project, Segment } from '@player/core';

/** Имя главы для автора: заголовок, а идентификатор — только если заголовка нет. */
function titleOf(segment: Segment): string {
  return segment.title || segment.id;
}

/**
 * Упорядочивает выделение по цепочке `exit.default`.
 *
 * `undefined` — выделение не образует непрерывную цепочку: либо в нём нет
 * ровно одной главы без предшественника ВНУТРИ выделения (значит несколько
 * независимых кусков или разрыв), либо обход по `default` от этой главы
 * не покрывает всё выделение целиком (значит где-то разрыв или ответвление
 * увело в сторону). Порядок элементов в `chapterIds` роли не играет — автор
 * мог тянуть Shift-щелчок в любую сторону.
 *
 * Связь между главами внутри выделения смотрит ТОЛЬКО на `exit.default`:
 * правило выхода (`exit.rules`) в цепочку не встраивает — развилка внутри
 * выделения отклоняется отдельно, причиной 3, а не тут.
 */
function orderChain(project: Project, chapterIds: readonly string[]): readonly string[] | undefined {
  const set = new Set(chapterIds);
  if (set.size !== chapterIds.length) return undefined; // повтор в выделении — уже не цепочка

  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));
  for (const id of set) {
    if (!byId.has(id)) throw new Error(`Главы «${id}» нет в проекте: вынести в ветку нечего`);
  }

  // Предшественник — сколько глав ВНУТРИ выделения ведут в данную главу
  // своим `default`. У ровно одной главы предшественников ноль — это c1;
  // у остальных — ровно один, иначе выделение не простая цепочка.
  const inDegree = new Map<string, number>([...set].map((id) => [id, 0]));
  for (const id of set) {
    const target = byId.get(id)!.exit.default;
    if (target !== null && set.has(target)) inDegree.set(target, (inDegree.get(target) ?? 0) + 1);
  }
  const heads = [...set].filter((id) => inDegree.get(id) === 0);
  if (heads.length !== 1) return undefined;

  const order: string[] = [];
  const visited = new Set<string>();
  let cursor: string | null = heads[0]!;
  while (cursor !== null && set.has(cursor) && !visited.has(cursor)) {
    visited.add(cursor);
    order.push(cursor);
    cursor = byId.get(cursor)!.exit.default;
  }

  return order.length === set.size ? order : undefined;
}

/**
 * Почему выделенный диапазон нельзя вынести в ветку. `undefined` — можно.
 *
 * Строки — для автора: словами и с именами глав, а не идентификаторами.
 */
export function extractBlockedReason(project: Project, chapterIds: readonly string[]): string | undefined {
  if (chapterIds.length === 0) {
    return 'Ничего не выделено: вынести в ветку нечего.';
  }

  const order = orderChain(project, chapterIds);
  if (!order) {
    return 'Выделенные главы не идут подряд одна за другой: вынести в ветку можно только сплошной кусок цепочки.';
  }

  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));
  const set = new Set(order);

  // Причина 3: развилка внутри выделения — у неё уже есть свои ветки,
  // и что стало бы с ними, не решено ни в одном документе.
  for (const id of order) {
    const segment = byId.get(id)!;
    if (segment.exit.rules.length > 0) {
      return `В выделении есть развилка («${titleOf(segment)}»). Вынести можно только сплошной кусок `
        + 'без вопросов с расхождением.';
    }
  }

  // Причина 4: ссылка снаружи в СЕРЕДИНУ выделения (c2…cn). Про c1 это
  // законно — вынесенная ветка обязана оставаться доступной по ссылке на c1,
  // так что смыкание её не трогает.
  const middle = new Set(order.slice(1));
  if (middle.size > 0) {
    for (const segment of project.segments) {
      if (set.has(segment.id)) continue; // ссылки ИЗНУТРИ выделения — не в счёт
      const targets: string[] = [...segment.exit.rules.map((rule) => rule.goto)];
      if (segment.exit.default !== null) targets.push(segment.exit.default);
      const hit = targets.find((target) => middle.has(target));
      if (hit !== undefined) {
        return `Глава «${titleOf(segment)}» вне выделения ссылается на «${titleOf(byId.get(hit)!)}» `
          + 'в середине диапазона: вынос оборвал бы эту ссылку.';
      }
    }
  }

  // Причина 5: выносится всё объяснение целиком.
  const c1 = order[0]!;
  const cn = order[order.length - 1]!;
  const after = byId.get(cn)!.exit.default;
  if (c1 === project.entry && after === null) {
    return 'Выносится всё объяснение целиком: после этого не осталось бы ни одной достижимой главы.';
  }

  // Причина 6: результат обязан ЗАГРУЖАТЬСЯ. Найдена не рассуждением,
  // а прогоном: вынос `s-end` из `conditions.json` не попадал ни под одну
  // из пяти причин выше и всё равно давал незагружаемый проект.
  //
  // Механика дыры. Смыкание обнуляет `exit.default` у главы, которая вела
  // в `c1`. Если та глава — РАЗВИЛКА, её выход обязан быть тотальным
  // (`schema.ts`: «при любом состоянии ответов зрителю есть куда идти»),
  // а тотальность бывает двух видов: запасной выход либо правила, сами
  // исчерпывающие исходы. Второе схема умеет доказывать ТОЛЬКО для правил
  // с одним условием — значит развилка с двухусловным правилом держится
  // исключительно на `default`, и снятие его делает проект незагружаемым.
  //
  // Шестую причину не перечисляем правилами, а СПРАШИВАЕМ У СХЕМЫ: она
  // и есть источник правды о законности проекта, а второй перечень условий
  // тотальности разъехался бы с ней молча.
  const candidate = applyExtract(project, order);
  if (!ProjectSchema.safeParse(candidate).success) {
    const broke = [...prevIdsOf(project, c1)]
      .map((id) => byId.get(id)!)
      .find((segment) => segment.exit.rules.length > 0);
    if (broke) {
      return `У главы «${titleOf(broke)}» запасной выход ведёт в выделение, и она — развилка. `
        + 'Убрав его, зритель с неподошедшим ответом остался бы без продолжения. '
        + 'Сначала дайте ей другой выход по умолчанию.';
    }
    return 'После выноса объяснение перестало бы загружаться. Причина не в самом выделении: '
      + 'выход какой-то из глав перестал бы покрывать все ответы зрителя.';
  }

  return undefined;
}

/** Главы, чей `exit.default` ведёт в `c1`, — те, над которыми смыкается линия. */
function prevIdsOf(project: Project, c1: string): ReadonlySet<string> {
  return new Set(
    project.segments.filter((segment) => segment.exit.default === c1).map((segment) => segment.id),
  );
}

/**
 * Сама перестройка проекта. Отдельной функцией, потому что её зовут ДВОЕ:
 * `extractToBranch` — чтобы вернуть результат, и `extractBlockedReason` —
 * чтобы спросить схему, законен ли он. Две копии этой сборки разъехались бы
 * молча, и тогда проверка проверяла бы не то, что потом произойдёт.
 */
function applyExtract(project: Project, order: readonly string[]): Project {
  const c1 = order[0]!;
  const cn = order[order.length - 1]!;
  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));
  const after = byId.get(cn)!.exit.default;
  const prevIds = prevIdsOf(project, c1);

  const segments = project.segments.map((segment) =>
    prevIds.has(segment.id) ? { ...segment, exit: { ...segment.exit, default: after } } : segment);

  // `after` не может быть `null`, если `c1` — вход: причина 5 отказала бы
  // раньше. Меняем вход, только когда вынесен именно он.
  const entry = project.entry === c1 ? after! : project.entry;

  return { ...project, entry, segments };
}

/**
 * Выносит подряд идущие главы `chapterIds` в отдельную ветку. Бросает, если
 * операция запрещена (`extractBlockedReason`, тот же источник правды).
 *
 * Смыкание: `prev` — ВСЕ главы, чей `exit.default` вёл в `c1` (первую главу
 * выделения). Спецификация задачи говорит об одной такой главе, но реальный
 * граф такой гарантии не даёт — их может не быть вовсе (в `c1` ведёт только
 * правило, а не `default`: смыкать тогда нечего, и выделение остаётся
 * достижимым по этому правилу) или быть больше одной (несколько веток
 * развилки сходятся в `c1` через `default`: см. `split-track.json`,
 * `s-tail`). Смыкание применяется к КАЖДОЙ найденной — иначе часть ссылок
 * на `c1` пережила бы вынос молча, а другая часть — нет.
 */
export function extractToBranch(project: Project, chapterIds: readonly string[]): Project {
  const blocked = extractBlockedReason(project, chapterIds);
  if (blocked !== undefined) throw new Error(blocked);

  const order = orderChain(project, chapterIds)!; // extractBlockedReason уже подтвердила цепочку
  return applyExtract(project, order);
}

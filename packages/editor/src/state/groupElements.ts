/**
 * Сборка и разборка группы элементов — чистая логика, без React, DOM
 * и `project.segments`.
 *
 * Решение владельца: координаты ребёнка отсчитываются ОТ ГРУППЫ, как
 * в Canva. В DOM узел группы — абсолютно позиционированный предок, значит
 * `left`/`top` ребёнка — это смещение от его padding-бокса, а не от сцены.
 * Отсюда два разных пересчёта координат в разные стороны: `groupElements`
 * вычитает угол охвата, `ungroupElements` прибавляет обратно — и, раз
 * группу можно повернуть, прибавляет не просто числом, а поворотом вокруг
 * центра группы (иначе повёрнутая группа при разборке высыпала бы детей
 * не там, где их видел зритель).
 *
 * `SegmentSchema` (`schema.ts`, `superRefine`) запрещает ребёнка на слайде,
 * где нет состояния его группы. Поэтому обе операции обязаны пройти
 * КАЖДЫЙ слайд сегмента, а не только текущий, — иначе после сохранения
 * проект не проходит собственную проверку при следующей загрузке.
 */
import type { Element, ElementState, Segment, Slide } from '@player/core';

import {
  type Box,
  centerOf,
  childBoxInGroup,
  childBoxInScene,
  rotate,
  unionBox,
} from '../stage/geometry.js';
import { freeId } from './elements.js';

/** Результат сборки или разборки: полные новые массивы взамен прежних. */
export interface Grouped {
  readonly elements: readonly Element[];
  readonly slides: readonly Slide[];
  /**
   * У `groupElements` — id только что созданной группы.
   * У `ungroupElements` — id группы, которая только что перестала
   * существовать (для подписи автору, «разобрана группа N»).
   */
  readonly groupId: string;
}

/** Состояния `ids` на слайде, у которых оно действительно есть.
 *  `noUncheckedIndexedAccess` возвращает `ElementState | undefined` на
 *  любой `slide.states[id]`, и присутствие — не случайность: отсутствие
 *  состояния означает «элемента здесь нет» (ADR-015), а не пустоту. */
function presentOn(
  slide: Slide,
  ids: readonly string[],
): readonly { readonly id: string; readonly state: ElementState }[] {
  const result: { id: string; state: ElementState }[] = [];
  for (const id of ids) {
    const state = slide.states[id];
    if (state !== undefined) result.push({ id, state });
  }
  return result;
}

/**
 * Собирает элементы `ids` в новую группу.
 *
 * Меньше двух элементов бросает: группа из одного не имеет смысла — это
 * был бы узел, который ничего не объединяет, только оборачивает.
 */
export function groupElements(segment: Segment, ids: readonly string[]): Grouped {
  if (ids.length < 2) {
    throw new Error(`Группа собирается минимум из двух элементов, получено ${ids.length}`);
  }

  const byId = new Map(segment.elements.map((element) => [element.id, element]));
  for (const id of ids) {
    const element = byId.get(id);
    if (element === undefined) {
      throw new Error(`Нельзя сгруппировать элемент «${id}»: его нет в сегменте`);
    }
    // Собирать можно только элементы верхнего уровня. Захода внутрь чужой
    // группы у интерфейса пока нет, случай недостижим из UI — но правило
    // пишется сразу, а не когда захват появится и данные окажутся неявно
    // допущены прошлым молчанием.
    if (element.parentId !== undefined) {
      throw new Error(
        `Нельзя сгруппировать элемент «${id}»: он уже в группе «${element.parentId}»`,
      );
    }
  }

  const taken: { id: string }[] = segment.elements.map((element) => ({ id: element.id }));
  const groupId = freeId('group', taken);
  const groupElement: Element = { id: groupId, type: 'group', content: '', locked: false };

  const idSet = new Set(ids);

  // Слайды, где нет ни одного из группируемых, остаются ТЕМИ ЖЕ объектами
  // по ссылке — им нечего пересчитывать, а сохранение ссылки даёт
  // потребителям право сравнивать слайды по `===` вместо глубокого diff.
  const slides = segment.slides.map((slide) => {
    const present = presentOn(slide, ids);
    if (present.length === 0) return slide;

    const boxes: Box[] = present.map(({ state }) => ({
      x: state.x,
      y: state.y,
      width: state.width,
      height: state.height,
      rotation: state.rotation,
    }));
    // present непусто, значит unionBox не может вернуть undefined —
    // «нет ни одного бокса» здесь не тот случай.
    const box = unionBox(boxes)!;

    const states = { ...slide.states };

    // Узел группы в DOM создаёт свой контекст наложения (stacking context):
    // после группировки zIndex ребёнка упорядочивает его только СРЕДИ
    // БРАТЬЕВ внутри группы, а место всей группы среди чужих элементов
    // решает zIndex группы. Берём МАКСИМУМ детских: тогда верхний член
    // группы остаётся на том же месте относительно чужих элементов, каким
    // был до группировки, а остальных группировка поднимает к нему.
    // Взяли бы минимум — опустили бы верхнего. Если между группируемыми
    // лежал чужой элемент, порядок неизбежно меняется; так же ведёт себя
    // Canva.
    const maxZIndex = Math.max(...present.map(({ state }) => state.zIndex));

    states[groupId] = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      rotation: 0,
      zIndex: maxZIndex,
      opacity: 1,
      visible: true,
      flipX: false,
      flipY: false,
      style: {},
    };

    for (const { id, state } of present) {
      // Обратная сторона той же пары. Охват `box` всегда невращённый
      // (`rotation: 0` строкой выше), поэтому здесь она вырождается в простое
      // вычитание угла — и написана всё-таки через общую функцию, чтобы
      // сборка и разборка остались ОДНОЙ формулой, а не двумя похожими.
      const local = childBoxInGroup(states[groupId]!, { ...state });
      states[id] = { ...state, x: local.x, y: local.y, rotation: local.rotation };
    }

    return { ...slide, states };
  });

  // Группа встаёт на место ПЕРВОГО из группируемых элементов, дети —
  // сразу за ней, слитно, сохраняя свой относительный порядок. Порядок
  // братьев решает спор при попадании указателя, поэтому чужой элемент,
  // раньше лежавший МЕЖДУ будущими детьми, после группировки уезжает
  // целиком за пределы группы, а не остаётся вклиненным.
  const others = segment.elements.filter((element) => !idSet.has(element.id));
  const firstIndex = segment.elements.findIndex((element) => idSet.has(element.id));
  let othersBefore = 0;
  for (let i = 0; i < firstIndex; i += 1) {
    if (!idSet.has(segment.elements[i]!.id)) othersBefore += 1;
  }

  const children = segment.elements
    .filter((element) => idSet.has(element.id))
    .map((element) => ({ ...element, parentId: groupId }));

  const elements: Element[] = [
    ...others.slice(0, othersBefore),
    groupElement,
    ...children,
    ...others.slice(othersBefore),
  ];

  return { elements, slides, groupId };
}

/** Копия элемента без `parentId`. `delete`, а не `parentId: undefined`:
 *  ключ со значением `undefined` переживает спред и по-разному попадает
 *  в `JSON.stringify` в зависимости от места — см. `elementClipboard.ts`. */
function withoutParent(element: Element): Element {
  const copy = { ...element };
  delete copy.parentId;
  return copy;
}

/**
 * Разбирает группу `groupId`: узел удаляется, дети становятся элементами
 * верхнего уровня и возвращаются в координаты сцены.
 *
 * Поворот группы обязателен к учёту. Автор мог повернуть группу целиком —
 * тогда ребёнок на экране стоит не там, куда указывает наивное сложение
 * `x + группа.x`: он стоит там, куда его снёс поворот группы вокруг ЕЁ
 * центра. Разборка обязана поставить ребёнка туда же, где он был ВИДЕН,
 * а не туда, где он лежал бы без поворота.
 */
export function ungroupElements(segment: Segment, groupId: string): Grouped {
  const groupElement = segment.elements.find((element) => element.id === groupId);
  if (groupElement === undefined || groupElement.type !== 'group') {
    throw new Error(`Нельзя разгруппировать «${groupId}»: это не группа сегмента`);
  }

  const childIds = segment.elements
    .filter((element) => element.parentId === groupId)
    .map((element) => element.id);

  const slides = segment.slides.map((slide) => {
    const groupState = slide.states[groupId];
    if (groupState === undefined) return slide;

    const states = { ...slide.states };
    delete states[groupId];

    for (const { id, state } of presentOn(slide, childIds)) {
      // Разбор поворота вокруг центра и сложения углов — у `childBoxInScene`.
      // Здесь она зовётся, а не повторяется: с появлением захода внутрь
      // группы (Сессия 36) ту же формулу спрашивает холст на каждый жест,
      // и два её описания разошлись бы МОЛЧА — на неповёрнутых группах,
      // то есть на всех эталонных фикстурах, они дают одно и то же.
      const scene = childBoxInScene(groupState, state);
      states[id] = { ...state, x: scene.x, y: scene.y, rotation: scene.rotation };
    }

    return { ...slide, states };
  });

  // Дети встают ровно на место группы, сохраняя относительный порядок,
  // в котором лежали в `segment.elements` — по той же причине, что и при
  // сборке: порядок братьев решает спор при попадании указателя.
  const isRemoved = (element: Element) => element.id === groupId || element.parentId === groupId;
  const others = segment.elements.filter((element) => !isRemoved(element));
  const groupIndex = segment.elements.findIndex((element) => element.id === groupId);
  let othersBefore = 0;
  for (let i = 0; i < groupIndex; i += 1) {
    if (!isRemoved(segment.elements[i]!)) othersBefore += 1;
  }

  const children = segment.elements
    .filter((element) => element.parentId === groupId)
    .map(withoutParent);

  const elements: Element[] = [
    ...others.slice(0, othersBefore),
    ...children,
    ...others.slice(othersBefore),
  ];

  return { elements, slides, groupId };
}

/**
 * Группа, внутри которой сейчас автор, — ВЫВЕДЕНА из выделения, а не хранится
 * отдельным полем (Сессия 36, решение владельца: двойной щелчок входит внутрь
 * группы).
 *
 * Отдельное поле «внутри» пришлось бы либо тоже класть в историю рядом
 * с `selectedIds` — тогда `Ctrl+Z` откатывал бы «в какой группе автор», что
 * ему совсем не нужно, — либо мириться с тем, что откат вернёт выделение
 * верхнего уровня, а редактор молча останется «внутри». Вывод снимает вопрос:
 * «внутри» — это просто «выделено ровно то, что лежит в одной группе»,
 * а выход (Escape, щелчок по пустому месту) уже снимает выделение сам,
 * никакого отдельного пути наружу программировать не нужно.
 *
 * Возвращает id группы, только если ВСЕ выделенные — её прямые дети.
 * Пустое выделение, разные родители, хоть один элемент верхнего уровня —
 * `undefined`: тогда автор считается «снаружи».
 */
export function activeGroupOf(
  elements: readonly Element[],
  selectedIds: readonly string[],
): string | undefined {
  if (selectedIds.length === 0) return undefined;

  const byId = new Map(elements.map((element) => [element.id, element]));
  let groupId: string | undefined;

  for (const id of selectedIds) {
    const parentId = byId.get(id)?.parentId;
    if (parentId === undefined) return undefined; // верхнего уровня или не найден вовсе
    if (groupId === undefined) groupId = parentId;
    else if (groupId !== parentId) return undefined; // дети РАЗНЫХ групп
  }

  return groupId;
}

/** Один ребёнок группы для `reflowGroup`: id и бокс в ЛОКАЛЬНЫХ координатах. */
export interface GroupChildBox {
  readonly id: string;
  readonly box: Box;
}

/**
 * Пересчитывает охват группы по её содержимому — второй вызывающий
 * `unionBox`, обещанный Сессией 35 (план С35 §11).
 *
 * Правка ребёнка (передвинули, растянули, вытащили за край) меняет то, что
 * группа обязана охватывать. Наивный пересчёт «взять охват детей и записать
 * его группе» ломает картинку тем сильнее, чем больше угол ПОВОРОТА группы:
 * дети вращаются вокруг ЕЁ центра, а смена бокса группы двигает этот центр —
 * и всё содержимое уезжает на экране, хотя автор его не трогал. На
 * неповёрнутой группе (то есть на всей фикстуре `groups.json`) наивный
 * пересчёт ведёт себя безупречно и прячет дефект (план С36 §8).
 *
 * Правильность — следствие построения, а не удачи:
 *
 * 1. снимаем боксы детей НА СЦЕНЕ (`childBoxInScene`) — это истина, которую
 *    обязано сохранить всё остальное, зритель её уже видел;
 * 2. считаем охват в ЛОКАЛЬНОЙ системе координат группы (`unionBox` по
 *    боксам, которые пришли аргументом, — они уже локальные; `unionBox`
 *    считает по УГЛАМ, значит собственные повороты детей учтены);
 * 3. новый бокс группы получает размер этого охвата, а положение выбирается
 *    так, чтобы видимый центр нового охвата совпал с тем, где он виден
 *    СЕЙЧАС — тем же поворотом вокруг центра СТАРОГО бокса, каким живёт вся
 *    остальная геометрия группы;
 * 4. локальные координаты детей пересчитываются ОТ НОВОГО бокса группы
 *    через `childBoxInGroup`, но от сценных боксов из пункта 1 — то есть
 *    дети ставятся туда, где были видны, каким бы ни вышел новый бокс.
 *
 * Зовётся на ЗАВЕРШЕНИИ жеста (`StageView.endGesture`), а не на каждом
 * кадре: живой пересчёт на каждый `pointermove` менял бы систему координат
 * жеста под ним самим, пока жест держит стартовые боксы в старой системе.
 * Видимая цена — бледная рамка группы догоняет содержимое на отпускании,
 * а не тянется за ним следом (план С36 §8, названо там же вслух).
 *
 * `undefined`, если пересчитывать нечего: детей нет, либо охват уже плотно
 * совпадает с боксом группы (с точностью до 0.5 единицы сцены — жест почти
 * никогда не даёт точный ноль из-за округления `PRECISION`, а вызывающий
 * обязан отличать «нечего писать» от «пишем то же самое», чтобы не заводить
 * пустой шаг истории на каждое перетаскивание).
 */
export function reflowGroup(
  groupState: Box,
  children: readonly GroupChildBox[],
): { readonly group: Box; readonly children: readonly GroupChildBox[] } | undefined {
  if (children.length === 0) return undefined;

  // Пункт 1: истина, которую обязано сохранить всё остальное.
  const sceneBoxes = children.map((child) => ({
    id: child.id,
    box: childBoxInScene(groupState, child.box),
  }));

  // Пункт 2: охват в ЛОКАЛЬНОЙ системе — на боксах, которые пришли
  // аргументом, они уже локальные.
  const local = unionBox(children.map((child) => child.box))!; // children непусто ⇒ не undefined

  const tight =
    Math.abs(local.x) < 0.5 &&
    Math.abs(local.y) < 0.5 &&
    Math.abs(local.width - groupState.width) < 0.5 &&
    Math.abs(local.height - groupState.height) < 0.5;
  if (tight) return undefined;

  // Пункт 3: центр нового охвата в НЕВРАЩЁННОЙ системе группы, затем —
  // тем же поворотом, что несёт содержимое, — на экран.
  const centerBeforeRotation = {
    x: groupState.x + local.x + local.width / 2,
    y: groupState.y + local.y + local.height / 2,
  };
  const center = rotate(centerBeforeRotation, centerOf(groupState), groupState.rotation);
  const group: Box = {
    x: center.x - local.width / 2,
    y: center.y - local.height / 2,
    width: local.width,
    height: local.height,
    rotation: groupState.rotation,
  };

  // Пункт 4: дети пересчитываются от НОВОГО бокса группы, но от сценных
  // боксов пункта 1 — там, где они были видны.
  const newChildren = sceneBoxes.map(({ id, box }) => ({ id, box: childBoxInGroup(group, box) }));

  return { group, children: newChildren };
}

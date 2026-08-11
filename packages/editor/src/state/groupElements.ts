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

import { type Box, rotate, unionBox } from '../stage/geometry.js';
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
      states[id] = { ...state, x: state.x - box.x, y: state.y - box.y };
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

    const groupCenter = {
      x: groupState.x + groupState.width / 2,
      y: groupState.y + groupState.height / 2,
    };

    for (const { id, state } of presentOn(slide, childIds)) {
      // Центр ребёнка в координатах сцены ДО учёта поворота группы: угол
      // охвата плюс локальный центр. Поворот группы применяется к этой
      // точке, а не к левому верхнему углу, — поворот двигает центр по
      // окружности, а не смещает бокс параллельно.
      const sceneCenter = {
        x: groupState.x + state.x + state.width / 2,
        y: groupState.y + state.y + state.height / 2,
      };
      const rotatedCenter = rotate(sceneCenter, groupCenter, groupState.rotation);

      states[id] = {
        ...state,
        x: rotatedCenter.x - state.width / 2,
        y: rotatedCenter.y - state.height / 2,
        // Повороты складываются: то, что зритель видел под углом группы
        // плюс собственный наклон ребёнка, обязано остаться тем же углом
        // и после того, как группы не станет.
        rotation: groupState.rotation + state.rotation,
      };
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

/**
 * Копия элементов на слайде (Ctrl+D) — сбор исходников из САМОГО сегмента.
 *
 * Раскладка копий здесь не живёт: она общая с вставкой из буфера и вынесена
 * в `placeElements.ts`. Этому модулю принадлежит ровно один вопрос — какие
 * элементы копировать и что считать испорченными данными.
 *
 * Чистый модуль — ни React, ни DOM, ни `project.segments`: проверяется
 * в node без jsdom и без проекта целиком.
 */
import type { ElementState, Segment } from '@player/core';

import { collectWithDescendants, DUPLICATE_OFFSET, placeCopies, type Placed, type Source } from './placeElements.js';

export type { Placed as Duplicated };

/**
 * Копии элементов `ids` на слайде, состояния которого переданы в `states`.
 *
 * **Группа среди `ids` тянет за собой ВСЕХ своих потомков** — рекурсивно,
 * тем же обходом, что и Ctrl+C (`collectWithDescendants` в
 * `placeElements.ts`). Без этого Ctrl+D на группе давал бы пустую коробку:
 * у группы своего вида нет, значит на экране не появилось бы ничего.
 *
 * **Элемент без состояния на этом слайде пропускается, и это не глушение
 * ошибки.** Отсутствие в `states` означает буквально «элемента здесь нет»
 * (`schema.ts`, комментарий у `ElementStateSchema`: отсутствие и
 * `visible: false` — два РАЗНЫХ перехода). Выделить такой элемент автор
 * может: `ElementList` показывает ВСЕ элементы сегмента с пометкой, лежит
 * ли элемент на текущем слайде, и выделяются оттуда любые. Копировать
 * нечего — копии не будет.
 *
 * Элемент, которого нет в сегменте вовсе, — другое дело: это уже испорченное
 * состояние, и оно обязано упасть громко и здесь, а не всплыть позже
 * непроходящей проверкой схемы при следующей загрузке. Проверка — только
 * для элементов, перечисленных ЯВНО: потомки поддерева найдены обходом
 * `segment.elements` и существуют по построению.
 *
 * **`parentId` копия НАСЛЕДУЕТ как есть** — не только у элемента без
 * родителя в пачке, но и у того, чей родитель В ПАЧКЕ: копия остаётся
 * в том же сегменте, значит если группу не задели, она никуда не делась,
 * а если группу скопировали вместе с содержимым, `placeCopies` сам
 * перевесит ссылку на её копию — копия ребёнка обязана следовать за копией
 * группы, а не за оригиналом, иначе сдвиг группы не сдвинул бы её
 * вставленных детей. У вставки из буфера при нескопированном родителе
 * иначе (`elementClipboard.ts`), и разница там объяснена.
 */
export function duplicateElements(
  segment: Segment,
  ids: readonly string[],
  states: Readonly<Record<string, ElementState>>,
  stage: { width: number; height: number },
): Placed {
  for (const id of ids) {
    if (!segment.elements.some((element) => element.id === id)) {
      throw new Error(`Нельзя скопировать элемент «${id}»: его нет в сегменте`);
    }
  }

  const sources: Source[] = collectWithDescendants(segment, ids)
    .map((id) => {
      const element = segment.elements.find((candidate) => candidate.id === id)!;
      return { element, state: states[id] };
    })
    .filter((source): source is Source => source.state !== undefined);

  // Слайд-источник и слайд-получатель у Ctrl+D — один и тот же, поэтому
  // сюда уходят те же `states`, а сдвиг обязателен: без него копия легла бы
  // ровно на оригинал.
  return placeCopies(segment, sources, states, stage, DUPLICATE_OFFSET);
}

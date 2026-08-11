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

import { DUPLICATE_OFFSET, placeCopies, type Placed, type Source } from './placeElements.js';

export type { Placed as Duplicated };

/**
 * Копии элементов `ids` на слайде, состояния которого переданы в `states`.
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
 * непроходящей проверкой схемы при следующей загрузке.
 *
 * `parentId` копия НАСЛЕДУЕТ: копия остаётся в том же сегменте, значит
 * группа, на которую он указывает, никуда не делась. У вставки из буфера
 * это не так (`elementClipboard.ts`), и разница там объяснена.
 */
export function duplicateElements(
  segment: Segment,
  ids: readonly string[],
  states: Readonly<Record<string, ElementState>>,
  stage: { width: number; height: number },
): Placed {
  const sources: Source[] = ids
    .map((id) => {
      const element = segment.elements.find((candidate) => candidate.id === id);
      if (element === undefined) {
        throw new Error(`Нельзя скопировать элемент «${id}»: его нет в сегменте`);
      }
      return { element, state: states[id] };
    })
    .filter((source): source is Source => source.state !== undefined);

  // Слайд-источник и слайд-получатель у Ctrl+D — один и тот же, поэтому
  // сюда уходят те же `states`, а сдвиг обязателен: без него копия легла бы
  // ровно на оригинал.
  return placeCopies(segment, sources, states, stage, DUPLICATE_OFFSET);
}

/**
 * Копия элементов на слайде — третья механика переиспользования рядом
 * с копией куска (`duplicate.ts`) и вставкой слайда из буфера (`slides.ts`).
 *
 * **Отдельным модулем, а не в `elements.ts`, и это вынужденно.** Имя копии
 * считает `prefixOf` из `duplicate.ts` («circle-3» → «circle»), а сам
 * `duplicate.ts` берёт `freeId` из `elements.ts`. Положив копию элементов
 * в `elements.ts`, мы замкнули бы импорты в кольцо ради одной функции.
 *
 * Своего разбора id здесь нет намеренно: `prefixOf` уже экспортирован
 * именно для переиспользования, и третий регэксп для тех же имён разъехался
 * бы с первыми двумя.
 *
 * Чистый модуль — ни React, ни DOM, ни `project.segments`: проверяется
 * в node без jsdom и без проекта целиком.
 */
import type { Element, ElementState, Segment } from '@player/core';

import { prefixOf } from './duplicate.js';
import { freeId, withinStage } from './elements.js';

/**
 * Сдвиг копии от оригинала, в единицах сцены (1920×1080).
 *
 * Не косметика. Копия, легшая ровно на оригинал, неотличима от «Ctrl+D
 * не сработал»: автор видит один объект там, где их два, и следующим
 * нажатием делает третий, потом четвёртый — стопкой, о которой не знает.
 *
 * Величина считается от того, что сцена показана В РЕДАКТОРЕ УМЕНЬШЕННОЙ,
 * поэтому сдвиг обязан пережить это уменьшение.
 *
 * ИЗМЕРЕНО в живом Chromium (окно 1920×1080, фикстура morph): масштаб сцены
 * 0.378, сдвиг 40 единиц даёт 15 px на экране — копия видна как отдельный
 * объект и берётся мышью отдельно от оригинала.
 *
 * ОГОВОРКА, найденная тем же замером. Доля НЕ накрытого копией оригинала —
 * это `сдвиг / ширина`, и она от масштаба не зависит вовсе: у элемента
 * шириной 320 копия накрывает 87 %. На узком окне (стенд Playwright по
 * умолчанию) те же 40 единиц дают уже 5 px, и два объекта сливаются в один
 * сдвинутый. То есть у сдвига есть нижняя граница ширины окна, за которой
 * он перестаёт читаться, — и закрывается она масштабом холста, которого
 * пока нет, а не увеличением этого числа.
 */
const DUPLICATE_OFFSET = 40;

/** Что получилось: новые элементы сегмента и их состояния на слайде. */
export interface Duplicated {
  readonly elements: readonly Element[];
  readonly states: Readonly<Record<string, ElementState>>;
}

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
 */
export function duplicateElements(
  segment: Segment,
  ids: readonly string[],
  states: Readonly<Record<string, ElementState>>,
  stage: { width: number; height: number },
): Duplicated {
  // Занятые имена копятся ПО ХОДУ раздачи. Иначе две копии за один жест
  // получили бы одно имя: `freeId` не знает о том, что выдал секунду назад,
  // а редьюсер бросит на второй такой же id — то есть Ctrl+D по двум
  // выделенным объектам падал бы, а по одному работал.
  const taken: { id: string }[] = segment.elements.map((element) => ({ id: element.id }));

  const sources = ids
    .map((id) => {
      const element = segment.elements.find((candidate) => candidate.id === id);
      if (element === undefined) {
        throw new Error(`Нельзя скопировать элемент «${id}»: его нет в сегменте`);
      }
      return { element, state: states[id] };
    })
    // Порядок раздачи — по слою, а не по порядку выделения. Копии трёх
    // наложенных фигур обязаны лечь друг на друга в том же порядке, в каком
    // лежат оригиналы; порядок выделения к этому отношения не имеет и у
    // рамочного выделения вообще произволен.
    .filter(
      (source): source is { element: Element; state: ElementState } => source.state !== undefined,
    )
    .sort((left, right) => left.state.zIndex - right.state.zIndex);

  // Вся пачка кладётся ПОВЕРХ всего, что есть на слайде, сохраняя между
  // собой относительный порядок. Так же поступает вставка из каталога
  // (`nextZIndex` в `elements.ts`): только что созданное автор ожидает
  // увидеть сверху, а не найденным под чужой картинкой.
  const zIndexes = Object.values(states).map((state) => state.zIndex);
  const topZIndex = zIndexes.length === 0 ? -1 : Math.max(...zIndexes);

  const elements: Element[] = [];
  const made: Record<string, ElementState> = {};

  sources.forEach((source, index) => {
    const id = freeId(prefixOf(source.element.id), taken);
    taken.push({ id });

    elements.push({ ...source.element, id });

    made[id] = {
      ...source.state,
      x: withinStage(source.state.x + DUPLICATE_OFFSET, source.state.width, stage.width),
      y: withinStage(source.state.y + DUPLICATE_OFFSET, source.state.height, stage.height),
      zIndex: topZIndex + 1 + index,
      // Стиль копируется СВОИМ объектом, а не ссылкой. Общая ссылка сделала
      // бы копию и оригинал одним цветом навсегда: правка одного молча
      // меняла бы второй, причём в модели это выглядело бы правильным.
      style: { ...source.state.style },
    };
  });

  return { elements, states: made };
}

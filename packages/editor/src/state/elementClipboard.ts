/**
 * Буфер обмена ЭЛЕМЕНТОВ (Ctrl+C / Ctrl+X / Ctrl+V).
 *
 * Рядом уже есть буфер СЛАЙДОВ (`slides.ts`, ADR-025). Устройство у них
 * одно — снимок, лежащий в состоянии вида, — а правило вставки РАЗНОЕ,
 * и это главное, что надо понять про этот модуль.
 *
 * **Вставка элемента ВСЕГДА заводит новый элемент.** Таблица ADR-025
 * переиспользует чужой id, если совпали `type` и `content`. Для слайда это
 * осмысленно: слайд — снимок, он ССЫЛАЕТСЯ на элементы части, и «тот же
 * заголовок» действительно тот же. Для элемента переиспользование означало
 * бы, что вставка поверх такого же объекта не добавляет второй, а молча
 * двигает первый: автор нажал «Вставить» и не увидел ничего нового, зато
 * потерял позицию того, что уже стояло. Поэтому имя копии берётся так же,
 * как у Ctrl+D, — от префикса через `freeId`.
 *
 * Показать существующий элемент на новом слайде — отдельная операция
 * (`putOnSlide` в `slides.ts`), и смешивать её со вставкой нельзя.
 *
 * **Копия группы несёт своих детей.** `copyElementsToClipboard` дополняет
 * `ids` поддеревом: элемент `'group'` в списке тянет за собой всех потомков
 * (рекурсивно). Без этого автор скопировал бы группу и получил пустую
 * коробку — у группы своего вида нет, значит на экране не появилось бы
 * ничего, и ни ошибки, ни предупреждения при этом бы не было.
 *
 * **`parentId` при вставке ПЕРЕВЕШИВАЕТСЯ, а не всегда сбрасывается.**
 * `SegmentSchema` требует, чтобы он указывал на элемент типа `group` ТОГО ЖЕ
 * сегмента. Если родитель ребёнка тоже лежит в буфере (группу скопировали
 * вместе с содержимым), копия ребёнка получает НОВЫЙ id копии-родителя —
 * вложенность сохраняется. Если родителя в буфере нет (скопировали ребёнка
 * без его группы), `parentId` стирается и элемент становится верхнего
 * уровня: иначе копия ссылалась бы на группу, которой в целевом сегменте
 * может не оказаться вовсе, и разбор схемы упал бы при следующей загрузке
 * — причём в редакторе всё это время выглядело бы исправным.
 *
 * **Буфер — снимок, а не ссылка на проект.** Состояние копируется вглубь
 * (включая `style`), иначе правка оригинала после Ctrl+C меняла бы то,
 * что лежит в буфере, и автор вставил бы не то, что копировал.
 *
 * Чистый модуль — ни React, ни DOM, ни `project.segments`.
 */
import type { ElementState, Segment } from '@player/core';

import { collectWithDescendants, DUPLICATE_OFFSET, placeCopies, type Placed, type Source } from './placeElements.js';

export interface ElementClipboard {
  /** Только для подписи автору («из части N»). В логике НЕ участвует. */
  readonly sourceSegmentId: string;
  /**
   * Слайд, с которого копировали. В логике участвует, и ровно в одном
   * месте: он решает, нужен ли сдвиг при вставке (см. `pasteElements`).
   */
  readonly sourceSlideId: string;
  /** Снимок: сами элементы и их состояния. Ровно те, что копировали. */
  readonly items: readonly Source[];
}

/** Отвязанная копия состояния: `style` своим объектом, а не ссылкой. */
function snapshot(state: ElementState): ElementState {
  return { ...state, style: { ...state.style } };
}

/**
 * Снимает элементы `ids` в буфер — вместе с поддеревом: элемент `'group'`
 * среди `ids` тянет за собой ВСЕХ потомков, рекурсивно (`collectWithDescendants`
 * в `placeElements.ts`, общая с Ctrl+D по той же причине, что и `placeCopies`).
 *
 * Пропуск и падение — по тем же двум правилам, что у Ctrl+D
 * (`duplicateElements.ts`): элемент без состояния на слайде пропускается
 * (его здесь просто нет), элемент, которого нет в сегменте вовсе, роняет
 * громко (это испорченные данные). Проверка на существование — только для
 * элементов, перечисленных ЯВНО: потомки, добавленные поддеревом, найдены
 * обходом `segment.elements` и существуют по построению.
 *
 * Пустой список на входе даёт пустой буфер, а не бросок: «скопировать
 * ничего» — не ошибка, а отсутствие операции, и решать, показывать ли
 * кнопку, — забота интерфейса.
 */
export function copyElementsToClipboard(
  segment: Segment,
  slideId: string,
  ids: readonly string[],
  states: Readonly<Record<string, ElementState>>,
): ElementClipboard {
  for (const id of ids) {
    if (!segment.elements.some((element) => element.id === id)) {
      throw new Error(`Нельзя скопировать элемент «${id}»: его нет в сегменте «${segment.id}»`);
    }
  }

  const items: Source[] = collectWithDescendants(segment, ids)
    .map((id) => {
      const element = segment.elements.find((candidate) => candidate.id === id)!;
      return { element, state: states[id] };
    })
    .filter((item): item is Source => item.state !== undefined)
    .map((item) => ({ element: { ...item.element }, state: snapshot(item.state) }));

  return { sourceSegmentId: segment.id, sourceSlideId: slideId, items };
}

/**
 * Вставляет содержимое буфера на слайд `slideId` сегмента `segment`.
 *
 * **Сдвиг — только на своём же слайде.** Правило собрано из двух очевидных
 * половин, и обе про то, что увидит автор:
 *
 *   вставка в ДРУГУЮ часть или на другой слайд — на то же место. Ради этого
 *   всё и затевалось: заголовок, перенесённый из части в часть, обязан
 *   оказаться там же, где был, а не «примерно там»;
 *
 *   вставка в ТОТ ЖЕ слайд — со сдвигом. Иначе копия ложится ровно на
 *   оригинал и неотличима от «Ctrl+V не сработал» — та самая физика,
 *   которой куплено число `DUPLICATE_OFFSET`.
 *
 * Сравниваются ОБА идентификатора, сегмента и слайда. Только слайда было бы
 * недостаточно, и ошибка вышла бы тихой: `freeId('slide', ...)` раздаёт имена
 * внутри своего сегмента, поэтому `slide-1` есть в каждой части, и вставка
 * из первой части во вторую сдвигала бы копию без всякой причины.
 */
export function pasteElements(
  segment: Segment,
  slideId: string,
  clipboard: ElementClipboard,
  targetStates: Readonly<Record<string, ElementState>>,
  stage: { width: number; height: number },
): Placed {
  const ontoItself = clipboard.sourceSegmentId === segment.id && clipboard.sourceSlideId === slideId;

  // Родитель, который сам лежит в буфере, может остаться родителем — его
  // копия тоже вставляется, и `placeCopies` перевесит на неё ссылку. Родитель
  // СНАРУЖИ буфера (скопировали ребёнка без группы) стирается здесь же,
  // ДО `placeCopies`: держаться было бы не за что, группа в целевом
  // сегменте может не существовать вовсе.
  //
  // `delete`, а не `parentId: undefined`: ключ со значением `undefined`
  // пережил бы спред и попал бы в `JSON.stringify` по-разному в зависимости
  // от места — лучше, чтобы его не было вовсе.
  const copiedIds = new Set(clipboard.items.map((item) => item.element.id));
  const sources: Source[] = clipboard.items.map((item) => {
    const element = { ...item.element };
    if (element.parentId !== undefined && !copiedIds.has(element.parentId)) {
      delete element.parentId;
    }
    return { element, state: snapshot(item.state) };
  });

  return placeCopies(segment, sources, targetStates, stage, ontoItself ? DUPLICATE_OFFSET : 0);
}

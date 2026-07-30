/**
 * Создание и удаление элементов сцены — чистая логика, без React и DOM.
 *
 * Живёт отдельно от `state/project.ts`, потому что фабрики элементов растут
 * (каскад удаления) и не должны раздувать редьюсер: редьюсер лишь применяет
 * готовый `Element`, а как он собран — забота этого модуля. Что именно
 * получается в результате — размеры, стиль, содержимое — данные из
 * `state/library.ts`, а не литералы здесь (см. `LibraryItem`).
 */
import type { Cue, Element, Scene } from '@player/core';

import type { ElementType, LibraryItem } from './library.js';

export type { ElementType };

/**
 * Свободный идентификатор вида «gate-3».
 *
 * Не случайный: одинаковый проект и одинаковые действия обязаны давать
 * одинаковый файл, иначе сравнить два сохранения глазами невозможно.
 */
export function freeId(prefix: string, taken: readonly { id: string }[]): string {
  const used = new Set(taken.map((item) => item.id));
  for (let index = 1; ; index += 1) {
    const candidate = `${prefix}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function nextZIndex(elements: readonly Element[]): number {
  // Пустая сцена — новый элемент первый, ставим в 0, а не в 1: у элементов
  // по умолчанию (см. ElementSchema) zIndex тоже 0, и первый созданный
  // элемент не обязан начинать отсчёт с единицы.
  if (elements.length === 0) return 0;
  return Math.max(...elements.map((element) => element.zIndex)) + 1;
}

/**
 * Каскад новых элементов: шаг в сторону от центра и через сколько шагов
 * начинать заново.
 *
 * Без каскада КАЖДЫЙ новый элемент ложился ровно в центр сцены и полностью
 * накрывал предыдущий: автор нажимал «Фигура» после «Текст» и текста больше
 * не видел. Проверено в браузере вставкой девяти заготовок подряд — все девять
 * легли в одну точку, и на холсте читался только верхний.
 *
 * Смещение детерминированное (от числа уже лежащих элементов), а не случайное:
 * одинаковый проект и одинаковые действия обязаны давать одинаковый файл —
 * то же требование, что у `freeId` выше.
 */
const CASCADE_STEP = 56;
const CASCADE_WRAP = 6;

/** Держит элемент в пределах сцены: за краем его не выделить мышью. */
function withinStage(value: number, size: number, limit: number): number {
  return Math.max(0, Math.min(value, limit - size));
}

/**
 * Создаёт новый элемент из заготовки библиотеки (`state/library.ts`) — размер,
 * стиль и содержимое целиком берутся из `item`, эта функция только кладёт
 * заготовку на сцену: считает место, свободный id и слой.
 *
 * Первый элемент встаёт по центру сцены, каждый следующий — со сдвигом
 * (см. `CASCADE_STEP`), чтобы не спрятать предыдущий под собой.
 *
 * `id` берётся из `item.id`, а не из `item.type`: у круга получается id
 * `circle-1`, а не `shape-4` — так автор видит в списке элементов, что
 * именно он создал, а не только базовый тип схемы.
 */
export function createElement(
  item: LibraryItem,
  scene: Scene,
  stage: { width: number; height: number },
): Element {
  const shift = (scene.elements.length % CASCADE_WRAP) * CASCADE_STEP;
  return {
    id: freeId(item.id, scene.elements),
    type: item.type,
    x: withinStage(stage.width / 2 - item.width / 2 + shift, item.width, stage.width),
    y: withinStage(stage.height / 2 - item.height / 2 + shift, item.height, stage.height),
    width: item.width,
    height: item.height,
    rotation: 0,
    zIndex: nextZIndex(scene.elements),
    style: { ...item.style },
    content: item.content,
  };
}

/**
 * Удаляет элемент и каскадом — все cues, у которых `targetId === id`.
 *
 * Каскад обязателен: `ProjectSchema.superRefine` требует, чтобы
 * `cue.targetId` указывал на существующий элемент, иначе проект не грузится
 * вовсе (см. схему). Список удалённых cues возвращается, чтобы вызывающий
 * мог сообщить автору, сколько анимаций пропало вместе с элементом.
 *
 * `gates` не трогает и не пересоздаёт — у `Gate` нет ссылок на элементы
 * (см. ADR-011: совпадение `option.id` с id элемента не делает Gate от него
 * зависимым, это связь по значению, а не структурная ссылка). Массив
 * остаётся тем же объектом по ссылке — на этом основано решение StageView,
 * пересобирать сцену или нет.
 */
export function removeElement(
  scene: Scene,
  id: string,
): { scene: Scene; removedCues: readonly Cue[] } {
  const index = scene.elements.findIndex((element) => element.id === id);
  if (index < 0) {
    throw new Error(`Нельзя удалить элемент «${id}»: его нет в сцене`);
  }

  const elements = scene.elements.slice(0, index).concat(scene.elements.slice(index + 1));

  const removedCues = scene.cues.filter((cue) => cue.targetId === id);
  // Ссылочная целостность: если каскад никого не задел, отдаём тот же
  // массив cues, а не его копию, — иначе StageView решит, что анимации
  // изменились, и пересоберёт сцену без причины.
  const cues = removedCues.length === 0 ? scene.cues : scene.cues.filter((cue) => cue.targetId !== id);

  return {
    scene: { elements, cues, gates: scene.gates },
    removedCues,
  };
}

/**
 * Создание и удаление элементов сегмента — чистая логика, без React и DOM.
 *
 * Схема v3 разводит элемент и его состояние на слайде (см. `schema.ts`,
 * комментарий у `ElementSchema`/`ElementStateSchema`): элемент — это КТО
 * (`id`/`type`/`content`), состояние — ГДЕ и КАК (геометрия, стиль,
 * видимость, слой). Раньше `Element` нёс геометрию сам, и фабрика отдавала
 * один объект; теперь она обязана отдать пару — элемент для
 * `segment.elements` и его начальное состояние для слайда, на который автор
 * его кладёт. Что именно получается в результате — размеры, стиль,
 * содержимое — данные из `state/library.ts`, а не литералы здесь.
 */
import type { Element, ElementState, Segment } from '@player/core';

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

function nextZIndex(states: Readonly<Record<string, ElementState>>): number {
  const values = Object.values(states);
  // Пустой слайд — новый элемент первый, ставим в 0, а не в 1: у состояния
  // по умолчанию (см. ElementStateSchema) zIndex тоже 0.
  if (values.length === 0) return 0;
  return Math.max(...values.map((state) => state.zIndex)) + 1;
}

/**
 * Каскад новых элементов: шаг в сторону от центра и через сколько шагов
 * начинать заново.
 *
 * Без каскада КАЖДЫЙ новый элемент ложился ровно в центр сцены и полностью
 * накрывал предыдущий — проверено в браузере вставкой девяти заготовок
 * подряд, все девять легли в одну точку. Смещение считается от числа
 * элементов, уже видимых на ТЕКУЩЕМ слайде (а не от всех элементов
 * сегмента): именно с этим слайдом автор сейчас смотрит на сцену, и именно
 * на нём новый элемент не должен спрятать то, что уже видно.
 */
const CASCADE_STEP = 56;
const CASCADE_WRAP = 6;

/** Держит элемент в пределах сцены: за краем его не выделить мышью.
 *
 *  Экспортирована ради копии элементов (`duplicateElements.ts`): причина
 *  «за краем не выделить мышью» относится к копии ровно так же, как
 *  к новому элементу, а два одинаковых правила в двух местах разъезжаются. */
export function withinStage(value: number, size: number, limit: number): number {
  return Math.max(0, Math.min(value, limit - size));
}

/**
 * Создаёт новый элемент из заготовки библиотеки (`state/library.ts`) вместе
 * с его начальным состоянием на текущем слайде.
 *
 * `id` берётся из `item.id`, а не из `item.type`: у круга получается id
 * `circle-1`, а не `shape-4` — так автор видит в списке элементов, что
 * именно он создал, а не только базовый тип схемы. Уникальность id — среди
 * ВСЕХ элементов сегмента (`segment.elements`), а не только видимых на
 * текущем слайде: элементы живут на уровне сегмента, id обязан быть
 * свободен везде.
 */
export function createElement(
  item: LibraryItem,
  segment: Segment,
  currentStates: Readonly<Record<string, ElementState>>,
  stage: { width: number; height: number },
): { element: Element; state: ElementState } {
  const shift = (Object.keys(currentStates).length % CASCADE_WRAP) * CASCADE_STEP;
  const element: Element = {
    id: freeId(item.id, segment.elements),
    type: item.type,
    content: item.content,
    // v11: элемент из каталога кладётся верхним уровнем и незапертым.
    locked: false,
  };
  const state: ElementState = {
    x: withinStage(stage.width / 2 - item.width / 2 + shift, item.width, stage.width),
    y: withinStage(stage.height / 2 - item.height / 2 + shift, item.height, stage.height),
    width: item.width,
    height: item.height,
    rotation: 0,
    zIndex: nextZIndex(currentStates),
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    style: { ...item.style },
  };
  return { element, state };
}

/**
 * Удаляет элемент из сегмента и каскадом — его состояние из ВСЕХ слайдов.
 *
 * Каскад обязателен: `ProjectSchema.superRefine` требует, чтобы ключи
 * `slide.states` указывали на существующий элемент сегмента, иначе проект
 * не грузится вовсе (см. схему). Кью в v3 нет — раньше каскад снимал ещё
 * и их, теперь снимать больше нечего кроме состояний.
 *
 * Слайды, которые состояние элемента не несли, остаются ТЕМИ ЖЕ объектами
 * по ссылке — на этом основано решение StageView, пересобирать сцену
 * или обновить один элемент.
 */
export function removeElement(segment: Segment, id: string): Segment {
  const index = segment.elements.findIndex((element) => element.id === id);
  if (index < 0) {
    throw new Error(`Нельзя удалить элемент «${id}»: его нет в сегменте`);
  }

  const elements = segment.elements.slice(0, index).concat(segment.elements.slice(index + 1));

  const slides = segment.slides.map((slide) => {
    if (!(id in slide.states)) return slide;
    const states = { ...slide.states };
    delete states[id];
    return { ...slide, states };
  });

  /*
   * ССЫЛКИ ОТВЕТОВ НА ЭТУ ФИГУРУ СНИМАЮТСЯ ЗДЕСЬ (ADR-035).
   *
   * С версии схемы 15 связь «ответ — элемент сцены» это настоящее поле,
   * и ссылка на несуществующий элемент — ошибка разбора. Значит удаление
   * фигуры, оставившее ссылку, сделало бы проект незагружаемым: автор
   * нажал Delete, а узнал бы об этом при сохранении или у зрителя.
   *
   * Вариант при этом не исчезает и не портится — он возвращается
   * к системной кнопке, ровно как до привязки. Это законное состояние,
   * а не полуслом: вопрос остаётся заданным, ответ остаётся ответом,
   * меняется только то, чем по нему щёлкают.
   */
  const bound = segment.gates.some((gate) =>
    gate.config.kind === 'choice'
    && (gate.config.promptElementId === id
      || gate.config.options.some((option) => option.elementId === id)));

  /*
   * Массив гейтов остаётся ТЕМ ЖЕ ПО ССЫЛКЕ, если на фигуру никто
   * не ссылался. Это не микрооптимизация: тождество здесь уже охраняется
   * тестом, и через него держится дешёвое сравнение в React. Пересобирать
   * список на каждое удаление значило бы перерисовывать дорожку всякий раз,
   * когда автор убрал ничем не связанную фигуру.
   */
  const gates = bound
    ? segment.gates.map((gate) => {
      if (gate.config.kind !== 'choice') return gate;
      const config = gate.config;
      const touchesPrompt = config.promptElementId === id;
      const touchesOption = config.options.some((option) => option.elementId === id);
      if (!touchesPrompt && !touchesOption) return gate;

      const options = config.options.map((option) => {
        if (option.elementId !== id) return option;
        const { elementId: _dropped, ...rest } = option;
        return rest;
      });
      // Удалили фигуру, показывавшую сам вопрос: вопрос остаётся в данных
      // остановки и снова показывается служебной плашкой. Текст не теряется.
      const { promptElementId: _droppedPrompt, ...restConfig } = config;
      return {
        ...gate,
        config: touchesPrompt ? { ...restConfig, options } : { ...config, options },
      };
    })
    : segment.gates;

  return { ...segment, elements, slides, gates };
}

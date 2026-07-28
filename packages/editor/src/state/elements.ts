/**
 * Создание и удаление элементов сцены — чистая логика, без React и DOM.
 *
 * Живёт отдельно от `state/project.ts`, потому что фабрики элементов растут
 * (стиль по умолчанию, каскад удаления) и не должны раздувать редьюсер:
 * редьюсер лишь применяет готовый `Element`, а как он собран — забота этого
 * модуля.
 */
import type { Cue, Element, Scene } from '@player/core';

export type ElementType = 'text' | 'shape' | 'image';

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Размеры новых элементов по умолчанию.
 *
 * Подобраны так, чтобы на сцене 1920×1080 (стандартный `stageWidth/Height`
 * фикстур) элемент был заметен, но не перекрывал всю сцену — автор всё равно
 * подгонит размер перетаскиванием сразу после создания.
 */
const DEFAULT_SIZE: Record<ElementType, Size> = {
  text: { width: 600, height: 120 },
  shape: { width: 300, height: 300 },
  image: { width: 480, height: 320 },
};

/**
 * Стиль по умолчанию — значения взяты из `fixtures/projects/demo.json`
 * (элементы `lead` и `card`), чтобы созданный элемент выглядел как соседи,
 * а не как чужеродная вставка со стандартными браузерными значениями.
 */
const DEFAULT_STYLE: Record<ElementType, Record<string, string | number>> = {
  text: {
    'font-family': 'system-ui, sans-serif',
    'font-size': '36px',
    color: '#9fb0c4',
    'line-height': '1.5',
  },
  shape: {
    background: '#1b2430',
    'border-radius': '28px',
  },
  // Пусто и намеренно: image ждёт файла (перетаскивание на холст), стиль
  // ему пока задавать нечем.
  image: {},
};

/** Заглушка текста — автор перепишет её двойным кликом сразу после создания. */
const TEXT_PLACEHOLDER = 'Новый текст';

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
 * Создаёт новый элемент по центру сцены, с zIndex выше всех существующих
 * и стилем, похожим на соседей по проекту.
 */
export function createElement(
  type: ElementType,
  scene: Scene,
  stage: { width: number; height: number },
): Element {
  const size = DEFAULT_SIZE[type];
  return {
    id: freeId(type, scene.elements),
    type,
    x: stage.width / 2 - size.width / 2,
    y: stage.height / 2 - size.height / 2,
    width: size.width,
    height: size.height,
    rotation: 0,
    zIndex: nextZIndex(scene.elements),
    style: { ...DEFAULT_STYLE[type] },
    content: type === 'text' ? TEXT_PLACEHOLDER : '',
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

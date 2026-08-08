/**
 * Строки списка элементов: порядок и короткое содержимое.
 *
 * Чистая логика, вынесенная из ElementList.tsx по ADR-010: порядок по
 * zIndex и то, как элемент описывается коротким текстом, — правило продукта,
 * а не свойство интерфейса, и обязано пережить переписку вида.
 *
 * В схеме v3 `zIndex` и `style` переехали с `Element` на `ElementState`
 * (см. `schema.ts`), поэтому строки строятся по ДВУМ источникам: элементам
 * сегмента (кто это) и состояниям ТЕКУЩЕГО слайда (где он и как выглядит).
 * Элемент, у которого на этом слайде ещё нет состояния, — законный случай
 * (см. `ElementList.tsx`: список существует именно ради него), а не пробел
 * в данных: такая строка уходит в конец списка и показывает это явно
 * полем `onSlide`, а не выдуманным нулевым zIndex.
 */
import type { Element, ElementState } from '@player/core';

export interface ElementRow {
  readonly id: string;
  readonly type: Element['type'];
  /** 0 у элементов без состояния на этом слайде — показывать её незачем, см. `onSlide`. */
  readonly zIndex: number;
  readonly summary: string;
  /** Есть ли у элемента состояние на слайде, чьи states сюда переданы. */
  readonly onSlide: boolean;
}

/** Длиннее — обрезается многоточием. Строка в списке не должна расти в ширину. */
const SUMMARY_LIMIT = 40;

/**
 * Строит строки списка.
 *
 * Порядок: сверху элементы, видимые на этом слайде, по убыванию zIndex
 * (при равенстве — по id, стабильно); элементы без состояния на этом слайде —
 * ниже всех, тоже по id. Порядок делает раскладку слоёв видимой глазами
 * вместо угадывания числа z-index (docs/superpowers/specs/…, раздел «Список
 * элементов»).
 */
export function toRows(
  elements: readonly Element[],
  states: Readonly<Record<string, ElementState>>,
): ElementRow[] {
  return elements
    .slice()
    .sort((a, b) => compareRows(a, b, states))
    .map((element) => {
      const state = states[element.id];
      return {
        id: element.id,
        type: element.type,
        zIndex: state?.zIndex ?? 0,
        summary: summarize(element, state),
        onSlide: state !== undefined,
      };
    });
}

function compareRows(
  a: Element,
  b: Element,
  states: Readonly<Record<string, ElementState>>,
): number {
  const aState = states[a.id];
  const bState = states[b.id];
  // Присутствующие на слайде всегда выше отсутствующих — вне зависимости
  // от zIndex: отсутствие state не сравнимо с числом.
  if ((aState !== undefined) !== (bState !== undefined)) {
    return aState !== undefined ? -1 : 1;
  }
  if (aState !== undefined && bState !== undefined && aState.zIndex !== bState.zIndex) {
    return bState.zIndex - aState.zIndex;
  }
  return a.id.localeCompare(b.id);
}

function summarize(element: Element, state: ElementState | undefined): string {
  switch (element.type) {
    case 'text': {
      const text = truncate(element.content);
      return text === '' ? '(пустой текст)' : text;
    }
    case 'image':
      return summarizeImage(element.content);
    case 'shape': {
      const background = state?.style['background'];
      return background === undefined ? 'фигура' : `фигура, фон ${background}`;
    }
    case 'video':
      return summarizeVideo(element.content);
    /**
     * Группа (v11) описывается собой, а не содержимым: сколько в ней детей,
     * знает сегмент, а сюда приходит один элемент со своим состоянием.
     * Тянуть сюда весь список ради числа значило бы поменять сигнатуру
     * ради подписи.
     */
    case 'group':
      return 'группа';
  }
}

/**
 * Появилось в v10. Отдельно от `summarizeImage` не ради симметрии,
 * а потому что подписи разные: у видео и картинки по-разному звучит
 * пустота, и «встроенная картинка» о видео сказать нельзя.
 *
 * Ветки `data:` здесь намеренно НЕТ. У картинки она есть, потому что
 * картинка встраивается в проект строкой; видео так встроить нельзя —
 * замер квоты `localStorage` дал 5 242 869 символов на весь проект,
 * а это меньше секунды видео в base64. Появится встроенное видео —
 * появится и ветка, но не раньше, чем появится способ его хранить.
 */
function summarizeVideo(content: string): string {
  if (content === '') return 'пусто, ждёт файла';
  return truncate(content);
}

function summarizeImage(content: string): string {
  if (content === '') return 'пусто, ждёт файла';
  // data-URI — сотни килобайт текста, показывать его в списке нельзя:
  // это ровно та служебная строка, что раздвигает сетку (Ловушка №2).
  if (content.startsWith('data:')) return 'встроенная картинка';
  return truncate(content);
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > SUMMARY_LIMIT ? `${oneLine.slice(0, SUMMARY_LIMIT - 1)}…` : oneLine;
}

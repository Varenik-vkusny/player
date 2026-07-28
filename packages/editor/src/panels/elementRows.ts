/**
 * Строки списка элементов: порядок и короткое содержимое.
 *
 * Чистая логика, вынесенная из ElementList.tsx по ADR-010: порядок по
 * zIndex и то, как элемент описывается коротким текстом, — правило продукта,
 * а не свойство интерфейса, и обязано пережить переписку вида.
 */
import type { Element } from '@player/core';

export interface ElementRow {
  readonly id: string;
  readonly type: Element['type'];
  readonly zIndex: number;
  readonly summary: string;
}

/** Длиннее — обрезается многоточием. Строка в списке не должна расти в ширину. */
const SUMMARY_LIMIT = 40;

/**
 * Строит строки списка, сверху — элементы с наибольшим zIndex.
 *
 * Порядок делает раскладку слоёв видимой глазами вместо угадывания числа
 * z-index (docs/superpowers/specs/…, раздел «Список элементов»). Равный
 * zIndex разрешается по id — иначе порядок строк дрожал бы между рендерами
 * там, где `Array.prototype.sort` не гарантирует ничего сверх стабильности
 * относительно ВХОДНОГО порядка.
 */
export function toRows(elements: readonly Element[]): ElementRow[] {
  return elements
    .slice()
    .sort((a, b) => b.zIndex - a.zIndex || a.id.localeCompare(b.id))
    .map((element) => ({
      id: element.id,
      type: element.type,
      zIndex: element.zIndex,
      summary: summarize(element),
    }));
}

function summarize(element: Element): string {
  switch (element.type) {
    case 'text': {
      const text = truncate(element.content);
      return text === '' ? '(пустой текст)' : text;
    }
    case 'image':
      return summarizeImage(element.content);
    case 'shape': {
      const background = element.style['background'];
      return background === undefined ? 'фигура' : `фигура, фон ${background}`;
    }
    case 'group':
      return 'группа';
  }
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

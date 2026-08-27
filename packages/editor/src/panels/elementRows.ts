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

import { nameColorValue } from '../theme.js';

export interface ElementRow {
  readonly id: string;
  readonly type: Element['type'];
  /** 0 у элементов без состояния на этом слайде — показывать её незачем, см. `onSlide`. */
  readonly zIndex: number;
  /** Короткая подпись ДЛЯ ПОКАЗА: обрезана, чтобы строка не росла в ширину. */
  readonly summary: string;
  /**
   * То же описание БЕЗ обрезки — чтобы его можно было прочитать целиком
   * (Сессия 46, Задача 3).
   *
   * Разведено с `summary` не для симметрии. Потолок в 40 знаков existsовал
   * ради РАСКЛАДКИ: длинная строка раздвигает колонку. У подсказки раскладки
   * нет, и обрезать её тем же потолком значило бы чинить обрезку обрезкой:
   * замер 18.08.2026 — видно ~18 знаков, `summary` даёт 40, а тексту demo
   * нужно 58. То есть один `summary` в подсказке НЕ давал бы прочитать
   * подпись целиком, хотя выглядело бы, будто даёт.
   *
   * Служебные строки сюда всё равно не попадают: data-URI картинки заменён
   * на «встроенная картинка» ДО обрезки, а не ею, — иначе в подсказку уехали
   * бы сотни килобайт текста.
   */
  readonly full: string;
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
 * вместо угадывания числа z-index (docs/specs/…, раздел «Список
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
      // Описание считается ОДИН раз и обрезается только для показа: два
      // независимых пути «полное» и «короткое» разошлись бы молча, и
      // подсказка однажды стала бы рассказывать не про ту строку.
      const full = describe(element, state);
      return {
        id: element.id,
        type: element.type,
        zIndex: state?.zIndex ?? 0,
        summary: truncate(full),
        full,
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

/**
 * Полное описание элемента одной строкой, БЕЗ обрезки по длине.
 *
 * Обрезка живёт снаружи (`toRows`), а не здесь: она нужна показу и не нужна
 * подсказке, и разводить их надо в одном месте, а не в каждой ветке.
 * Служебные строки (data-URI) заменяются человеческими ЗДЕСЬ — то есть
 * до обрезки и независимо от неё.
 */
function describe(element: Element, state: ElementState | undefined): string {
  switch (element.type) {
    case 'text': {
      const text = oneLine(element.content);
      return text === '' ? '(пустой текст)' : text;
    }
    case 'image':
      return summarizeImage(element.content);
    case 'shape': {
      const background = state?.style['background'];
      if (background === undefined) return 'фигура';
      return `фигура, ${describeBackground(background)}`;
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
 * Фон фигуры — словами автора, а не языком таблицы стилей (Сессия 46).
 *
 * До починки строка собиралась как `фигура, фон ${background}`, где
 * `background` — СЫРОЕ значение стиля, и автор читал дословно
 * «фигура, фон var(--scene-surface, #1b2430» (ещё и обрезанное шириной
 * колонки, то есть без закрывающей скобки). Родня «слайду slide-1».
 *
 * Имя роли берётся из `nameColorValue` (theme.ts), а не сочиняется здесь:
 * подпись роли обязана быть той же, что в панели темы.
 *
 * Сирота (роли с таким именем в теме нет) называется НЕИЗВЕСТНОЙ, а не
 * подменяется похожей: `docs/design/system.md` §4 прямо говорит, что
 * редактор — единственное место, где о сироте можно узнать. Подставить
 * сюда правдоподобное имя значило бы закрыть автору этот единственный путь.
 */
function describeBackground(background: string | number): string {
  const naming = nameColorValue(background);
  switch (naming.kind) {
    case 'role':
      return `фон по теме: ${naming.label}`;
    case 'orphan':
      return 'фон — роль темы не найдена';
    case 'own':
      return `фон ${oneLine(String(naming.value))}`;
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
  return oneLine(content);
}

function summarizeImage(content: string): string {
  if (content === '') return 'пусто, ждёт файла';
  // data-URI — сотни килобайт текста, показывать его в списке нельзя:
  // это ровно та служебная строка, что раздвигает сетку (Ловушка №2).
  // Заменяется ЗДЕСЬ, а не обрезкой: обрезка живёт только в показе, и
  // подсказка иначе получила бы весь base64 целиком.
  if (content.startsWith('data:')) return 'встроенная картинка';
  return oneLine(content);
}

/** Переносы и повторные пробелы — в один пробел. Строка списка однострочна. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string): string {
  const flat = oneLine(text);
  return flat.length > SUMMARY_LIMIT ? `${flat.slice(0, SUMMARY_LIMIT - 1)}…` : flat;
}

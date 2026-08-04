/**
 * Подпись карточки ленты слайдов (§14.11): что изменилось относительно
 * предыдущего слайда, коротким текстом по-русски.
 *
 * Разницу считает `planMorph` из плеера — та же чистая функция, которая
 * решает, кто едет, кто приходит и кто уходит на настоящем морфинге
 * (`packages/player/src/morph.ts`). Своей второй реализации сравнения здесь
 * нет и не должно быть: расхождение с тем, что покажет сцена, было бы виднее
 * всего именно тут, в подписи, — а не в самом переходе.
 *
 * Модуль чистый: ни DOM, ни React, только Slide/Element из ядра и MorphPart
 * из плеера.
 */
import type { Element, ElementState, Slide } from '@player/core';
import { planMorph, type MorphPart } from '@player/player';

/** Длиннее — обрезается многоточием. Тот же приём, что и в `panels/elementRows.ts`. */
const NAME_LIMIT = 20;

/**
 * Подпись карточки: что изменилось между `prev` и `next`.
 *
 * `prev === undefined` — первый слайд сегмента, ему сравнивать не с чем.
 * Иначе разница считается через `planMorph` по всем элементам сегмента:
 * появившиеся, исчезнувшие и — среди тех, что есть на обоих слайдах, —
 * реально изменившиеся (роль `moves`, но с разным состоянием).
 *
 * «Ничего не изменилось» — не всегда пустая подпись. Если следующий слайд
 * привязан к слову (`at.kind === 'word'`), это не дефект данных, а опорный
 * кадр: «держи прежнее состояние до слова, меняй после него» (§14.12
 * в docs/planning.md, закрыто прогоном в Сессии 14). Секундный слайд без
 * изменений — действительно ничего не делает, и подпись говорит об этом
 * прямо.
 */
export function slideChangeSummary(
  prev: Slide | undefined,
  next: Slide,
  elements: readonly Element[],
): string {
  if (prev === undefined) return 'начало сцены';

  const elementIds = elements.map((element) => element.id);
  const plan = planMorph(elementIds, prev.states, next.states);

  const parts: string[] = [];
  const entered = idsWithRole(plan, 'enters');
  const left = idsWithRole(plan, 'leaves');
  const moved = idsThatMoved(plan);

  if (entered.length > 0) parts.push(`появляется: ${namesOf(entered, elements)}`);
  if (left.length > 0) parts.push(`исчезает: ${namesOf(left, elements)}`);
  if (moved.length > 0) parts.push(`двигается: ${namesOf(moved, elements)}`);

  if (parts.length === 0) {
    // От секунд, а не к слову: сирота — тоже опорный кадр, ждущий слова,
    // просто слово у неё догадка. Написать здесь `=== 'word'` значило бы
    // подписать сироту «ничего не меняет» — то есть объявить осмысленный
    // кадр пустым ровно там, где автору надо разбираться.
    return next.at.kind === 'seconds' ? 'ничего не меняет' : 'ждёт слова';
  }
  return parts.join(' · ');
}

function idsWithRole(plan: readonly MorphPart[], role: MorphPart['role']): string[] {
  return plan.filter((part) => part.role === role).map((part) => part.id);
}

/**
 * Элементы, у которых роль `moves`, но состояние на деле поменялось.
 *
 * `planMorph` метит `moves` любой элемент, присутствующий на обоих слайдах,
 * даже если он стоит на месте пиксель в пиксель, — это верно для морфинга
 * (там всё равно нечего анимировать), но для подписи это и есть тот самый
 * случай «ничего не изменилось».
 */
function idsThatMoved(plan: readonly MorphPart[]): string[] {
  return plan
    .filter((part) => part.role === 'moves' && !statesEqual(part.from!, part.to!))
    .map((part) => part.id);
}

function statesEqual(a: ElementState, b: ElementState): boolean {
  return (
    a.x === b.x
    && a.y === b.y
    && a.width === b.width
    && a.height === b.height
    && a.rotation === b.rotation
    && a.zIndex === b.zIndex
    && a.opacity === b.opacity
    && a.visible === b.visible
    && styleEqual(a.style, b.style)
  );
}

function styleEqual(a: Readonly<Record<string, string | number>>, b: Readonly<Record<string, string | number>>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

function namesOf(ids: readonly string[], elements: readonly Element[]): string {
  return ids.map((id) => elementName(id, elements)).join(', ');
}

/**
 * Имя элемента в подписи: содержимое текста, если оно есть, иначе id.
 *
 * Только для `type: 'text'` — у картинки content бывает data-URI на сотни
 * килобайт (тот же довод, что и в `panels/elementRows.ts`), а у фигуры
 * содержимого не бывает вовсе.
 */
function elementName(id: string, elements: readonly Element[]): string {
  const element = elements.find((candidate) => candidate.id === id);
  if (!element) return id;
  if (element.type === 'text' && element.content.trim() !== '') {
    return truncate(element.content);
  }
  return element.id;
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > NAME_LIMIT ? `${oneLine.slice(0, NAME_LIMIT - 1)}…` : oneLine;
}

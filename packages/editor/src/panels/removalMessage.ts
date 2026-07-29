/**
 * Сообщение о каскадном удалении элемента.
 *
 * Чистая функция: удаление элемента (`state/elements.ts`) каскадом снимает
 * анимации, ссылавшиеся на него, и автор обязан узнать, сколько именно —
 * иначе исчезновение анимации без объяснения выглядит как баг редактора.
 */

import { ANIMATIONS, plural } from '../plural.js';

/** undefined — каскада не было, показывать нечего. */
export function formatRemovalMessage(id: string, removedCueCount: number): string | undefined {
  if (removedCueCount <= 0) return undefined;
  return `Удалён элемент «${id}», вместе с ним ${plural(removedCueCount, ANIMATIONS)}`;
}

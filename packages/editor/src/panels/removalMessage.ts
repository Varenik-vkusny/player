/**
 * Сообщение о каскадном удалении элемента.
 *
 * Чистая функция: удаление элемента (`state/elements.ts`) каскадом снимает
 * анимации, ссылавшиеся на него, и автор обязан узнать, сколько именно —
 * иначе исчезновение анимации без объяснения выглядит как баг редактора.
 */

/** undefined — каскада не было, показывать нечего. */
export function formatRemovalMessage(id: string, removedCueCount: number): string | undefined {
  if (removedCueCount <= 0) return undefined;
  return `Удалён элемент «${id}», вместе с ним ${removedCueCount} ${animationsWord(removedCueCount)}`;
}

/** Русское согласование числительного с «анимация»: 1 — …, 2–4 — …и, 5+ — …й, с исключением 11–14. */
function animationsWord(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'анимаций';
  const mod10 = count % 10;
  if (mod10 === 1) return 'анимация';
  if (mod10 >= 2 && mod10 <= 4) return 'анимации';
  return 'анимаций';
}

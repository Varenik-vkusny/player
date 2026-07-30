/**
 * Сообщение о каскадном удалении элемента.
 *
 * Чистая функция. Удаление элемента (`state/elements.ts`, `removeElement`)
 * каскадом снимает его состояние с КАЖДОГО слайда, где оно было, и автор
 * обязан узнать, со скольких именно, — иначе исчезновение элемента сразу
 * из нескольких мест дорожки выглядит как баг редактора.
 *
 * До схемы v3 здесь считались снятые кью-анимации. Кью больше нет
 * (ADR-015), но каскад никуда не делся — поменялась только единица счёта.
 * Функция уцелела как мёртвый код и была замечена приёмкой e2e: она
 * существовала, но её никто не звал.
 */

import { plural, SLIDES } from '../plural.js';

/**
 * `undefined` — каскада не было, показывать нечего.
 *
 * Ноль слайдов — законный случай: элемент есть в сегменте, но состояния
 * ему пока не задали ни на одном слайде.
 */
export function formatRemovalMessage(id: string, removedStateCount: number): string | undefined {
  if (removedStateCount <= 0) return undefined;
  return `Удалён элемент «${id}», вместе с ним состояния на ${plural(removedStateCount, SLIDES)}`;
}

/** Со скольких слайдов удаление элемента снимет состояние. */
export function statesOnSlides(
  slides: readonly { readonly states: Readonly<Record<string, unknown>> }[],
  id: string,
): number {
  return slides.filter((slide) => id in slide.states).length;
}

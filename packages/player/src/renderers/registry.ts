/**
 * @player/player — Реестр DOM-рендереров элементов.
 *
 * Позволяет регистрировать пользовательские и стандартные функции отрисовки
 * элементов сцены без применения hardcoded switch-case.
 */
import type { Element, ElementState } from '@player/core';

export type ElementDOMRenderer = (
  node: HTMLElement,
  element: Element,
  state: ElementState,
) => void;

const elementRenderers = new Map<string, ElementDOMRenderer>();

/** Регистрация DOM-рендерера для типа элемента. */
export function registerElementRenderer(type: string, renderer: ElementDOMRenderer): void {
  elementRenderers.set(type, renderer);
}

/** Получение DOM-рендерера по типу элемента. */
export function getElementRenderer(type: string): ElementDOMRenderer | undefined {
  return elementRenderers.get(type);
}

// Регистрация встроенных рендереров
registerElementRenderer('text', (node, element) => {
  node.textContent = element.content;
});

registerElementRenderer('image', (node, element) => {
  node.textContent = '';
  node.style.backgroundImage = element.content ? `url(${element.content})` : '';
  node.style.backgroundSize = 'cover';
});

registerElementRenderer('shape', (node) => {
  node.textContent = '';
});

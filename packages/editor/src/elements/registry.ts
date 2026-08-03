/**
 * @player/editor — Реестр элементов и компонентов редактора.
 *
 * Позволяет регистрировать элементы редактора и их панели свойств (Inspector).
 */
import type { Element, ElementState } from '@player/core';
import type { ComponentType } from 'react';
import { ELEMENT_LIBRARY, type LibraryItem } from '../state/library.js';

export interface EditorElementPlugin {
  readonly type: string;
  readonly libraryItem?: LibraryItem;
  readonly InspectorPanel?: ComponentType<{
    element: Element;
    state: ElementState;
    onChange: (patch: Partial<ElementState>) => void;
  }>;
}

const editorElementRegistry = new Map<string, EditorElementPlugin>();

/** Регистрация элемента редактора. */
export function registerEditorElement(plugin: EditorElementPlugin): void {
  editorElementRegistry.set(plugin.type, plugin);
}

/** Получение плагина элемента редактора по его типу. */
export function getEditorElementPlugin(type: string): EditorElementPlugin | undefined {
  return editorElementRegistry.get(type);
}

/** Получение инспектора элемента. */
export function getEditorElementInspector(type: string) {
  return editorElementRegistry.get(type)?.InspectorPanel;
}

/** Список всех библиотечных заготовок (включая динамически зарегистрированные). */
export function getAllLibraryItems(): readonly LibraryItem[] {
  const registeredItems: LibraryItem[] = [];
  for (const plugin of editorElementRegistry.values()) {
    if (plugin.libraryItem) {
      registeredItems.push(plugin.libraryItem);
    }
  }
  return [...ELEMENT_LIBRARY, ...registeredItems];
}

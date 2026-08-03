/**
 * @player/core — Реестр элементов схемы.
 *
 * Позволяет регистрировать типы элементов, их правила и дефолтные параметры.
 * Соблюдает Инвариант №6: НЕ импортирует ни DOM, ни React.
 */
import { z } from 'zod';
import type { ElementState } from '../schema.js';

export interface CoreElementPlugin {
  readonly type: string;
  readonly schema?: z.ZodTypeAny;
  readonly defaultContent?: string;
  readonly defaultState?: Partial<ElementState>;
}

const coreElementRegistry = new Map<string, CoreElementPlugin>();

/** Регистрация нового элемента в ядре. */
export function registerCoreElement(plugin: CoreElementPlugin): void {
  coreElementRegistry.set(plugin.type, plugin);
}

/** Получение плагина элемента по его типу. */
export function getCoreElementPlugin(type: string): CoreElementPlugin | undefined {
  return coreElementRegistry.get(type);
}

/** Список всех зарегистрированных плагинов элементов в ядре. */
export function getAllCoreElementPlugins(): CoreElementPlugin[] {
  return Array.from(coreElementRegistry.values());
}

// Регистрация встроенных типов элементов
registerCoreElement({
  type: 'text',
  defaultContent: 'Текст',
  defaultState: {
    width: 200,
    height: 50,
    style: { fontSize: '24px', color: '#ffffff' },
  },
});

registerCoreElement({
  type: 'shape',
  defaultContent: 'rectangle',
  defaultState: {
    width: 150,
    height: 150,
    style: { backgroundColor: '#3b82f6', borderRadius: '8px' },
  },
});

registerCoreElement({
  type: 'image',
  defaultContent: '',
  defaultState: {
    width: 300,
    height: 200,
  },
});

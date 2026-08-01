/**
 * @player/core — типы, схема и чистая логика времени.
 *
 * Инвариант №6: этот пакет НЕ знает про DOM и React. Ни одного импорта
 * из player или editor здесь быть не может — это проверяется тестом
 * инвариантов, а не дисциплиной.
 */
export * from './schema.js';
export * from './migrations.js';
export * from './time.js';
export * from './align.js';
export * from './graph.js';
export { loadProject, ProjectLoadError } from './load.js';

/**
 * Библиотека хрома редактора: то, что переиспользуют.
 *
 * Живёт внутри пакета editor и никем снаружи не импортируется —
 * направление зависимостей editor → player → core (инвариант №6).
 */
export { Icon } from './Icon.js';
export { ICON_PATHS, type IconName } from './icons.js';
export { AlignIcon, type Shape } from './AlignIcon.js';

/**
 * Библиотека хрома редактора: то, что переиспользуют.
 *
 * Живёт внутри пакета editor и никем снаружи не импортируется —
 * направление зависимостей editor → player → core (инвариант №6).
 */
export { Button, type ButtonKind } from './Button.js';
export { Icon } from './Icon.js';
export { Section } from './Section.js';
export { ScrollStrip } from './ScrollStrip.js';
export { ICON_PATHS, type IconName } from './icons.js';
export { AlignIcon, type Shape } from './AlignIcon.js';

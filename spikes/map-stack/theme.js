/**
 * Ориентир вида — Twine, снят с натуры в живом Chrome 06.08.2026 (см. промпт
 * сессии). Общий модуль, чтобы оба варианта рисовали БУКВАЛЬНО одни числа,
 * а не два независимых приближения к одному образцу.
 */
export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
export const GAP = 25;

export const BOARD_BACKGROUND = 'rgb(7,22,42)';
export const GRID_STEP = 100;

export const NODE_FILL = 'rgb(20,46,80)';
export const EMPTY_NODE_BORDER = '1px dashed rgb(128,128,128)';
export const EMPTY_NODE_FILL = 'rgba(255,255,255,0.1)';

export const EDGE_STROKE = 'rgb(128,128,128)';
export const EDGE_STROKE_WIDTH = 2;
export const START_EDGE_STROKE = 'rgb(106,198,122)';
/** Вида «сломанное ребро» у Twine нет — это наша фикстура. Отдельный,
 *  явно тревожный цвет, чтобы не спутать со сплошным серым ребром. */
export const BROKEN_EDGE_STROKE = 'rgb(220,80,80)';

/**
 * Масштаб дорожки — чистые функции, без DOM и без React.
 *
 * При ×1 хвост перехода 0.6 с из 107 с даёт 7.2 px — по такой мишени
 * физически нельзя попасть указателем (`docs/design/track-zoom.md` §1).
 * Полотно шириной `laneWidth × zoom` внутри контейнера с прокруткой решает
 * это, не трогая формулу `clientX → секунда`
 * (`TrackView.seekToPointer`, `MarksLane.secondsAt`): обе меряют
 * `getBoundingClientRect()` самого полотна, а не контейнера, и у полотна
 * `rect.width` равна полной ширине полотна независимо от прокрутки.
 */

export const ZOOM_STEPS = [1, 2, 4, 8, 16] as const;
export type ZoomStep = (typeof ZOOM_STEPS)[number];

/** Ширина полотна в пикселях при данном масштабе. */
export function canvasWidth(laneWidth: number, zoom: ZoomStep): number {
  // laneWidth приходит 0 на первом рендере, до первого замера
  // ResizeObserver'ом (эффект в TrackView ставится в useLayoutEffect,
  // но кадр до него уже отрисован с нулевой шириной). Полотно нулевой
  // ширины уронило бы деление в ratioToX и в seekToPointer/secondsAt
  // (там `rect.width` идёт в знаменатель) — Math.max держит его
  // положительным даже до первого замера.
  return Math.max(laneWidth, 1) * zoom;
}

/** Доля 0..1 (например, `seconds / durationSeconds`) → пиксель полотна. */
export function ratioToX(ratio: number, canvasWidthPx: number): number {
  return ratio * canvasWidthPx;
}

/**
 * Предел ширины HTML-канвы, в CSS-пикселях.
 *
 * Замерено 06.08.2026, Playwright в видимом браузере, двоичным поиском:
 * 65535 рисует, 65536 — нет. Превышение МОЛЧИТ целиком — `getContext` отдаёт
 * рабочий контекст, `getImageData` не бросает, в консоли пусто, а `rgba`
 * приходит `[0,0,0,0]`: волна просто перестаёт существовать, и ни один
 * сигнал об этом не долетает до кода. Узкий канвас 64×65535 рисует —
 * значит упирается СТОРОНА канвы, а не площадь, поэтому предел сравнивается
 * с шириной полотна напрямую, без поправки на высоту.
 */
export const MAX_CANVAS_WIDTH_PX = 65535;

/** Помещается ли полотно этой ширины в канву, не упираясь в предел браузера. */
export function zoomFits(laneWidth: number, zoom: ZoomStep): boolean {
  return canvasWidth(laneWidth, zoom) <= MAX_CANVAS_WIDTH_PX;
}

/**
 * Почему эта ступень масштаба недоступна на текущей ширине полосы, словами
 * для автора. `undefined` — ступень доступна.
 *
 * Живёт рядом с порогом (`MAX_CANVAS_WIDTH_PX`) намеренно: причина и предел
 * обязаны меняться вместе, как `splitBlockedReason` и сам разрез
 * (`state/split.ts`). Ступень при этом ГАСНЕТ, а не исчезает: она остаётся
 * законным понятием, просто недоступна на ЭТОМ экране.
 */
export function zoomBlockedReason(laneWidth: number, zoom: ZoomStep): string | undefined {
  if (zoomFits(laneWidth, zoom)) return undefined;
  return `Масштаб ×${zoom} на этой ширине окна даст полотно шире предела канвы браузера (${MAX_CANVAS_WIDTH_PX} px) — оно перестанет рисоваться. Сузьте масштаб или расширьте окно.`;
}

/**
 * Наибольшая ступень масштаба, чьё полотно помещается в канву браузера при
 * данной ширине полосы (Часть A).
 *
 * Гашение кнопки (`zoomBlockedReason`) не спасает автора, который УЖЕ стоит
 * на ×8 или ×16: гасится только выбор новой ступени, а активная ступень
 * остаётся как есть. Растянутое окно двигает `laneWidth` вверх, полотно
 * `laneWidth × zoom` пересекает `MAX_CANVAS_WIDTH_PX` в тот же кадр — и волна
 * исчезает МОЛЧА: `getContext` отдаёт рабочий контекст, `getImageData` не
 * бросает, в консоли пусто, `rgba` приходит `[0,0,0,0]` (измерено 06.08.2026,
 * тот же прогон, что и у `MAX_CANVAS_WIDTH_PX`). Вызывающая сторона обязана
 * сверять активный `zoom` с `zoomFits` при каждом изменении `laneWidth`
 * и опускаться на то, что вернёт эта функция.
 *
 * ×1 — резервный ответ даже когда сам не помещается (`laneWidth` больше
 * предела канвы целиком): ниже опускаться некуда, а `undefined` оставил бы
 * автора вовсе без масштаба.
 */
export function largestFittingZoom(laneWidth: number): ZoomStep {
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = ZOOM_STEPS[index]!;
    if (zoomFits(laneWidth, step)) return step;
  }
  return ZOOM_STEPS[0];
}

import { describe, expect, it } from 'vitest';

import {
  canvasWidth,
  largestFittingZoom,
  MAX_CANVAS_WIDTH_PX,
  ratioToX,
  zoomBlockedReason,
  zoomFits,
  ZOOM_STEPS,
} from '../src/track/zoom.js';

describe('масштаб дорожки', () => {
  it('ступени именованы и начинаются с единицы', () => {
    expect(ZOOM_STEPS).toEqual([1, 2, 4, 8, 16]);
  });

  it('при ×1 полотно совпадает с полосой — сегодняшний вид', () => {
    expect(canvasWidth(1000, 1)).toBe(1000);
  });

  it('при ×4 полотно вчетверо шире', () => {
    expect(canvasWidth(1000, 4)).toBe(4000);
  });

  it('доля переводится в пиксель полотна, а не полосы', () => {
    expect(ratioToX(0.5, canvasWidth(1000, 4))).toBe(2000);
  });

  it('нулевая ширина полосы не даёт нулевого полотна', () => {
    expect(canvasWidth(0, 4)).toBeGreaterThan(0);
  });

  it('предел канвы браузера — 65535 px, измерено двоичным поиском', () => {
    expect(MAX_CANVAS_WIDTH_PX).toBe(65535);
  });

  it('ступень помещается ровно до предела канвы и не дальше', () => {
    expect(canvasWidth(4095, 16)).toBe(65520);
    expect(zoomFits(4095, 16)).toBe(true);
    expect(canvasWidth(4096, 16)).toBe(65536);
    expect(zoomFits(4096, 16)).toBe(false);
  });

  it('доступная ступень не называет причину, недоступная — называет', () => {
    expect(zoomBlockedReason(4095, 16)).toBeUndefined();
    expect(zoomBlockedReason(4096, 16)).toContain('×16');
  });

  // Часть A: гашение кнопки не спасает автора, УЖЕ стоящего на ×8/×16, когда
  // окно растягивается и полотно молча перестаёт рисоваться. Наибольшая
  // помещающаяся ступень — единственный источник ответа «куда опуститься».
  it('наибольшая помещающаяся ступень — сама широкая, что ещё влезает', () => {
    expect(largestFittingZoom(4095)).toBe(16); // 4095×16 = 65520, влезает впритык
    expect(largestFittingZoom(4096)).toBe(8); // 4096×16 = 65536, уже нет — падаем на ×8
    expect(largestFittingZoom(8191)).toBe(8); // 8191×8 = 65528
    expect(largestFittingZoom(8192)).toBe(4); // 8192×8 = 65536
  });

  it('ступень ×1 — резервный ответ, даже когда сама не помещается', () => {
    // Окно шире самого предела канвы целиком: опускаться больше некуда,
    // а undefined оставил бы автора вовсе без масштаба.
    expect(largestFittingZoom(100_000)).toBe(1);
  });
});

import { describe, expect, it } from 'vitest';

import {
  STAGE_ZOOM_STEPS,
  canZoomIn,
  canZoomOut,
  canvasSize,
  effectiveScale,
  zoomIn,
  zoomOut,
  zoomPercent,
} from '../src/stage/zoom.js';

const STAGE = { width: 1920, height: 1080 };
/** Вписывание в окне 1920×1080 — измерено в Сессии 31 и названо в задании. */
const FIT = 0.378;

describe('масштаб холста: лестница ступеней', () => {
  it('ступени идут по возрастанию и включают единицу', () => {
    // Единица — «сцена рисуется один в один», и без неё лестница теряет
    // единственную ступень с самостоятельным смыслом.
    expect([...STAGE_ZOOM_STEPS]).toEqual([...STAGE_ZOOM_STEPS].sort((a, b) => a - b));
    expect(STAGE_ZOOM_STEPS).toContain(1);
  });

  it('«+» от вписывания шагает от того, что видно, а не от начала лестницы', () => {
    // Несущее свойство, снятое с Canva: при вписывании 60 % кнопка «+» даёт
    // 75 %. Реализация «взять первую ступень» отправила бы автора на 10 %,
    // то есть ОТДАЛИЛА бы по нажатию «приблизить».
    expect(zoomIn('fit', 0.6)).toBe(0.75);
    expect(zoomIn('fit', FIT)).toBe(0.5);
  });

  it('«−» от вписывания шагает вниз от видимого', () => {
    expect(zoomOut('fit', 0.6)).toBe(0.5);
    expect(zoomOut('fit', FIT)).toBe(0.25);
  });

  it('ступень, на которой стоим, не считается следующей', () => {
    // Запас EPSILON существует ровно для этого: доли складываются неточно,
    // и «строго больше» без запаса могло бы перепрыгнуть ступень.
    expect(zoomIn(0.75, FIT)).toBe(1);
    expect(zoomOut(0.75, FIT)).toBe(0.5);
  });

  it('на краях лестницы остаётся край, а не бросок и не переход по кругу', () => {
    const top = STAGE_ZOOM_STEPS[STAGE_ZOOM_STEPS.length - 1]!;
    const bottom = STAGE_ZOOM_STEPS[0]!;
    expect(zoomIn(top, FIT)).toBe(top);
    expect(zoomOut(bottom, FIT)).toBe(bottom);
    expect(canZoomIn(top, FIT)).toBe(false);
    expect(canZoomOut(bottom, FIT)).toBe(false);
    expect(canZoomIn('fit', FIT)).toBe(true);
    expect(canZoomOut('fit', FIT)).toBe(true);
  });

  it('вписывание — состояние, а не ступень: фактический масштаб берётся у него', () => {
    expect(effectiveScale('fit', FIT)).toBe(FIT);
    expect(effectiveScale(2, FIT)).toBe(2);
  });

  it('подпись — проценты, как у Canva', () => {
    expect(zoomPercent(FIT)).toBe('38 %');
    expect(zoomPercent(1)).toBe('100 %');
    expect(zoomPercent(0.1)).toBe('10 %');
  });
});

describe('масштаб холста: размер полотна', () => {
  it('при вписывании полотно равно окну — картинка остаётся ровно прежней', () => {
    // Несущее свойство совместимости. Полотно больше окна означало бы полосы
    // прокрутки там, где их не было, и сдвиг сцены на их толщину.
    expect(canvasSize(STAGE, 700 / 1920, 700, 500)).toEqual({ width: 700, height: 500 });
  });

  it('при увеличении полотно растёт ровно настолько, сколько нужно прокрутке', () => {
    expect(canvasSize(STAGE, 1, 700, 500)).toEqual({ width: 1920, height: 1080 });
  });

  it('оси считаются отдельно: широкая сцена в высоком окне прокручивается только вбок', () => {
    // Масштаб 0.4: сцена 768×432. Окно 700×900 — вширь не влезает, ввысь
    // влезает с запасом. Полотно обязано вырасти ТОЛЬКО по X.
    expect(canvasSize(STAGE, 0.4, 700, 900)).toEqual({ width: 768, height: 900 });
  });

  it('дробный размер округляется ВВЕРХ: урезанное полотно обрезало бы сцену', () => {
    // 1920 × 0.333 = 639.36 — полотно 639 отрезало бы правый столбец пикселей.
    expect(canvasSize(STAGE, 0.333, 100, 100).width).toBe(640);
  });
});

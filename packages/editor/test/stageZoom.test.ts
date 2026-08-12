import { describe, expect, it } from 'vitest';

import {
  STAGE_GAP_X,
  STAGE_GAP_Y,
  STAGE_ZOOM_STEPS,
  canZoomIn,
  canZoomOut,
  canvasSize,
  effectiveScale,
  fitHostSize,
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
  /**
   * Масштаб вписывания СЧИТАЕТСЯ ТАК ЖЕ, как его считает редактор: от окна
   * за вычетом зазора. Числа в ожиданиях ниже опираются на это, а не на
   * «700/1920»: с появлением зазора (Сессия 36) вписывание перестало брать
   * окно целиком.
   */
  const fitScale = (hostWidth: number, hostHeight: number): number =>
    Math.min(
      (hostWidth - 2 * STAGE_GAP_X) / STAGE.width,
      (hostHeight - 2 * STAGE_GAP_Y) / STAGE.height,
    );

  it('при вписывании полотно равно окну — картинка остаётся ровно прежней', () => {
    // Несущее свойство совместимости. Полотно больше окна означало бы полосы
    // прокрутки там, где их не было, и сдвиг сцены на их толщину.
    //
    // Свойство держится НЕ отдельной веткой в коде, а тем, что зазор вычтен
    // из окна перед вписыванием и прибавлен к полотну после: по ведущей оси
    // это в точности окно, по ведомой — меньше него.
    expect(canvasSize(STAGE, fitScale(700, 500), 700, 500)).toEqual({ width: 700, height: 500 });
    // И на другой ведущей оси — та же проверка, чтобы свойство не оказалось
    // верным случайно на одном соотношении сторон.
    expect(canvasSize(STAGE, fitScale(900, 300), 900, 300)).toEqual({ width: 900, height: 300 });
  });

  it('при увеличении полотно растёт на сцену И на зазор: край сцены не упирается в край полотна', () => {
    // Без слагаемого зазора сцена на увеличенном масштабе снова упёрлась бы
    // краем в край полотна, и, прокрутив до низа, автор получил бы ровно ту
    // недостижимую ручку, ради которой зазор заводился.
    expect(canvasSize(STAGE, 1, 700, 500)).toEqual({
      width: 1920 + 2 * STAGE_GAP_X,
      height: 1080 + 2 * STAGE_GAP_Y,
    });
  });

  it('оси считаются отдельно: широкая сцена в высоком окне прокручивается только вбок', () => {
    // Масштаб 0.4: сцена 768×432, с зазором — 816×464. Окно 700×900: вширь
    // не влезает, ввысь влезает с запасом. Полотно растёт ТОЛЬКО по X.
    expect(canvasSize(STAGE, 0.4, 700, 900)).toEqual({ width: 768 + 2 * STAGE_GAP_X, height: 900 });
  });

  it('дробный размер округляется ВВЕРХ: урезанное полотно обрезало бы сцену', () => {
    // 1920 × 0.333 = 639.36 — полотно 639 отрезало бы правый столбец пикселей.
    // Зазор прибавляется ПОСЛЕ округления, поэтому проверяется именно оно.
    expect(canvasSize(STAGE, 0.333, 100, 100).width).toBe(640 + 2 * STAGE_GAP_X);
  });
});

describe('зазор вокруг сцены', () => {
  it('вписывание считается от окна за вычетом зазора', () => {
    expect(fitHostSize(1000, 800)).toEqual({
      width: 1000 - 2 * STAGE_GAP_X,
      height: 800 - 2 * STAGE_GAP_Y,
    });
  });

  it('окно меньше зазора — громкая ошибка, а не молчаливый ноль', () => {
    // Молчаливый ноль здесь превратился бы в Infinity у вызывающего: тот
    // делит на масштаб. Тот же довод, что у `stageScale` в `geometry.ts`.
    expect(() => fitHostSize(2 * STAGE_GAP_X, 800)).toThrow(/меньше зазора/);
    expect(() => fitHostSize(1000, 2 * STAGE_GAP_Y)).toThrow(/меньше зазора/);
  });

  it('зазор по вертикали больше выступа ручки размера', () => {
    // Ручка 10 px с `margin: -5px` выступает за рамку на 5. Ради этого зазор
    // и заведён: край сцены не должен совпадать с краем области холста.
    // Числа сняты с живой Canva 12.08.2026, см. docs/research/.
    expect(STAGE_GAP_Y).toBeGreaterThan(5);
    expect(STAGE_GAP_X).toBeGreaterThan(5);
  });
});

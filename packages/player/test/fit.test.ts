import { describe, expect, it } from 'vitest';

import { fitStage, type StageSize } from '../src/render.js';

const STAGE: StageSize = { width: 1920, height: 1080 };

describe('fitStage: вписывание сцены в контейнер', () => {
  it('без масштаба вписывает по узкой стороне — как было до Сессии 32', () => {
    // Контейнер шире, чем 16:9, значит ограничивает ВЫСОТА.
    expect(fitStage(1600, 540, STAGE).scale).toBe(0.5);
    // Контейнер выше, чем 16:9, значит ограничивает ШИРИНА.
    expect(fitStage(960, 1080, STAGE).scale).toBe(0.5);
  });

  it('вызов без аргумента масштаба и с «fit» — одно и то же', () => {
    // Аргумент добавлен со значением по умолчанию, и плеер зовёт функцию
    // без него. Разойдись эти два вызова — плеер поехал бы молча.
    expect(fitStage(1280, 700, STAGE)).toEqual(fitStage(1280, 700, STAGE, 'fit'));
  });

  it('отступы вписывания целые: половина пикселя дорожает при мелком масштабе', () => {
    // Разность нечётна, деление пополам дало бы 132.5. При масштабе 0.208
    // эти полпикселя экрана превращаются в 2.4 единицы сцены — так в Сессии 13
    // разъехался e2e на изменение размера ручкой.
    const fit = fitStage(1600, 535, STAGE);
    expect(Number.isInteger(fit.offsetX)).toBe(true);
    expect(Number.isInteger(fit.offsetY)).toBe(true);
  });

  it('заданное число — это масштаб как есть, а не множитель к вписыванию', () => {
    // Смысл тот же, что у процента в Canva: 1 значит «единица сцены рисуется
    // одним CSS-пикселем», независимо от размера окна.
    expect(fitStage(1600, 540, STAGE, 1).scale).toBe(1);
    expect(fitStage(600, 200, STAGE, 1).scale).toBe(1);
    expect(fitStage(1600, 540, STAGE, 0.25).scale).toBe(0.25);
  });

  it('размер окна не влияет на заданный масштаб — влияет только на отступы', () => {
    // Несущее свойство: растянутое окно двигает вписывание и НЕ имеет права
    // трогать число, которое автор выбрал руками.
    expect(fitStage(800, 400, STAGE, 2).scale).toBe(fitStage(4000, 3000, STAGE, 2).scale);
  });

  it('сцена крупнее окна — отступы уходят в минус, и это правильный ответ', () => {
    // Тот, кто рисует сцену В окне, получает её по центру с обрезкой по краям.
    // Тот, кому нужна прокрутка, обязан передать сюда размер ПОЛОТНА, а не
    // окна — см. следующую проверку и `StageView`.
    const fit = fitStage(800, 450, STAGE, 1);
    expect(fit.offsetX).toBeLessThan(0);
    expect(fit.offsetY).toBeLessThan(0);
  });

  it('переданный размер ПОЛОТНА даёт нулевые отступы — на этом стоит прокрутка холста', () => {
    const zoom = 2;
    const fit = fitStage(STAGE.width * zoom, STAGE.height * zoom, STAGE, zoom);
    expect(fit).toEqual({ scale: zoom, offsetX: 0, offsetY: 0 });
  });

  it('полотно шире сцены (окно шире) — сцена стоит по центру полотна', () => {
    // Масштаб мельче вписывания: полотно равно окну, сцена меньше его,
    // и центрируется тем же округляющим отступом, что и при вписывании.
    const fit = fitStage(1920, 1080, STAGE, 0.5);
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(480);
    expect(fit.offsetY).toBe(270);
  });

  it('неположительный, нечисловой и бесконечный масштаб бросают, а не рисуют пустоту', () => {
    // Молчаливая подстановка «на всякий случай» дала бы сцену нулевого
    // размера — картинку, неотличимую от пустого проекта.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => fitStage(1600, 540, STAGE, bad), `масштаб ${bad}`).toThrow(RangeError);
    }
  });

  it('некорректный размер контейнера по-прежнему бросает', () => {
    expect(() => fitStage(0, 540, STAGE)).toThrow(RangeError);
    expect(() => fitStage(1600, 0, STAGE, 1)).toThrow(RangeError);
  });
});

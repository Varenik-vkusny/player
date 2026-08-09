import { describe, expect, it } from 'vitest';

import { clampSplitterWidth, nextSplitterWidth } from '../src/chrome/Splitter.js';

describe('clampSplitterWidth: зажим ширины', () => {
  it('пропускает значение внутри диапазона без изменений', () => {
    expect(clampSplitterWidth(300, 200, 480)).toBe(300);
  });

  it('поднимает значение ниже минимума до минимума', () => {
    expect(clampSplitterWidth(50, 200, 480)).toBe(200);
  });

  it('опускает значение выше максимума до максимума', () => {
    expect(clampSplitterWidth(900, 200, 480)).toBe(480);
  });

  it('держит значение точно на границе диапазона', () => {
    expect(clampSplitterWidth(200, 200, 480)).toBe(200);
    expect(clampSplitterWidth(480, 200, 480)).toBe(480);
  });
});

describe('nextSplitterWidth: направление зависит от стороны панели', () => {
  it('панель слева растёт при движении курсора вправо (положительная дельта)', () => {
    expect(nextSplitterWidth(300, 'left', 50, 200, 480)).toBe(350);
  });

  it('панель слева сужается при движении курсора влево (отрицательная дельта)', () => {
    expect(nextSplitterWidth(300, 'left', -50, 200, 480)).toBe(250);
  });

  it('панель справа растёт при движении курсора влево — знак переворачивается', () => {
    expect(nextSplitterWidth(300, 'right', -50, 200, 480)).toBe(350);
  });

  it('панель справа сужается при движении курсора вправо', () => {
    expect(nextSplitterWidth(300, 'right', 50, 200, 480)).toBe(250);
  });

  it('результат зажат в диапазон, даже когда дельта уводит далеко за предел', () => {
    expect(nextSplitterWidth(300, 'left', 10000, 200, 480)).toBe(480);
    expect(nextSplitterWidth(300, 'left', -10000, 200, 480)).toBe(200);
  });
});

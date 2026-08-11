import { describe, expect, it } from 'vitest';

import { EDGE_MARGIN, placeMenu } from '../src/stage/menuPlacement.js';

const WINDOW = { width: 1600, height: 900 };
const MENU = { width: 218, height: 208 };

describe('placeMenu', () => {
  it('в середине окна меню растёт вправо-вниз ОТ ТОЧКИ нажатия', () => {
    // Краснеет, если меню центрировать или сдвигать: автор потерял бы связь
    // между тем, куда нажал, и тем, что появилось.
    expect(placeMenu({ x: 400, y: 300 }, MENU, WINDOW)).toEqual({ x: 400, y: 300 });
  });

  it('у правого края разворачивается ВЛЕВО от той же точки', () => {
    // Краснеет, если разворота нет: меню уехало бы за границу окна,
    // и правые пункты стали бы недостижимы мышью.
    const at = { x: WINDOW.width - 40, y: 300 };
    const placed = placeMenu(at, MENU, WINDOW);

    expect(placed.x).toBe(at.x - MENU.width);
    expect(placed.x + MENU.width).toBeLessThanOrEqual(WINDOW.width);
    // Развернулось, а не сдвинулось: правый край меню там, где нажали.
    expect(placed.y).toBe(300);
  });

  it('у нижнего края разворачивается ВВЕРХ', () => {
    /**
     * Через интерфейс этот случай почти недостижим (сцена стоит наверху
     * раскладки), поэтому проверяется здесь — иначе разворот остался бы
     * кодом, который выглядит рабочим и не проверен ничем.
     */
    const at = { x: 400, y: WINDOW.height - 40 };
    const placed = placeMenu(at, MENU, WINDOW);

    expect(placed.y).toBe(at.y - MENU.height);
    expect(placed.y + MENU.height).toBeLessThanOrEqual(WINDOW.height);
    expect(placed.x).toBe(400);
  });

  it('в углу разворачивается по ОБЕИМ осям сразу', () => {
    // Краснеет, если оси проверять через else: угол закрыл бы только одну.
    const at = { x: WINDOW.width - 20, y: WINDOW.height - 20 };
    const placed = placeMenu(at, MENU, WINDOW);

    expect(placed.x).toBe(at.x - MENU.width);
    expect(placed.y).toBe(at.y - MENU.height);
  });

  it('меню выше окна прижимается к краю, а не уходит в минус', () => {
    // Краснеет, если развернуть без ограничения снизу: при меню выше окна
    // разворот дал бы отрицательную координату, и верх меню — с ним
    // и первые пункты — оказался бы за границей экрана насовсем.
    const tall = { width: 218, height: 800 };
    const placed = placeMenu({ x: 400, y: 700 }, tall, { width: 1600, height: 500 });

    expect(placed.y).toBe(EDGE_MARGIN);
    expect(placed.y).toBeGreaterThan(0);
  });

  it('ровно впритык, с учётом отступа, ещё НЕ разворачивает', () => {
    // Граница: меню кончается ровно на отступе от края.
    const at = { x: WINDOW.width - MENU.width - EDGE_MARGIN, y: 100 };
    expect(placeMenu(at, MENU, WINDOW).x).toBe(at.x);
  });
});

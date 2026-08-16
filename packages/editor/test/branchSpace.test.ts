import { describe, expect, it } from 'vitest';

import {
  FIT_PADDING_PX,
  IDENTITY_VIEW,
  MAX_SCALE,
  MIN_SCALE,
  fitView,
  panBy,
  toScreen,
  toSpace,
  wheelIntent,
  zoomAt,
} from '../src/track/branchSpace.js';
import type { SpaceView } from '../src/track/branchSpace.js';

describe('пространство «Ветки»: перевод координат', () => {
  it('toScreen считает по формуле, а не только «обратима к toSpace»', () => {
    // Что ломает: перепутанный знак сдвига, перепутанное умножение/деление
    // на масштаб, перестановка x/y. Верно ли при любой реализации: нет —
    // конкретные числа проверяют именно ЭТУ формулу, а не произвольную пару
    // взаимно обратных функций (см. следующий тест, который сам по себе
    // такую пару и не отличил бы от неверной).
    const view: SpaceView = { x: 10, y: 20, scale: 2 };
    expect(toScreen(view, { x: 110, y: 120 })).toEqual({ x: 200, y: 200 });
    expect(toSpace(view, { x: 200, y: 200 })).toEqual({ x: 110, y: 120 });
  });

  it('toSpace(toScreen(p)) === p — обратимость', () => {
    // Что ломает: почти ничего специфичного — пара функций, аккуратно
    // обратных друг другу (даже неверных по физике), пройдёт этот тест.
    // Верно ли при любой реализации: да для ЛЮБОЙ взаимно обратной пары,
    // поэтому тест сам по себе не несущий — он подстраховка, а не проверка
    // формулы (та — в тесте выше и в тестах на zoomAt/fitView).
    const view: SpaceView = { x: -37, y: 4.5, scale: 0.6 };
    const p = { x: 314, y: -22 };
    const screen = toScreen(view, p);
    const back = toSpace(view, screen);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});

describe('пространство «Ветки»: масштаб под курсором', () => {
  it('точка пространства под курсором не уезжает при масштабировании', () => {
    // Что ломает: привязка к любой точке, кроме реально переданного
    // screenPoint (центр окна, начало координат, фиксированная константа).
    // Верно ли при любой реализации: нет — это ЦЕНТРАЛЬНОЕ свойство zoomAt,
    // ради которого функция вообще существует.
    const view: SpaceView = { x: 50, y: -30, scale: 1.5 };
    const cursor = { x: 300, y: 200 };
    const before = toSpace(view, cursor);

    const after = zoomAt(view, 1.25, cursor);
    const afterPoint = toSpace(after, cursor);

    expect(afterPoint.x).toBeCloseTo(before.x, 9);
    expect(afterPoint.y).toBeCloseTo(before.y, 9);
    // Масштаб действительно поменялся — иначе тест был бы пуст (прошёл бы
    // и без формулы привязки, потому что вид вообще не менялся).
    expect(after.scale).toBeCloseTo(view.scale * 1.25, 9);
  });

  it('на упёршемся пределе вид не меняется вовсе', () => {
    // Что ломает: отсутствие зажатия масштаба (тогда scale уедет выше
    // MAX_SCALE и тест на равенство вида упадёт), а также любая привязка,
    // не сокращающаяся до тождества при неизменном scale.
    // Верно ли при любой реализации: нет — специально проверяет ветку,
    // не покрытую предыдущим тестом (там масштаб МЕНЯЛСЯ).
    const view: SpaceView = { x: 12.5, y: -7, scale: MAX_SCALE };
    const cursor = { x: 300, y: 200 };

    const after = zoomAt(view, 1.5, cursor);

    expect(after.scale).toBe(MAX_SCALE);
    expect(after.x).toBeCloseTo(view.x, 9);
    expect(after.y).toBeCloseTo(view.y, 9);
  });

  it('на нижнем упёршемся пределе — симметрично', () => {
    const view: SpaceView = { x: 3, y: 9, scale: MIN_SCALE };
    const cursor = { x: 40, y: 400 };

    const after = zoomAt(view, 0.1, cursor);

    expect(after.scale).toBe(MIN_SCALE);
    expect(after.x).toBeCloseTo(view.x, 9);
    expect(after.y).toBeCloseTo(view.y, 9);
  });
});

describe('пространство «Ветки»: вписывание', () => {
  it('центрирует содержимое и вписывает его с зазором', () => {
    // Что ломает: неверный расчёт центра (например, взятый от (0,0), а не
    // от content.x/y), неверный знак смещения, отсутствие вычета зазора.
    // Верно ли при любой реализации: нет — числа проверяют конкретную точку
    // попадания и конкретный вписывающий масштаб.
    const content = { x: 100, y: 200, width: 800, height: 400 };
    const viewportWidth = 1000;
    const viewportHeight = 1000;

    const view = fitView(content, viewportWidth, viewportHeight);

    const contentCenter = { x: content.x + content.width / 2, y: content.y + content.height / 2 };
    const screenCenter = toScreen(view, contentCenter);
    expect(screenCenter.x).toBeCloseTo(viewportWidth / 2, 9);
    expect(screenCenter.y).toBeCloseTo(viewportHeight / 2, 9);

    // Содержимое целиком помещается в окно ВМЕСТЕ с зазором: ни один угол
    // не выходит за пределы окна за вычетом FIT_PADDING_PX.
    const topLeft = toScreen(view, { x: content.x, y: content.y });
    const bottomRight = toScreen(view, {
      x: content.x + content.width,
      y: content.y + content.height,
    });
    expect(topLeft.x).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-9);
    expect(topLeft.y).toBeGreaterThanOrEqual(FIT_PADDING_PX - 1e-9);
    expect(bottomRight.x).toBeLessThanOrEqual(viewportWidth - FIT_PADDING_PX + 1e-9);
    expect(bottomRight.y).toBeLessThanOrEqual(viewportHeight - FIT_PADDING_PX + 1e-9);
  });

  it('пустое содержимое или пустое окно — тождественный вид', () => {
    // Что ломает: попытка посчитать масштаб от нулевой ширины/высоты (даст
    // Infinity или NaN вместо честного отказа).
    // Верно ли при любой реализации: нет — это явно оговорённое в задании
    // поведение отказа, а не следствие общей формулы.
    expect(fitView({ x: 0, y: 0, width: 0, height: 0 }, 1000, 1000)).toEqual(IDENTITY_VIEW);
    expect(fitView({ x: 0, y: 0, width: 500, height: 500 }, 0, 0)).toEqual(IDENTITY_VIEW);
    // Окно меньше одного зазора — вписывать некуда, тоже отказ.
    expect(fitView({ x: 0, y: 0, width: 500, height: 500 }, 10, 10)).toEqual(IDENTITY_VIEW);
  });

  it('вписывающий масштаб зажат пределами', () => {
    // Что ломает: отсутствие clamp в fitView (крошечное содержимое дало бы
    // масштаб в тысячи раз больше MAX_SCALE).
    const tiny = { x: 0, y: 0, width: 1, height: 1 };
    const view = fitView(tiny, 2000, 2000);
    expect(view.scale).toBe(MAX_SCALE);
  });
});

describe('пространство «Ветки»: езда', () => {
  it('тяга в экранных пикселях даёт разный сдвиг пространства на разном масштабе', () => {
    // Что ломает: пропущенное деление на scale в panBy — величина сдвига
    // тогда не зависела бы от масштаба вовсе (осталась бы 60 на любом).
    // Верно ли при любой реализации: нет — это ФИЗИЧЕСКОЕ свойство «экранная
    // тяга покрывает разное пространство на разных масштабах», названное
    // в задании явно.
    const base: SpaceView = { x: 0, y: 0, scale: 1 };

    const atScale2 = panBy({ ...base, scale: 2 }, 60, 0);
    const atScale05 = panBy({ ...base, scale: 0.5 }, 60, 0);

    expect(Math.abs(atScale2.x - base.x)).toBeCloseTo(30, 9);
    expect(Math.abs(atScale05.x - base.x)).toBeCloseTo(120, 9);
  });

  it('езда «хватанием»: точка под указателем едет ЗА указателем', () => {
    // Что ломает: перепутанный знак (тогда точка бы уезжала ОТ указателя).
    // Верно ли при любой реализации: нет — это и есть определяемая
    // panBy семантика «схватить и потянуть».
    const view: SpaceView = { x: 0, y: 0, scale: 1 };
    const cursor = { x: 100, y: 100 };
    const under = toSpace(view, cursor);

    const after = panBy(view, 50, 0);
    // Та же точка пространства должна теперь рисоваться на 50px правее.
    const nowAt = toScreen(after, under);
    expect(nowAt.x).toBeCloseTo(cursor.x + 50, 9);
    expect(nowAt.y).toBeCloseTo(cursor.y, 9);
  });
});

describe('пространство «Ветки»: разбор колеса', () => {
  it('ctrl или meta — масштаб, коэффициент взаимно обратен по модулю deltaY', () => {
    // Что ломает: коэффициент не экспонента (например линейный «1 + d*k» —
    // тогда factor(d)*factor(-d) !== 1), либо неверный знак (вниз должно
    // уменьшать).
    // Верно ли при любой реализации: нет — прямое требование задания.
    const up = wheelIntent({ deltaX: 0, deltaY: -100, ctrlKey: true, metaKey: false, shiftKey: false });
    const down = wheelIntent({ deltaX: 0, deltaY: 100, ctrlKey: true, metaKey: false, shiftKey: false });
    expect(up.kind).toBe('zoom');
    expect(down.kind).toBe('zoom');
    if (up.kind !== 'zoom' || down.kind !== 'zoom') throw new Error('unreachable');

    expect(up.factor).toBeGreaterThan(1); // прокрутка вверх — приближение
    expect(down.factor).toBeLessThan(1); // прокрутка вниз — отдаление
    expect(up.factor * down.factor).toBeCloseTo(1, 12);

    const metaZoom = wheelIntent({ deltaX: 0, deltaY: -50, ctrlKey: false, metaKey: true, shiftKey: false });
    expect(metaZoom.kind).toBe('zoom');
  });

  it('shift без ctrl/meta — горизонтальная езда из deltaY', () => {
    // Что ломает: перепутанная ось (взяли deltaX вместо deltaY) или
    // ненулевой screenDy.
    const intent = wheelIntent({ deltaX: 0, deltaY: 40, ctrlKey: false, metaKey: false, shiftKey: true });
    expect(intent).toEqual({ kind: 'pan', screenDx: -40, screenDy: 0 });
  });

  it('без модификаторов — обычная езда из deltaX/deltaY', () => {
    const intent = wheelIntent({ deltaX: 5, deltaY: 40, ctrlKey: false, metaKey: false, shiftKey: false });
    expect(intent).toEqual({ kind: 'pan', screenDx: -5, screenDy: -40 });
  });

  it('deltaY > 0, применённый через panBy, двигает содержимое ВВЕРХ', () => {
    // Что ломает: неверный знак разворота в wheelIntent ИЛИ неверный знак
    // в panBy — тест несущий именно потому, что проверяет их СОСТАВ, то
    // есть реальный путь применения (задание требует «содержимое вверх»,
    // а это наблюдаемо только композицией, не отдельной функцией).
    // Верно ли при любой реализации: нет.
    const view: SpaceView = { x: 0, y: 0, scale: 1 };
    const intent = wheelIntent({ deltaX: 0, deltaY: 40, ctrlKey: false, metaKey: false, shiftKey: false });
    expect(intent.kind).toBe('pan');
    if (intent.kind !== 'pan') throw new Error('unreachable');

    const after = panBy(view, intent.screenDx, intent.screenDy);

    // Фиксированная точка пространства теперь рисуется ВЫШЕ (меньший y).
    const fixedPoint = { x: 0, y: 500 };
    const before = toScreen(view, fixedPoint);
    const nowAt = toScreen(after, fixedPoint);
    expect(nowAt.y).toBeLessThan(before.y);
  });
});

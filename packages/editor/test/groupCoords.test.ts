/**
 * Приведение координат ребёнка группы: локальные ↔ сценные.
 *
 * Ребёнок группы хранит `x`/`y` от левого верхнего угла группы, а `rotation`
 * свой собственный (решение владельца 08.08.2026, `groupElements.ts`). Чтобы
 * автор мог зайти внутрь группы и потянуть одну картинку, редактору нужен
 * ребёнок в координатах СЦЕНЫ: там считают попадание указателя, прилипание,
 * рамка выделения и вся арифметика жестов.
 *
 * **Почему тестов две разной природы, а не один круговой.**
 *
 * Круговой тест «в сцену и обратно» проходит и тогда, когда ОБЕ функции
 * ошибаются одинаково: пара «забыли поворот там и забыли поворот тут»
 * остаётся взаимно обратной, и круг сходится. Поэтому рядом стоят проверки
 * с числами, посчитанными РУКАМИ, независимо от кода.
 *
 * **Почему углы всюду ненулевые.** Грабля §13 журнала Сессии 35: тест,
 * названный по свойству, покрывает ровно те слагаемые формулы, которые
 * ненулевые в его данных. Потеря поворота на нулевом угле тождественно
 * невидима — а фикстура `groups.json` целиком состоит из нулевых углов.
 */
import { describe, expect, it } from 'vitest';

import { type Box, childBoxInGroup, childBoxInScene } from '../src/stage/geometry.js';

/** Сравнение с допуском: тригонометрия не обязана давать точные двоичные числа. */
function expectBoxClose(actual: Box, expected: Box): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.width).toBeCloseTo(expected.width, 9);
  expect(actual.height).toBeCloseTo(expected.height, 9);
  expect(actual.rotation).toBeCloseTo(expected.rotation, 9);
}

describe('координаты ребёнка группы: локальные ↔ сценные', () => {
  it('у неповёрнутой группы ребёнок сдвигается на её угол', () => {
    const group: Box = { x: 200, y: 100, width: 400, height: 300, rotation: 0 };
    const child: Box = { x: 40, y: 60, width: 200, height: 120, rotation: 0 };

    expectBoxClose(childBoxInScene(group, child), {
      x: 240,
      y: 160,
      width: 200,
      height: 120,
      rotation: 0,
    });
  });

  /**
   * Числа посчитаны на бумаге, а не снятые с реализации.
   *
   * Группа 200×100 в точке (100,100), центр (200,150), повёрнута на 90°.
   * Ребёнок 20×10 стоит в её левом верхнем углу, локальный центр (10,5),
   * то есть на сцене без учёта поворота — (110,105).
   *
   * Поворот на 90° вокруг (200,150): смещение (−90,−45), cos 0, sin 1.
   *   x = 200 + (−90·0 − (−45)·1) = 245
   *   y = 150 + (−90·1 + (−45)·0) =  60
   * Значит угол бокса — (245−10, 60−5) = (235, 55).
   *
   * Сходится и на пальцах: угол группы (100,100) при повороте на 90° уезжает
   * в (250,50) — то есть в ПРАВЫЙ верхний угол повёрнутой группы, и ребёнок,
   * стоявший в левом верхнем, оказывается там же рядом.
   */
  it('поворот группы несёт ребёнка по окружности вокруг ЕЁ центра', () => {
    const group: Box = { x: 100, y: 100, width: 200, height: 100, rotation: 90 };
    const child: Box = { x: 0, y: 0, width: 20, height: 10, rotation: 0 };

    expectBoxClose(childBoxInScene(group, child), {
      x: 235,
      y: 55,
      width: 20,
      height: 10,
      rotation: 90,
    });
  });

  /**
   * Слагаемое, потерю которого в Сессии 35 не поймал ни один тест, кроме
   * кругового: собственный угол ребёнка обязан СЛОЖИТЬСЯ с углом группы.
   *
   * Здесь он проверяется в лоб и на числах, где потеря заметна: 30 + 17
   * не равно ни 30, ни 17.
   */
  it('углы складываются: поворот группы плюс собственный поворот ребёнка', () => {
    const group: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 30 };
    const child: Box = { x: 10, y: 10, width: 20, height: 20, rotation: 17 };

    expect(childBoxInScene(group, child).rotation).toBeCloseTo(47, 9);
  });

  it('ребёнок в центре повёрнутой группы стоит там же, куда бы её ни повернули', () => {
    // Центр группы — неподвижная точка её собственного поворота. Ребёнок,
    // стоящий ровно в центре, обязан остаться на месте при любом угле;
    // сдвинется — значит поворот считают не вокруг центра.
    const child: Box = { x: 90, y: 40, width: 20, height: 20, rotation: 0 };
    const upright = childBoxInScene(
      { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
      child,
    );
    const turned = childBoxInScene(
      { x: 0, y: 0, width: 200, height: 100, rotation: 73 },
      child,
    );

    expect(turned.x).toBeCloseTo(upright.x, 9);
    expect(turned.y).toBeCloseTo(upright.y, 9);
  });

  it('обратный перевод возвращает ровно исходные локальные координаты', () => {
    // Круговой тест. Углы ненулевые У ОБОИХ: на нулевых он зелен и при
    // полностью выброшенном повороте.
    const group: Box = { x: 317, y: -42, width: 480, height: 260, rotation: 34.5 };
    const child: Box = { x: 63, y: 118, width: 96, height: 71, rotation: -12.25 };

    expectBoxClose(childBoxInGroup(group, childBoxInScene(group, child)), child);
  });

  it('перевод в обратную сторону тоже круговой', () => {
    // Тот же круг с другого конца: если только одна из функций верна,
    // предыдущий тест мог бы сойтись на симметричной ошибке, а этот — нет,
    // потому что стартует с другой стороны пары.
    const group: Box = { x: -80, y: 250, width: 300, height: 300, rotation: -61 };
    const scene: Box = { x: 12, y: 305, width: 40, height: 90, rotation: 8 };

    expectBoxClose(childBoxInScene(group, childBoxInGroup(group, scene)), scene);
  });

  it('сдвиг ребёнка на сцене приходит в локальные координаты повёрнутым назад', () => {
    // Это и есть «поворот дельты на минус угол группы», ради которого план
    // отказался писать отдельную формулу: он обязан ВЫВОДИТЬСЯ из пары.
    // Группа повёрнута на 90°, значит сдвиг вправо по сцене обязан стать
    // сдвигом ВВЕРХ в системе группы.
    const group: Box = { x: 0, y: 0, width: 200, height: 200, rotation: 90 };
    const scene: Box = { x: 50, y: 50, width: 20, height: 20, rotation: 0 };

    const before = childBoxInGroup(group, scene);
    const after = childBoxInGroup(group, { ...scene, x: scene.x + 10 });

    expect(after.x - before.x).toBeCloseTo(0, 9);
    expect(after.y - before.y).toBeCloseTo(-10, 9);
  });
});

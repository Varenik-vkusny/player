/**
 * `reflowGroup` — второй вызывающий `unionBox`, обещанный Сессией 35
 * (план С36 §8): пересчёт охвата группы по её содержимому, когда правка
 * ребёнка (подвинули, растянули, вытащили за край) меняет то, что группа
 * обязана охватывать.
 *
 * **Углы ненулевые У ГРУППЫ И У ДЕТЕЙ намеренно.** Это ровно грабля §13
 * журнала Сессии 35: тест, покрывающий свойство «сохраняет сцену», на
 * данных с нулевым поворотом остаётся зелёным даже при полностью
 * выброшенном угле — слагаемое просто тождественно нулю. Данные пишутся
 * прямо здесь, а не берутся из фикстуры: `groups.json` целиком из нулевых
 * поворотов (план С36 §2, последняя строка).
 */
import { describe, expect, it } from 'vitest';

import { type Box, unionBox } from '../src/stage/geometry.js';
import { reflowGroup } from '../src/state/groupElements.js';

function expectBoxClose(actual: Box, expected: Box, precision = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.width).toBeCloseTo(expected.width, precision);
  expect(actual.height).toBeCloseTo(expected.height, precision);
  expect(actual.rotation).toBeCloseTo(expected.rotation, precision);
}

describe('reflowGroup', () => {
  /**
   * МИНА §8 плана С36: у ПОВЁРНУТОЙ группы пересчёт охвата обязан двигать
   * бокс группы ПОВОРОТОМ вокруг её СТАРОГО центра, а не голым сдвигом.
   *
   * **Почему не круговой тест «сцена до / сцена после».** Первая версия
   * этого теста сравнивала `childBoxInScene(result.group, newChild)`
   * с исходным сценным боксом ребёнка — и оставалась ЗЕЛЁНОЙ даже при
   * полностью выброшенном повороте (проверено сломом). Причина —
   * `childBoxInGroup`/`childBoxInScene` образуют алгебраически точную пару
   * инверсий ДЛЯ ЛЮБОГО бокса группы: подставь в них хоть неверный `group`,
   * композиция «в локаль и обратно на сцену» всё равно вернёт исходный
   * сценный бокс, потому что оба перевода используют один и тот же центр
   * группы для прямого и обратного поворота, и он сокращается. Значит
   * положение и поворот САМОГО бокса группы этим кругом не проверяются
   * вовсе — только то, что пункт 4 применён к какому-то `group`,
   * неважно, к верному или нет. Ловит это исключительно прямая проверка
   * бокса `result.group` числами, посчитанными на бумаге.
   *
   * Группа 200×100 в (0,0), повёрнута на 90°. Один ребёнок 40×60 в углу
   * группы — заполняет охват не целиком, есть что пересчитывать. Центр
   * нового охвата в НЕВРАЩЁННОЙ системе группы: (0+20, 0+30) = (20,30).
   * Центр самой группы: (100,50). Поворот (20,30) на 90° вокруг (100,50)
   * (та же формула, что в `groupCoords.test.ts`): dx=−80,dy=−20,
   * cos90=0,sin90=1 → x=100+(−80·0−(−20·1))=120, y=50+(−80·1+(−20·0))=−30.
   * Новый бокс группы — 40×60 вокруг центра (120,−30): x=120−20=100,
   * y=−30−30=−60.
   */
  it('новый бокс группы получает поворот вокруг СТАРОГО центра, а не голый сдвиг', () => {
    const group: Box = { x: 0, y: 0, width: 200, height: 100, rotation: 90 };
    const child: Box = { x: 0, y: 0, width: 40, height: 60, rotation: 0 };

    const result = reflowGroup(group, [{ id: 'a', box: child }]);
    if (!result) throw new Error('пересчёт обязан был вернуть новый охват: ребёнок меньше группы');

    expectBoxClose(result.group, { x: 100, y: -60, width: 40, height: 60, rotation: 90 });
  });

  /**
   * Охват после пересчёта обязан стать ПЛОТНЫМ: объединение новых локальных
   * боксов детей равно новому боксу группы, поставленному в начало координат.
   * Краснеет, если пункт 4 (пересчёт локальных координат детей ОТ НОВОГО
   * бокса группы) пропущен — тогда старые локальные координаты остаются
   * привязаны к старому охвату, и объединение новых боксов не совпадёт
   * с новым размером группы.
   */
  it('охват после пересчёта плотный: объединение боксов детей равно боксу группы', () => {
    const group: Box = { x: 0, y: 0, width: 100, height: 80, rotation: 40 };
    const childA: Box = { x: 5, y: 5, width: 20, height: 20, rotation: 0 };
    const childB: Box = { x: 150, y: 90, width: 30, height: 30, rotation: 20 };

    const result = reflowGroup(group, [
      { id: 'a', box: childA },
      { id: 'b', box: childB },
    ]);
    if (!result) throw new Error('пересчёт обязан был вернуть новый охват: дети вылезают за исходный бокс');

    const u = unionBox(result.children.map((child) => child.box))!;
    expectBoxClose(u, { x: 0, y: 0, width: result.group.width, height: result.group.height, rotation: 0 }, 3);
  });

  /**
   * Плотному охвату отвечает `undefined` — вызывающий (`endGesture`)
   * обязан отличать «нечего писать» от «пишем то же самое», иначе каждое
   * перетаскивание внутри группы заводило бы пустой шаг истории. Краснеет,
   * если функция пересчитывает вхолостую на любой вызов.
   */
  it('плотному охвату отвечает undefined', () => {
    const group: Box = { x: 500, y: 300, width: 120, height: 90, rotation: 18 };
    // Один ребёнок ровно во весь бокс группы: охват уже {0,0,120,90}.
    const child: Box = { x: 0, y: 0, width: 120, height: 90, rotation: 0 };

    const result = reflowGroup(group, [{ id: 'solo', box: child }]);
    expect(result).toBeUndefined();
  });

  /**
   * Ребёнок, вылезший за край группы, обязан РАСШИРИТЬ её бокс. Краснеет,
   * если охват берётся у самой группы (её текущий width/height), а не
   * у детей — тогда размер после пересчёта совпал бы со старым, хотя
   * `childB` торчит на 70 единиц за правый край и на 30 за нижний.
   */
  it('ребёнок, вылезший за край, расширяет группу', () => {
    const group: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
    const childA: Box = { x: 0, y: 0, width: 60, height: 60, rotation: 0 };
    // Правый край 170, нижний 130 — за пределами исходного бокса 100×100.
    const childB: Box = { x: 130, y: 90, width: 40, height: 40, rotation: 0 };

    const result = reflowGroup(group, [
      { id: 'a', box: childA },
      { id: 'b', box: childB },
    ]);
    if (!result) throw new Error('пересчёт обязан был вернуть новый охват: childB торчит за исходный бокс');

    expect(result.group.width).toBeGreaterThan(group.width);
    expect(result.group.height).toBeGreaterThan(group.height);
    // Охват обязан достать РОВНО до правого и нижнего края childB (170×130
    // в системе, где childA стоял в начале координат) — не больше и не меньше.
    expect(result.group.width).toBeCloseTo(170, 6);
    expect(result.group.height).toBeCloseTo(130, 6);
  });

  it('без детей пересчитывать нечего: undefined', () => {
    const group: Box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
    expect(reflowGroup(group, [])).toBeUndefined();
  });
});

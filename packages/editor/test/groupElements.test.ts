import { describe, expect, it } from 'vitest';

import type { Element, ElementState, Segment, Slide } from '@player/core';

import { groupElements, ungroupElements } from '../src/state/groupElements.js';

function state(overrides: Partial<ElementState> = {}): ElementState {
  return {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 0,
    opacity: 1,
    visible: true,
    flipX: false,
    flipY: false,
    style: {},
    ...overrides,
  };
}

// Без `as Element`: каст спрятал бы расхождение с настоящей формой типа
// ровно там, где тест обязан её знать.
function element(id: string, overrides: Partial<Element> = {}): Element {
  return { id, type: 'shape', content: 'rect', locked: false, ...overrides };
}

function slide(id: string, states: Readonly<Record<string, ElementState>>): Slide {
  return {
    id,
    at: { kind: 'seconds', t: 0 },
    transition: 'morph',
    transitionSeconds: 0.6,
    states,
  };
}

function segment(elements: readonly Element[], slides: readonly Slide[]): Segment {
  return {
    authorSpans: [],
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
    elements: [...elements],
    slides: [...slides],
    gates: [],
    exit: { rules: [], default: null },
  };
}

describe('groupElements', () => {
  it('охват группы равен объединению боксов ВСЕХ детей, а не одного', () => {
    // Краснеет, если охват считать по первому ребёнку: ширина осталась бы
    // 100 (бокс «a»), а не 250, до которых достаёт «b».
    const seg = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', {
          a: state({ x: 0, y: 0, width: 100, height: 100 }),
          b: state({ x: 150, y: 150, width: 100, height: 100 }),
        }),
      ],
    );

    const result = groupElements(seg, ['a', 'b']);
    const groupState = result.slides[0]!.states[result.groupId]!;

    expect(groupState.x).toBe(0);
    expect(groupState.y).toBe(0);
    expect(groupState.width).toBe(250);
    expect(groupState.height).toBe(250);
  });

  it('координаты детей после группировки — локальные, от угла охвата', () => {
    // Краснеет, если угол охвата не вычитать: ребёнок «a» остался бы
    // с x=50 вместо 0, хотя охват начинается ровно в его левом верхнем углу.
    const seg = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', {
          a: state({ x: 50, y: 60, width: 100, height: 80 }),
          b: state({ x: 200, y: 180, width: 40, height: 40 }),
        }),
      ],
    );

    const result = groupElements(seg, ['a', 'b']);
    const groupState = result.slides[0]!.states[result.groupId]!;
    const childA = result.slides[0]!.states['a']!;
    const childB = result.slides[0]!.states['b']!;

    expect(childA.x).toBe(50 - groupState.x);
    expect(childA.y).toBe(60 - groupState.y);
    expect(childB.x).toBe(200 - groupState.x);
    expect(childB.y).toBe(180 - groupState.y);
  });

  it('группа появляется на ВСЕХ слайдах, где есть хотя бы один ребёнок', () => {
    // Краснеет, если состояние группы заводить только на первом слайде:
    // на slide-3 (тоже с детьми) группы бы не было, и следующая загрузка
    // проекта упала бы на проверке схемы «ребёнок без своей группы».
    const seg = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', { a: state(), b: state({ x: 200 }) }),
        slide('slide-2', {}),
        slide('slide-3', { a: state({ x: 10 }), b: state({ x: 220 }) }),
      ],
    );

    const result = groupElements(seg, ['a', 'b']);

    expect(result.slides[0]!.states[result.groupId]).toBeDefined();
    expect(result.slides[2]!.states[result.groupId]).toBeDefined();
  });

  it('слайд без единого ребёнка не трогается вовсе', () => {
    // Краснеет, если группу заводить на всех слайдах без разбора:
    // slide-2 не только получил бы состояние группы, но и перестал бы
    // быть ТЕМ ЖЕ объектом — значит любой потребитель, сравнивающий
    // слайды по ссылке, решил бы, что слайд изменился, хотя ничего
    // в нём не изменилось.
    const seg = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', { a: state(), b: state({ x: 200 }) }),
        slide('slide-2', {}),
      ],
    );
    const originalSlide2 = seg.slides[1]!;

    const result = groupElements(seg, ['a', 'b']);

    expect(result.slides[1]).toBe(originalSlide2);
    expect(Object.keys(result.slides[1]!.states)).toHaveLength(0);
  });

  it('zIndex группы — МАКСИМУМ zIndex детей, а не минимум', () => {
    // Краснеет, если взять минимум: группа легла бы на месте нижнего
    // ребёнка (zIndex 2), а не верхнего (zIndex 7) — верхний ребёнок
    // сменил бы видимый слой относительно чужих элементов между ними.
    const seg = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', {
          a: state({ zIndex: 2 }),
          b: state({ x: 200, zIndex: 7 }),
        }),
      ],
    );

    const result = groupElements(seg, ['a', 'b']);
    const groupState = result.slides[0]!.states[result.groupId]!;

    expect(groupState.zIndex).toBe(7);
  });

  it('порядок братьев в elements сохранён, а не развёрнут', () => {
    // Краснеет, если массив детей развернуть перед вставкой: «b» оказался
    // бы перед «a», хотя в исходном сегменте «a» шёл первым, — а порядок
    // братьев решает спор при попадании указателя.
    const seg = segment(
      [element('a'), element('b')],
      [slide('slide-1', { a: state(), b: state({ x: 200 }) })],
    );

    const result = groupElements(seg, ['a', 'b']);
    const ids = result.elements.map((el) => el.id);
    const indexA = ids.indexOf('a');
    const indexB = ids.indexOf('b');

    expect(indexA).toBeGreaterThanOrEqual(0);
    expect(indexB).toBeGreaterThan(indexA);
  });

  it('группа встаёт на место первого группируемого, чужой элемент между детьми уезжает наружу', () => {
    const seg = segment(
      [element('x'), element('a'), element('y'), element('b'), element('z')],
      [slide('slide-1', { a: state(), b: state({ x: 200 }) })],
    );

    const result = groupElements(seg, ['a', 'b']);
    const ids = result.elements.map((el) => el.id);

    expect(ids).toEqual(['x', result.groupId, 'a', 'b', 'y', 'z']);
  });

  it('группировка ОДНОГО элемента роняет', () => {
    // Краснеет, если убрать проверку числа: группа из одного элемента
    // тихо бы собралась, хотя ничего не объединяет.
    const seg = segment([element('a')], [slide('slide-1', { a: state() })]);

    expect(() => groupElements(seg, ['a'])).toThrow(/минимум из двух/);
  });

  it('группировка ребёнка чужой группы роняет', () => {
    // Краснеет, если убрать проверку parentId: элемент уехал бы во вторую
    // группу сразу, оставаясь по ссылке в первой — уже собранные данные
    // разъехались бы со схемой, которая такое не допускает.
    const seg = segment(
      [element('group-1', { type: 'group' }), element('a', { parentId: 'group-1' }), element('b')],
      [slide('slide-1', { 'group-1': state(), a: state(), b: state({ x: 200 }) })],
    );

    expect(() => groupElements(seg, ['a', 'b'])).toThrow(/group-1/);
  });
});

describe('ungroupElements', () => {
  function grouped(): { seg: Segment; groupId: string } {
    const built = groupElements(
      segment(
        [element('a'), element('b')],
        [slide('slide-1', { a: state({ x: 10, y: 20 }), b: state({ x: 120, y: 20, width: 50 }) })],
      ),
      ['a', 'b'],
    );
    return {
      seg: segment(built.elements, built.slides),
      groupId: built.groupId,
    };
  }

  it('разборка возвращает детям координаты СЦЕНЫ, а не оставляет локальными', () => {
    // Краснеет, если не прибавлять x/y группы: ребёнок остался бы со
    // своими локальными координатами (0, 0 у «a»), хотя стоит на 10,20
    // сцены.
    const { seg, groupId } = grouped();

    const result = ungroupElements(seg, groupId);
    const childA = result.slides[0]!.states['a']!;

    expect(childA.x).toBe(10);
    expect(childA.y).toBe(20);
  });

  it('разборка ПОВЁРНУТОЙ группы ставит детей туда же, где их видел зритель', () => {
    // Краснеет, если считать без поворота простым сложением x + группа.x:
    // при повороте группы на 90° это дало бы координаты, где ребёнок
    // никогда не был виден, — угол определяет ГДЕ на экране стоит бокс,
    // а не только развёрнут ли он на месте.
    const seg = segment(
      [element('group-1', { type: 'group' }), element('a', { parentId: 'group-1' })],
      [
        slide('slide-1', {
          'group-1': state({ x: 100, y: 100, width: 200, height: 100, rotation: 90 }),
          a: state({ x: 0, y: 0, width: 40, height: 20 }),
        }),
      ],
    );

    const result = ungroupElements(seg, 'group-1');
    const childA = result.slides[0]!.states['a']!;

    // Центр ребёнка в координатах сцены ДО поворота: угол группы (100,100)
    // плюс локальный центр ребёнка (20,10) = (120,110). Центр группы:
    // (100+100, 100+50) = (200,150). dx=120-200=-80, dy=110-150=-40.
    // cos90≈0, sin90=1 → x' = 200 + (-80*0 - (-40)*1) = 240
    //                     y' = 150 + (-80*1 + (-40)*0) = 70
    // Левый верхний угол ребёнка (40×20): x = 240-20=220, y = 70-10=60.
    expect(childA.x).toBeCloseTo(220, 6);
    expect(childA.y).toBeCloseTo(60, 6);
    expect(childA.rotation).toBe(90);

    // Простое сложение (слом «без поворота») дало бы x=100, y=100 — далеко
    // от верного ответа, проверяем, что мы НЕ получили его.
    expect(childA.x).not.toBeCloseTo(100, 6);
  });

  it('после разборки у детей нет ключа parentId вовсе, а не значения undefined', () => {
    // Краснеет, если заменить `delete` на `parentId: undefined`: ключ
    // остаётся у объекта, `Object.hasOwn` вернул бы true, хотя должен
    // вернуть false, — и `JSON.stringify` по-разному унёс бы это поле
    // в разных местах кода.
    const { seg, groupId } = grouped();

    const result = ungroupElements(seg, groupId);
    const childA = result.elements.find((el) => el.id === 'a')!;

    expect(Object.hasOwn(childA, 'parentId')).toBe(false);
  });

  it('несуществующий или не-group id роняет', () => {
    const seg = segment([element('a')], [slide('slide-1', { a: state() })]);

    expect(() => ungroupElements(seg, 'ghost')).toThrow(/ghost/);
    expect(() => ungroupElements(seg, 'a')).toThrow(/a/);
  });

  it('сборка и разборка подряд возвращают исходные состояния (круговой тест)', () => {
    // Ловит рассогласование формул `groupElements` и `ungroupElements`
    // между собой, а не каждой по отдельности: одностороннего теста на
    // это не хватит — обе формулы могут быть красивыми и симметрично
    // неверными.
    const original = segment(
      [element('a'), element('b')],
      [
        slide('slide-1', {
          a: state({ x: 30, y: 40, width: 100, height: 60, rotation: 15, zIndex: 3 }),
          b: state({ x: 260, y: 90, width: 50, height: 50, zIndex: 1 }),
        }),
      ],
    );

    const built = groupElements(original, ['a', 'b']);
    const afterGroup = segment(built.elements, built.slides);
    const dismantled = ungroupElements(afterGroup, built.groupId);

    const beforeA = original.slides[0]!.states['a']!;
    const beforeB = original.slides[0]!.states['b']!;
    const afterA = dismantled.slides[0]!.states['a']!;
    const afterB = dismantled.slides[0]!.states['b']!;

    expect(afterA.x).toBeCloseTo(beforeA.x, 6);
    expect(afterA.y).toBeCloseTo(beforeA.y, 6);
    expect(afterA.rotation).toBeCloseTo(beforeA.rotation, 6);
    expect(afterA.zIndex).toBe(beforeA.zIndex);

    expect(afterB.x).toBeCloseTo(beforeB.x, 6);
    expect(afterB.y).toBeCloseTo(beforeB.y, 6);
    expect(afterB.zIndex).toBe(beforeB.zIndex);

    // Группы в собранном виде уже нет: ungroup — обратная операция целиком.
    expect(dismantled.elements.find((el) => el.id === built.groupId)).toBeUndefined();
  });
});

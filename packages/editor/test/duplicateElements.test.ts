import { describe, expect, it } from 'vitest';

import type { Element, ElementState, Segment } from '@player/core';

import { duplicateElements } from '../src/state/duplicateElements.js';

const STAGE = { width: 1920, height: 1080 };

function state(overrides: Partial<ElementState> = {}): ElementState {
  return {
    x: 100,
    y: 100,
    width: 200,
    height: 80,
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

function segment(elements: readonly Element[]): Segment {
  return {
    id: 'seg-1',
    title: '',
    description: '',
    audio: { src: 'a.mp3', offset: 0, duration: 10, words: [] },
    elements: [...elements],
    slides: [
      {
        id: 'slide-1',
        at: { kind: 'seconds', t: 0 },
        transition: 'morph',
        transitionSeconds: 0.6,
        states: {},
      },
    ],
    gates: [],
    exit: { rules: [], default: null },
  };
}

describe('duplicateElements', () => {
  it('копия получает имя того же семейства, а не суффикс поверх суффикса', () => {
    // Краснеет, если имя считать своим разбором id вместо prefixOf:
    // получилось бы «circle-3-1», а копия копии — «circle-3-1-1».
    //
    // Проверяется СВОЙСТВО, а не конкретный номер: номер выдаёт freeId,
    // и он берёт первый свободный, а не следующий за максимальным. Ждать
    // здесь «circle-4» значило бы закрепить придуманную семантику имён
    // вместо той, по которой уже работают копия куска и вставка слайда.
    const result = duplicateElements(
      segment([element('circle-3')]),
      ['circle-3'],
      { 'circle-3': state() },
      STAGE,
    );

    const id = result.elements[0]!.id;
    expect(id).toMatch(/^circle-\d+$/);
    expect(id).not.toBe('circle-3');
  });

  it('две копии за ОДИН жест получают РАЗНЫЕ имена', () => {
    // Несущий тест. Краснеет, если выданные имена не копятся по ходу:
    // freeId дважды посмотрел бы на один и тот же список занятых и выдал
    // одно имя обеим копиям, а редьюсер на таком id бросает. То есть
    // Ctrl+D по двум выделенным падал бы, а по одному работал.
    const result = duplicateElements(
      segment([element('circle-1'), element('circle-2')]),
      ['circle-1', 'circle-2'],
      { 'circle-1': state(), 'circle-2': state({ y: 300 }) },
      STAGE,
    );

    const ids = result.elements.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).toEqual(['circle-3', 'circle-4']);
  });

  it('копия сдвинута от оригинала по обеим осям', () => {
    // Краснеет, если сдвиг забыт: копия легла бы ровно на оригинал
    // и была бы неотличима от «Ctrl+D не сработал».
    const result = duplicateElements(
      segment([element('text-1')]),
      ['text-1'],
      { 'text-1': state({ x: 100, y: 100 }) },
      STAGE,
    );

    const copy = Object.values(result.states)[0]!;
    expect(copy.x).toBeGreaterThan(100);
    expect(copy.y).toBeGreaterThan(100);
  });

  it('копия у края сцены прижимается к сцене, а не уезжает за край', () => {
    // Краснеет, если сдвиг применён без withinStage: копия объекта,
    // стоящего вплотную к правому нижнему углу, уехала бы за границу,
    // где её не выделить мышью — выглядит как пропавшая.
    const result = duplicateElements(
      segment([element('text-1')]),
      ['text-1'],
      { 'text-1': state({ x: 1920 - 200, y: 1080 - 80 }) },
      STAGE,
    );

    const copy = Object.values(result.states)[0]!;
    expect(copy.x).toBe(1920 - 200);
    expect(copy.y).toBe(1080 - 80);
  });

  it('элемент без состояния на слайде пропускается, а не копируется пустым', () => {
    // Краснеет, если состояние брать не проверяя: копия получила бы
    // undefined вместо состояния, и проект перестал бы грузиться —
    // причём не сейчас, а при следующей загрузке.
    const result = duplicateElements(
      segment([element('text-1'), element('text-2')]),
      ['text-1', 'text-2'],
      { 'text-1': state() },
      STAGE,
    );

    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]!.id).toBe('text-3');
  });

  it('элемента нет в сегменте — падает громко и здесь', () => {
    // Краснеет, если ошибку проглотить: испорченное выделение уехало бы
    // дальше и всплыло непроходящей проверкой схемы далеко от причины.
    expect(() =>
      duplicateElements(segment([]), ['ghost-1'], { 'ghost-1': state() }, STAGE),
    ).toThrow(/ghost-1/);
  });

  it('стиль копии — СВОЙ объект, а не общая ссылка с оригиналом', () => {
    // Краснеет, если стиль присвоить ссылкой: правка цвета копии молча
    // перекрасила бы оригинал, и в модели это выглядело бы правильным.
    const original = state({ style: { fill: '#ff0000' } });
    const result = duplicateElements(
      segment([element('rect-1')]),
      ['rect-1'],
      { 'rect-1': original },
      STAGE,
    );

    const copy = Object.values(result.states)[0]!;
    expect(copy.style).toEqual(original.style);
    expect(copy.style).not.toBe(original.style);
  });

  it('копии ложатся поверх всего, сохраняя относительный порядок слоёв', () => {
    // Краснеет, если порядок брать из порядка ВЫДЕЛЕНИЯ: копии трёх
    // наложенных фигур легли бы в другом порядке, чем оригиналы, —
    // видно глазом на перекрывающихся объектах.
    const states = {
      'a-1': state({ zIndex: 5 }),
      'b-1': state({ zIndex: 2 }),
    };
    const result = duplicateElements(
      segment([element('a-1'), element('b-1')]),
      // Порядок выделения нарочно обратен порядку слоёв.
      ['a-1', 'b-1'],
      states,
      STAGE,
    );

    const copyOfB = result.states[result.elements[0]!.id]!;
    const copyOfA = result.states[result.elements[1]!.id]!;
    // Нижний остался ниже верхнего, и оба выше всего, что было на слайде.
    expect(copyOfB.zIndex).toBeLessThan(copyOfA.zIndex);
    expect(copyOfB.zIndex).toBeGreaterThan(5);
  });
});

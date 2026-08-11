import { describe, expect, it } from 'vitest';

import type { Element, ElementState, Segment } from '@player/core';

import { copyElementsToClipboard, pasteElements } from '../src/state/elementClipboard.js';

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

function segment(id: string, elements: readonly Element[]): Segment {
  return {
    id,
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

describe('copyElementsToClipboard: снимок, а не ссылка', () => {
  it('состояние копируется вглубь: правка оригинала не меняет буфер', () => {
    /*
     * Слом: положить в буфер `item.state` как есть. Автор копирует объект,
     * потом красит оригинал в другой цвет — и вставляет НОВЫЙ цвет, хотя
     * копировал старый. В модели это выглядело бы правильным: ссылка одна,
     * значения совпадают.
     */
    const original = state({ style: { color: 'red' } });
    const source = segment('seg-1', [element('rect-1')]);
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], { 'rect-1': original });

    original.style['color'] = 'blue';

    expect(clipboard.items[0]!.state.style['color']).toBe('red');
  });

  it('элемент без состояния на слайде пропускается, а не роняет', () => {
    // Отсутствие в `states` означает «элемента здесь нет» — копировать
    // нечего. Выделить такой элемент автор может из списка элементов.
    const source = segment('seg-1', [element('rect-1'), element('rect-2')]);
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1', 'rect-2'], {
      'rect-1': state(),
    });

    expect(clipboard.items).toHaveLength(1);
    expect(clipboard.items[0]!.element.id).toBe('rect-1');
  });

  it('элемента нет в сегменте вовсе — падение громкое и здесь', () => {
    // Это уже испорченные данные: молчание увело бы падение в загрузку
    // следующей сессии, где причину уже не найти.
    const source = segment('seg-1', [element('rect-1')]);
    expect(() =>
      copyElementsToClipboard(source, 'slide-1', ['rect-9'], { 'rect-9': state() }),
    ).toThrow(/rect-9/);
  });

  it('запоминает, откуда копировали: часть и слайд', () => {
    const source = segment('seg-1', [element('rect-1')]);
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], { 'rect-1': state() });
    expect(clipboard.sourceSegmentId).toBe('seg-1');
    expect(clipboard.sourceSlideId).toBe('slide-1');
  });
});

describe('pasteElements: вставка в ДРУГУЮ часть', () => {
  const source = segment('seg-1', [element('rect-1')]);
  const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], {
    'rect-1': state({ x: 300, y: 200, style: { color: 'red' } }),
  });

  it('координаты сохраняются РОВНО: перенос, а не «примерно туда»', () => {
    /*
     * Несущее свойство всей задачи. Слом: применить `DUPLICATE_OFFSET`
     * безусловно — заголовок, перенесённый из части в часть, встал бы
     * на 40 единиц ниже и правее, и автор двигал бы его руками ровно так же,
     * как до появления буфера.
     */
    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);

    const placed = Object.values(made.states)[0]!;
    expect(placed.x).toBe(300);
    expect(placed.y).toBe(200);
  });

  it('сдвиг НЕ применяется, даже если слайд называется так же', () => {
    /*
     * Мина: `freeId('slide', ...)` раздаёт имена внутри своего сегмента,
     * поэтому `slide-1` есть в КАЖДОЙ части. Сравнение одного лишь слайда
     * дало бы сдвиг при вставке в чужую часть — тихо и правдоподобно.
     *
     * Слом: убрать из условия сравнение `sourceSegmentId` — тест краснеет,
     * потому что координата станет 340 вместо 300.
     */
    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);
    expect(Object.values(made.states)[0]!.x).toBe(300);
  });

  it('заводит НОВЫЙ элемент, даже когда id свободен', () => {
    /*
     * Отличие от таблицы ADR-025, по которой работает буфер СЛАЙДОВ:
     * там свободный id переиспользуется. Здесь вставка обязана давать
     * новый объект — иначе «вставить дважды» дало бы один элемент.
     */
    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);
    expect(made.elements).toHaveLength(1);
    expect(made.elements[0]!.id).toMatch(/^rect-\d+$/);
  });

  it('занятый id не перезаписывается: вставка не трогает чужой объект', () => {
    /*
     * Слом: переиспользовать совпавший id, как это делает `pasteSlide`.
     * Автор вставил бы копию поверх такого же объекта и увидел бы, что
     * ничего не появилось, зато существующий уехал на новое место.
     */
    const target = segment('seg-2', [element('rect-1')]);
    const made = pasteElements(target, 'slide-1', clipboard, { 'rect-1': state() }, STAGE);

    expect(made.elements[0]!.id).not.toBe('rect-1');
    expect(Object.keys(made.states)).not.toContain('rect-1');
  });

  it('стиль отвязан: покрасив вставленное, оригинал не красим', () => {
    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);
    const placed = Object.values(made.states)[0]!;

    placed.style['color'] = 'green';

    expect(clipboard.items[0]!.state.style['color']).toBe('red');
  });

  it('вставка дважды даёт ДВА разных элемента, а не один', () => {
    // Буфер не опустошается вставкой — значит второй Ctrl+V обязан работать.
    const target = segment('seg-2', []);
    const first = pasteElements(target, 'slide-1', clipboard, {}, STAGE);
    const grown: Segment = { ...target, elements: [...target.elements, ...first.elements] };
    const second = pasteElements(grown, 'slide-1', clipboard, first.states, STAGE);

    expect(second.elements[0]!.id).not.toBe(first.elements[0]!.id);
  });
});

describe('pasteElements: вставка в ТОТ ЖЕ слайд', () => {
  it('сдвигается, иначе копия неотличима от «Ctrl+V не сработал»', () => {
    const source = segment('seg-1', [element('rect-1')]);
    const states = { 'rect-1': state({ x: 300, y: 200 }) };
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], states);

    const made = pasteElements(source, 'slide-1', clipboard, states, STAGE);
    const placed = Object.values(made.states)[0]!;

    expect(placed.x).toBe(340);
    expect(placed.y).toBe(240);
  });

  it('на ДРУГОЙ слайд той же части сдвига нет', () => {
    // Слайд — другой кадр, объект там не с чем спутать.
    const source = segment('seg-1', [element('rect-1')]);
    const states = { 'rect-1': state({ x: 300, y: 200 }) };
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], states);

    const made = pasteElements(source, 'slide-2', clipboard, {}, STAGE);
    expect(Object.values(made.states)[0]!.x).toBe(300);
  });
});

describe('pasteElements: группы и слои', () => {
  it('parentId СБРАСЫВАЕТСЯ: ссылка на группу чужой части не переносится', () => {
    /*
     * Мина, найденная грепом схемы (журнал §2). `SegmentSchema` требует,
     * чтобы `parentId` указывал на элемент типа `group` ТОГО ЖЕ сегмента.
     * Перенеся ссылку, мы собрали бы проект, не проходящий собственную
     * проверку при следующей загрузке, — а редактор всё это время
     * показывал бы исправную картинку.
     *
     * Слом: копировать элемент целиком (`{ ...item.element, id }`) —
     * `parentId` останется, и тест покраснеет.
     */
    const source = segment('seg-1', [
      element('group-1', { type: 'group' }),
      element('rect-1', { parentId: 'group-1' }),
    ]);
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], {
      'rect-1': state(),
    });

    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);

    expect(made.elements[0]!.parentId).toBeUndefined();
    expect('parentId' in made.elements[0]!).toBe(false);
  });

  it('пачка ложится ПОВЕРХ того, что уже лежит на слайде-получателе', () => {
    /*
     * Слой считается по состояниям ПОЛУЧАТЕЛЯ, а не источника. Слом:
     * подставить в `placeCopies` состояния источника — вставленное легло бы
     * под уже лежащим там, и автор искал бы объект, которого «не появилось».
     */
    const source = segment('seg-1', [element('rect-1')]);
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['rect-1'], {
      'rect-1': state({ zIndex: 0 }),
    });

    const target = segment('seg-2', [element('other-1')]);
    const made = pasteElements(target, 'slide-1', clipboard, { 'other-1': state({ zIndex: 7 }) }, STAGE);

    expect(Object.values(made.states)[0]!.zIndex).toBe(8);
  });

  it('взаимный порядок пачки сохраняется по слою, а не по порядку выделения', () => {
    const source = segment('seg-1', [element('a-1'), element('b-1')]);
    const states = { 'a-1': state({ zIndex: 5 }), 'b-1': state({ zIndex: 1 }) };
    // Порядок ids намеренно обратный слою — так выделяет рамка.
    const clipboard = copyElementsToClipboard(source, 'slide-1', ['a-1', 'b-1'], states);

    const target = segment('seg-2', []);
    const made = pasteElements(target, 'slide-1', clipboard, {}, STAGE);

    const byId = new Map(made.elements.map((item) => [item.id, made.states[item.id]!.zIndex]));
    const lower = [...byId.entries()].find(([id]) => id.startsWith('b-'))![1];
    const upper = [...byId.entries()].find(([id]) => id.startsWith('a-'))![1];
    expect(lower).toBeLessThan(upper);
  });

  it('пустой буфер даёт пустой результат, а не бросок', () => {
    const target = segment('seg-2', []);
    const made = pasteElements(
      target,
      'slide-1',
      { sourceSegmentId: 'seg-1', sourceSlideId: 'slide-1', items: [] },
      {},
      STAGE,
    );
    expect(made.elements).toHaveLength(0);
  });
});

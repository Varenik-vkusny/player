/**
 * Правило сопоставления соседних слайдов (ADR-015).
 *
 * Проверяется здесь, а не в браузере, потому что это модель, а не картинка:
 * «кто едет, кто приходит, кто уходит» — чистая функция от двух наборов
 * состояний. Ошибка в ней даёт правдоподобное движение неправильных
 * элементов, а такое глазом не ловится.
 */
import { describe, expect, it } from 'vitest';
import type { ElementState } from '@player/core';

import { layoutStatesFor, morphSecondsFor, planMorph, MORPH_DURATION_S } from '@player/player';

function state(patch: Partial<ElementState> = {}): ElementState {
  return {
    x: 0, y: 0, width: 100, height: 100,
    rotation: 0, zIndex: 0, opacity: 1, visible: true,
    style: {},
    ...patch,
  };
}

describe('planMorph: кто едет, кто приходит, кто уходит', () => {
  it('элемент есть в обоих слайдах — едет', () => {
    const plan = planMorph(['a'], { a: state({ x: 0 }) }, { a: state({ x: 500 }) });
    expect(plan).toHaveLength(1);
    expect(plan[0]!.role).toBe('moves');
    expect(plan[0]!.from!.x).toBe(0);
    expect(plan[0]!.to!.x).toBe(500);
  });

  it('элемент только в следующем — приходит, ехать неоткуда', () => {
    const plan = planMorph(['a'], {}, { a: state() });
    expect(plan[0]!.role).toBe('enters');
    expect(plan[0]!.from).toBeUndefined();
  });

  it('элемент только в предыдущем — уходит', () => {
    const plan = planMorph(['a'], { a: state() }, {});
    expect(plan[0]!.role).toBe('leaves');
    expect(plan[0]!.to).toBeUndefined();
  });

  it('элемента нет ни там, ни там — он в переходе не участвует', () => {
    const plan = planMorph(['a'], {}, {});
    expect(plan[0]!.role).toBe('absent');
  });

  /**
   * Самая дорогая пара случаев во всём переходе.
   *
   * `visible: false → true` — это ЕДЕТ, а не ПРИХОДИТ: позиция известна
   * и сохранена, элемент проявляется на своём месте и может одновременно
   * двигаться. Отсутствие в states — приходит, предыдущей позиции нет
   * вовсе. Спутать их — значит либо оживить элемент, которому ехать
   * неоткуда, либо отнять движение у того, кто должен ехать.
   */
  it('скрытый на предыдущем слайде — едет, а не приходит', () => {
    const plan = planMorph(
      ['a'],
      { a: state({ x: 0, visible: false }) },
      { a: state({ x: 500, visible: true }) },
    );
    expect(plan[0]!.role).toBe('moves');
    expect(plan[0]!.from!.x).toBe(0);
  });

  it('порядок ответа задаётся порядком элементов сегмента, а не обходом объекта', () => {
    // Ключи объекта намеренно в обратном порядке: рендер обязан быть
    // детерминированным, а порядок ключей зависит от того, как их положили.
    const next = { b: state(), a: state() };
    const plan = planMorph(['a', 'b'], {}, next);
    expect(plan.map((part) => part.id)).toEqual(['a', 'b']);
  });
});

describe('layoutStatesFor: раскладка на время перехода', () => {
  it('уходящий остаётся на своём прежнем месте, пока гаснет', () => {
    const plan = planMorph(['gone'], { gone: state({ x: 42 }) }, {});
    expect(layoutStatesFor(plan)['gone']!.x).toBe(42);
  });

  it('едущий и приходящий встают сразу в конечный бокс — FLIP двигает трансформацию', () => {
    const plan = planMorph(
      ['mover', 'comer'],
      { mover: state({ x: 0 }) },
      { mover: state({ x: 900 }), comer: state({ x: 300 }) },
    );
    const layout = layoutStatesFor(plan);
    expect(layout['mover']!.x).toBe(900);
    expect(layout['comer']!.x).toBe(300);
  });

  it('элемента, которого нет ни на одном из слайдов, в раскладке нет вовсе', () => {
    const plan = planMorph(['ghost'], {}, {});
    expect(Object.keys(layoutStatesFor(plan))).toEqual([]);
  });
});

describe('morphSecondsFor: расписание перехода', () => {
  it('первому слайду ехать неоткуда', () => {
    expect(morphSecondsFor('morph', 0, [0, 1])).toBe(0);
  });

  it('cut — намеренный разрыв, длительности нет', () => {
    expect(morphSecondsFor('cut', 1, [0, 1, 2])).toBe(0);
  });

  it('обычный переход длится столько, сколько положено', () => {
    expect(morphSecondsFor('morph', 1, [0, 1, 2])).toBe(MORPH_DURATION_S);
  });

  /**
   * Урезание по расстоянию до следующего слайда — не оптимизация.
   * Переход, переживший смену слайда, начал бы следующий не с текущей
   * картинки, а с состояния прошлого слайда: скачок назад ровно тогда,
   * когда зритель смотрит на движение.
   */
  it('переход не переживает следующий слайд: урезается по расстоянию до него', () => {
    expect(morphSecondsFor('morph', 1, [0, 1, 1.2])).toBeCloseTo(0.2, 10);
  });

  it('последнему слайду урезать не по чему', () => {
    expect(morphSecondsFor('morph', 2, [0, 1, 2])).toBe(MORPH_DURATION_S);
  });
});

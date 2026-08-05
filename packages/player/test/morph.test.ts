/**
 * Правило сопоставления соседних слайдов (ADR-015).
 *
 * Проверяется здесь, а не в браузере, потому что это модель, а не картинка:
 * «кто едет, кто приходит, кто уходит» — чистая функция от двух наборов
 * состояний. Ошибка в ней даёт правдоподобное движение неправильных
 * элементов, а такое глазом не ловится.
 */
import { describe, expect, it } from 'vitest';
import { ANIMATABLE, TRANSITIONS } from '@player/core';
import type { ElementState } from '@player/core';

import {
  layoutStatesFor,
  morphSecondsFor,
  phaseAt,
  planMorph,
  TECHNIQUE_PROPS,

  type SlideSchedule,
} from '@player/player';

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
    expect(morphSecondsFor('morph', 0.6, 0, [0, 1])).toBe(0);
  });

  it('cut — намеренный разрыв, длительности нет', () => {
    expect(morphSecondsFor('cut', 0.6, 1, [0, 1, 2])).toBe(0);
  });

  it('длительность берётся из слайда, а не из константы', () => {
    // До v9 число было одно на весь продукт (MORPH_DURATION_S = 0.6).
    // Теперь его несёт слайд, и функция обязана слушать именно его:
    // иначе поле схемы существует, а на картинку не влияет.
    expect(morphSecondsFor('morph', 0.3, 1, [0, 1, 2])).toBe(0.3);
    expect(morphSecondsFor('morph', 1.5, 1, [0, 1, 2])).toBe(1);
  });

  it('обычный переход длится столько, сколько положено', () => {
    expect(morphSecondsFor('morph', 0.6, 1, [0, 1, 2])).toBe(0.6);
  });

  /**
   * Урезание по расстоянию до ПРЕДЫДУЩЕЙ метки — не оптимизация (ADR-020).
   * Окно кончается на метке; начавшись раньше предыдущей, оно наложилось бы
   * на чужой переход и стартовало бы не с той картинки, что на экране.
   */
  it('переход не залезает за предыдущую метку: урезается по расстоянию до неё', () => {
    expect(morphSecondsFor('morph', 0.6, 2, [0, 1, 1.2])).toBeCloseTo(0.2, 10);
  });

  it('следующий слайд на урезание больше не влияет', () => {
    // Слайды 1 и 2 стоят вплотную, но переход К слайду 1 меряется отрезком
    // 0 → 1, а не 1 → 1.2. До разворота здесь было 0.2.
    expect(morphSecondsFor('morph', 0.6, 1, [0, 1, 1.2])).toBe(0.6);
  });
});

/**
 * Расписание целиком: где сцена равна снимку, а где едет.
 *
 * Проверяется отдельно от `SlideEngine`, потому что это правило времени,
 * а не работа с узлами. Ошибка здесь даёт правдоподобную картинку
 * на неправильной секунде — то, чего скриншот на другой секунде не увидит.
 */
describe('phaseAt: где снимок, а где движение', () => {
  /** Метки 0, 1, 2 с переходом 0.6 к каждой, кроме первой. */
  const schedule: readonly SlideSchedule[] = [
    { seconds: 0, morphSeconds: 0 },
    { seconds: 1, morphSeconds: 0.6 },
    { seconds: 2, morphSeconds: 0.6 },
  ];

  it('на метке слайда сцена равна снимку, а не едет к нему', () => {
    // Ради этого разворот и делался: метка объявляет «здесь сцена равна
    // снимку N», и в момент метки утверждение обязано быть истинным.
    expect(phaseAt(schedule, 1)).toEqual({ kind: 'still', index: 1 });
    expect(phaseAt(schedule, 2)).toEqual({ kind: 'still', index: 2 });
  });

  it('окно кончается на метке, а начинается за длительность до неё', () => {
    expect(phaseAt(schedule, 0.5)).toEqual({ kind: 'morph', index: 1 });
    expect(phaseAt(schedule, 0.999)).toEqual({ kind: 'morph', index: 1 });
  });

  it('ровно на начале окна перехода ещё нет: оба конца открыты', () => {
    expect(phaseAt(schedule, 0.4)).toEqual({ kind: 'still', index: 0 });
  });

  it('между переходами сцена стоит на снимке', () => {
    expect(phaseAt(schedule, 0.2)).toEqual({ kind: 'still', index: 0 });
  });

  it('до первой метки и после последней движения нет', () => {
    expect(phaseAt(schedule, 0)).toEqual({ kind: 'still', index: 0 });
    expect(phaseAt(schedule, 9)).toEqual({ kind: 'still', index: 2 });
  });

  it('срез окна не даёт вовсе', () => {
    const cut: readonly SlideSchedule[] = [
      { seconds: 0, morphSeconds: 0 },
      { seconds: 1, morphSeconds: 0 },
    ];
    expect(phaseAt(cut, 0.5)).toEqual({ kind: 'still', index: 0 });
    expect(phaseAt(cut, 1)).toEqual({ kind: 'still', index: 1 });
  });

  /**
   * Соседние окна не могут наложиться: урезание по предыдущей метке —
   * то самое правило, которое это гарантирует.
   */
  it('плотно стоящие слайды дают короткие окна, но не наложение', () => {
    const dense: readonly SlideSchedule[] = [
      { seconds: 0, morphSeconds: 0 },
      { seconds: 1, morphSeconds: morphSecondsFor('morph', 0.6, 1, [0, 1, 1.2]) },
      { seconds: 1.2, morphSeconds: morphSecondsFor('morph', 0.6, 2, [0, 1, 1.2]) },
    ];
    expect(phaseAt(dense, 1)).toEqual({ kind: 'still', index: 1 });
    expect(phaseAt(dense, 1.1)).toEqual({ kind: 'morph', index: 2 });
    expect(phaseAt(dense, 1.2)).toEqual({ kind: 'still', index: 2 });
  });
});

/**
 * `TECHNIQUE_PROPS`: состав CSS-свойств каждого приёма.
 *
 * `buildMorph` требует живых `HTMLElement`, которых в юнит-окружении нет
 * (`vitest.config.ts` → `environment: 'node'`) — таблица данных остаётся
 * единственным местом, где состав свойств приёма вообще проверяем.
 */
describe('TECHNIQUE_PROPS: инвариант №8 — свойство приёма, а не кода', () => {
  it('каждый приём анимирует только разрешённые инвариантом №8 свойства', () => {
    for (const technique of TRANSITIONS) {
      for (const property of TECHNIQUE_PROPS[technique]) {
        expect(ANIMATABLE).toContain(property);
      }
    }
  });

  it('срез не анимирует ничего', () => {
    expect(TECHNIQUE_PROPS.cut).toEqual([]);
  });

  it('таблица покрывает перечисление целиком', () => {
    // Не «длина восемь»: приём, забытый в таблице, дал бы пустой список,
    // и первая проверка прошла бы по нему ВПУСТУЮ — пустое множество
    // не содержит запрещённых свойств по построению.
    expect(Object.keys(TECHNIQUE_PROPS).sort()).toEqual([...TRANSITIONS].sort());
  });
});

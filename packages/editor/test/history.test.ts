import { describe, expect, it } from 'vitest';

import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  push,
  redo,
  undo,
  type History,
} from '../src/state/history.js';

// Состояния — простые объекты, а не числа: так проверка «по ссылке, не по
// значению» из требований (push того же значения не создаёт шаг, но
// value-равный, но другой по ссылке объект — создаёт) вообще имеет смысл.
interface State {
  readonly v: number;
}

function state(v: number): State {
  return { v };
}

describe('createHistory', () => {
  it('начинается пустой: нечего ни отменять, ни повторять', () => {
    const initial = state(0);
    const history = createHistory(initial);

    expect(history.past).toEqual([]);
    expect(history.present).toBe(initial);
    expect(history.future).toEqual([]);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });
});

describe('push', () => {
  it('делает next текущим состоянием, старое уходит в past', () => {
    const a = state(1);
    const b = state(2);
    const history = push(createHistory(a), b);

    expect(history.present).toBe(b);
    expect(history.past).toEqual([a]);
  });

  it('очищает future — правка после отмены убивает возможность повтора', () => {
    const a = state(1);
    const b = state(2);
    const c = state(3);

    let history = createHistory(a);
    history = push(history, b);
    history = undo(history); // present снова a, future = [b]
    expect(history.future).toEqual([b]);

    history = push(history, c);

    expect(history.present).toBe(c);
    expect(history.future).toEqual([]);
    expect(canRedo(history)).toBe(false);
  });

  it('push того же объекта, что уже в present (по ссылке), не создаёт шаг', () => {
    const a = state(1);
    const history = createHistory(a);

    const result = push(history, a);

    expect(result).toBe(history);
    expect(result.past).toEqual([]);
  });

  it('push value-равного, но другого по ссылке объекта — шаг создаёт (сравнение строго по ===)', () => {
    const a = state(1);
    const aCopy = state(1); // тот же .v, другая ссылка
    const history = createHistory(a);

    const result = push(history, aCopy);

    expect(result).not.toBe(history);
    expect(result.present).toBe(aCopy);
    expect(result.past).toEqual([a]);
  });
});

describe('undo/redo: 20+ шагов подряд туда и обратно', () => {
  // 25 состояний — больше минимума задания (20), чтобы запас проверки
  // не совпадал случайно с каким-нибудь округлением реализации.
  const states = Array.from({ length: 25 }, (_, index) => state(index));

  function buildHistory(): History<State> {
    let history = createHistory(states[0]!);
    for (let i = 1; i < states.length; i += 1) {
      history = push(history, states[i]!);
    }
    return history;
  }

  it('после всех push present — последнее состояние, past — все предыдущие по порядку', () => {
    const history = buildHistory();
    expect(history.present).toBe(states[states.length - 1]);
    expect(history.past).toEqual(states.slice(0, -1));
    expect(history.future).toEqual([]);
  });

  it('25 undo подряд возвращают ровно те состояния, что были, в обратном порядке', () => {
    let history = buildHistory();

    // Идём от последнего состояния к первому: после k-го undo present
    // обязан быть states[states.length - 1 - k].
    for (let k = 1; k < states.length; k += 1) {
      history = undo(history);
      expect(history.present).toBe(states[states.length - 1 - k]);
    }

    // Отменили всё, кроме самого первого состояния — дальше отменять нечего.
    expect(history.present).toBe(states[0]);
    expect(canUndo(history)).toBe(false);
  });

  it('после полной отмены 24 redo подряд возвращают состояния в прямом порядке', () => {
    let history = buildHistory();
    for (let k = 0; k < states.length - 1; k += 1) {
      history = undo(history);
    }
    expect(history.present).toBe(states[0]);

    for (let k = 1; k < states.length; k += 1) {
      history = redo(history);
      expect(history.present).toBe(states[k]);
    }

    expect(history.present).toBe(states[states.length - 1]);
    expect(canRedo(history)).toBe(false);
  });

  it('вперемешку: несколько undo, несколько redo — состояния совпадают с последовательностью, а не только с конечной точкой', () => {
    let history = buildHistory(); // present = states[24]

    history = undo(history); // 23
    history = undo(history); // 22
    history = undo(history); // 21
    expect(history.present).toBe(states[21]);

    history = redo(history); // 22
    expect(history.present).toBe(states[22]);

    history = undo(history); // 21
    history = undo(history); // 20
    expect(history.present).toBe(states[20]);
  });
});

describe('переполнение кольца на 50 шагов', () => {
  it('после 60 push доступно ровно 50 отмен, старые потеряны, present верный', () => {
    let history = createHistory(state(0));
    for (let i = 1; i <= 60; i += 1) {
      history = push(history, state(i));
    }

    expect(history.present).toEqual(state(60));
    expect(history.past.length).toBe(HISTORY_LIMIT);

    // Самый старый оставшийся шаг — state(10): всего было 60 состояний
    // past (0..59), кольцо держит последние 50 из них (10..59).
    expect(history.past[0]).toEqual(state(10));
    expect(history.past[history.past.length - 1]).toEqual(state(59));

    // Ровно 50 undo доводят до state(10) и ни шагом дальше.
    let steps = 0;
    while (canUndo(history)) {
      history = undo(history);
      steps += 1;
    }
    expect(steps).toBe(HISTORY_LIMIT);
    expect(history.present).toEqual(state(10));
  });

  it('HISTORY_LIMIT равен 50 — минимум задания 20, взят с запасом', () => {
    expect(HISTORY_LIMIT).toBe(50);
  });
});

describe('undo/redo на границе', () => {
  it('undo на пустой истории возвращает тот же объект по ссылке, не бросает', () => {
    const history = createHistory(state(0));
    expect(() => undo(history)).not.toThrow();
    expect(undo(history)).toBe(history);
  });

  it('redo без future возвращает тот же объект по ссылке, не бросает', () => {
    const history = push(createHistory(state(0)), state(1));
    expect(() => redo(history)).not.toThrow();
    expect(redo(history)).toBe(history);
  });

  it('redo сразу после createHistory (без единого push) — тоже no-op', () => {
    const history = createHistory(state(0));
    expect(redo(history)).toBe(history);
  });
});

describe('undo → redo → undo даёт то же, что просто undo', () => {
  it('состояния и структура past/future совпадают', () => {
    let base = createHistory(state(0));
    base = push(base, state(1));
    base = push(base, state(2));
    base = push(base, state(3));

    const direct = undo(base);
    const roundTrip = undo(redo(undo(base)));

    expect(roundTrip.present).toBe(direct.present);
    expect(roundTrip.past).toEqual(direct.past);
    expect(roundTrip.future).toEqual(direct.future);
  });
});

describe('canUndo / canRedo', () => {
  it('отражают наличие шагов в past и future', () => {
    let history = createHistory(state(0));
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);

    history = push(history, state(1));
    expect(canUndo(history)).toBe(true);
    expect(canRedo(history)).toBe(false);

    history = undo(history);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(true);
  });
});

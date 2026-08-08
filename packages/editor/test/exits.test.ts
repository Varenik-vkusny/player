import { describe, expect, it } from 'vitest';

import { ProjectSchema, SCHEMA_VERSION, ThemeSchema } from '@player/core';
import type { Condition, ExitRule, Gate, Project, Segment } from '@player/core';

import { editorReducer, initialState } from '../src/state/project.js';
import { historyReducer, initialHistoryState } from '../src/state/editorHistory.js';
import {
  addSegment,
  connect,
  disconnect,
  emptySegments,
  leadsBack,
  reachableFrom,
  removeSegment,
  renameSegment,
  renameVariable,
  uncoveredOutcomes,
} from '../src/state/exits.js';

/**
 * Правила выхода сегментов в редакторе: создание/удаление/переименование
 * сегментов, правила выхода между ними и вопрос «что из этого достижимо
 * и что не покрыто». Чистая логика, без React и DOM — так же, как её сосед
 * `project.test.ts`. Было `graph.test.ts` про рёбра гейтов версии 2.
 */

function segment(id: string, overrides: Partial<Segment> = {}): Segment {
  return {
    id,
    title: '',
    description: '',
    audio: { src: `audio/${id}.mp3`, offset: 0, duration: 10, words: [] },
    elements: [],
    slides: [{ id: `${id}-slide`, at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
    gates: [],
    exit: { rules: [], default: null },
    ...overrides,
  };
}

function choiceGate(id: string, optionIds: readonly string[]): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    config: {
      kind: 'choice',
      prompt: 'Вопрос',
      options: optionIds.map((optionId) => ({ id: optionId, label: optionId })),
      correctId: optionIds[0]!,
    },
    onWrong: 'continue',
    maxAttempts: null,
    recordAs: id,
  };
}

function verdictGate(id: string): Gate {
  return {
    id,
    at: { kind: 'seconds', t: 1 },
    config: { kind: 'input', prompt: 'Вопрос', accept: ['да'], caseSensitive: false },
    onWrong: 'continue',
    maxAttempts: null,
    recordAs: id,
  };
}

function rule(id: string, when: Condition, goto: string): ExitRule {
  return { id, when: [when], goto };
}

function project(segments: readonly Segment[], entry = 'seg-1'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Тест', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry,
    segments: [...segments],
  };
}

/**
 * Имя переменной задаёт автор (`product.md` §2в [Р]).
 *
 * Опасность здесь не в самом переименовании, а в том, что правило выхода
 * ссылается на переменную ПО ИМЕНИ и может жить в другом сегменте. Не пройти
 * каскадом — значит оставить правило, которое не сработает никогда, и узнать
 * об этом от зрителя, а не от проверки.
 */
describe('renameVariable', () => {
  /** Вопрос во второй части, правило выхода — в первой: имя живёт на всё объяснение. */
  function crossSegment(): Project {
    const asking = segment('seg-2', { gates: [choiceGate('q1', ['a', 'b'])] });
    const deciding = segment('seg-1', {
      exit: {
        rules: [rule('rule-1', { kind: 'equals', variable: 'q1', value: 'a' }, 'seg-2')],
        default: 'seg-2',
      },
    });
    return project([deciding, asking]);
  }

  it('переименование доходит до правила выхода в ДРУГОЙ части', () => {
    const next = renameVariable(crossSegment(), 'q1', 'знает про дроби');

    expect(next.segments[1]!.gates[0]!.recordAs).toBe('знает про дроби');
    expect(next.segments[0]!.exit.rules[0]!.when).toEqual([{
      kind: 'equals',
      variable: 'знает про дроби',
      value: 'a',
    }]);
  });

  it('каскад накрывает все три вида условия, а не только equals', () => {
    const asking = segment('seg-2', { gates: [verdictGate('q1')] });
    const deciding = segment('seg-1', {
      exit: {
        rules: [
          rule('rule-1', { kind: 'correct', variable: 'q1' }, 'seg-2'),
          rule('rule-2', { kind: 'wrong', variable: 'q1' }, 'seg-3'),
        ],
        default: 'seg-2',
      },
    });
    const p = project([deciding, asking, segment('seg-3')]);

    const next = renameVariable(p, 'q1', 'ответил верно');

    expect(next.segments[0]!.exit.rules.map((r) => r.when)).toEqual([
      [{ kind: 'correct', variable: 'ответил верно' }],
      [{ kind: 'wrong', variable: 'ответил верно' }],
    ]);
  });

  it('чужие правила не трогаются: переименовано ровно одно имя', () => {
    const asking = segment('seg-2', {
      gates: [choiceGate('q1', ['a', 'b']), choiceGate('q2', ['c', 'd'])],
    });
    const deciding = segment('seg-1', {
      exit: {
        rules: [
          rule('rule-1', { kind: 'equals', variable: 'q1', value: 'a' }, 'seg-2'),
          rule('rule-2', { kind: 'equals', variable: 'q2', value: 'c' }, 'seg-2'),
        ],
        default: 'seg-2',
      },
    });

    const next = renameVariable(project([deciding, asking]), 'q1', 'первый');

    expect(next.segments[0]!.exit.rules[1]!.when).toEqual([{
      kind: 'equals',
      variable: 'q2',
      value: 'c',
    }]);
  });

  it('занятое имя отвергается громко и ДО записи', () => {
    const p = project([
      segment('seg-1', { gates: [choiceGate('q1', ['a', 'b']), choiceGate('q2', ['c', 'd'])] }),
    ]);

    expect(() => renameVariable(p, 'q1', 'q2')).toThrow(/уже пишет/);
    // Проект не тронут: падение произошло до правки, а не посередине.
    expect(p.segments[0]!.gates[0]!.recordAs).toBe('q1');
  });

  it('пустое имя и имя с краевыми пробелами отвергаются: схема их не примет', () => {
    const p = project([segment('seg-1', { gates: [choiceGate('q1', ['a', 'b'])] })]);

    expect(() => renameVariable(p, 'q1', '   ')).toThrow(/пустым/);
    expect(() => renameVariable(p, 'q1', ' имя ')).toThrow(/пробел/);
  });

  it('несуществующая остановка отвергается громко', () => {
    const p = project([segment('seg-1', { gates: [choiceGate('q1', ['a', 'b'])] })]);
    expect(() => renameVariable(p, 'ghost', 'имя')).toThrow(/ghost/);
  });

  it('переименование в то же имя ничего не меняет и не падает', () => {
    const p = crossSegment();
    expect(renameVariable(p, 'q1', 'q1')).toBe(p);
  });

  it('результат остаётся валидным проектом по схеме', () => {
    const next = renameVariable(crossSegment(), 'q1', 'знает про дроби');
    expect(() => ProjectSchema.parse(next)).not.toThrow();
  });
});

/**
 * Пустая ветка — незавершённое состояние, а не валидное (`product.md` §2б [Р]).
 * Решение было принято документом, проверки не существовало: ветка рождается
 * пустой по построению разреза, и без проверки автор мог опубликовать
 * объяснение, где зритель проваливается в никуда.
 */
describe('emptySegments', () => {
  it('свежая ветка после разреза пуста: ни элементов, ни своих слайдов, ни остановок', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    expect(emptySegments(p).map((s) => s.id)).toEqual(['seg-1', 'seg-2']);
  });

  it('часть с элементом пустой не считается — автор уже что-то положил', () => {
    const filled = segment('seg-2', {
      elements: [{ id: 'title', type: 'text', content: 'Разбор', locked: false }],
    });
    expect(emptySegments(project([segment('seg-1'), filled])).map((s) => s.id)).toEqual(['seg-1']);
  });

  it('часть со вторым слайдом пустой не считается: сцена меняется во времени', () => {
    const withSlides = segment('seg-2', {
      slides: [
        { id: 's-0', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} },
        { id: 's-1', at: { kind: 'seconds', t: 2 }, transition: 'morph', transitionSeconds: 0.6, states: {} },
      ],
    });
    expect(emptySegments(project([segment('seg-1'), withSlides])).map((s) => s.id)).toEqual(['seg-1']);
  });

  it('часть с остановкой пустой не считается: зрителя там о чём-то спрашивают', () => {
    const asking = segment('seg-2', { gates: [choiceGate('q1', ['a', 'b'])] });
    expect(emptySegments(project([segment('seg-1'), asking])).map((s) => s.id)).toEqual(['seg-1']);
  });

  it('нулевой слайд сам по себе пустоты не отменяет: он обязателен по схеме', () => {
    // Слайд на нуле есть у КАЖДОЙ части — считать его содержимым значило бы
    // не найти ни одной пустой ветки никогда.
    const p = project([segment('seg-1')]);
    expect(p.segments[0]!.slides).toHaveLength(1);
    expect(emptySegments(p)).toHaveLength(1);
  });
});

describe('addSegment', () => {
  it('даёт свободный id, не сталкивается с существующими', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    const { segment: created } = addSegment(p, 'seg-1');
    expect(created.id).toBe('segment-1');
  });

  it('новый сегмент — концовка: без правил выхода, без элементов, с одним слайдом на нуле', () => {
    const p = project([segment('seg-1')]);
    const { segment: created } = addSegment(p, 'seg-1');
    expect(created.exit).toEqual({ rules: [], default: null });
    expect(created.elements).toEqual([]);
    expect(created.slides).toHaveLength(1);
    expect(created.slides[0]!.at).toEqual({ kind: 'seconds', t: 0 });
  });

  it('дорожка та же по ссылке, что у источника', () => {
    const p = project([segment('seg-1')]);
    const { segment: created } = addSegment(p, 'seg-1');
    expect(created.audio).toBe(p.segments[0]!.audio);
  });

  it('заголовок — «Сегмент N» по порядковому номеру нового сегмента', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    const { segment: created } = addSegment(p, 'seg-1');
    expect(created.title).toBe('Сегмент 3');
  });

  it('остальные сегменты остаются теми же объектами по ссылке', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    const { project: next } = addSegment(p, 'seg-1');
    expect(next.segments[0]).toBe(p.segments[0]);
    expect(next.segments[1]).toBe(p.segments[1]);
  });

  it('источника дорожки нет — бросает', () => {
    const p = project([segment('seg-1')]);
    expect(() => addSegment(p, 'ghost')).toThrow(/ghost/);
  });
});

describe('removeSegment', () => {
  it('снимает правила выхода, ведущие в удалённый сегмент, у остальных', () => {
    const p = project([
      segment('seg-1', { exit: { rules: [], default: 'seg-2' } }),
      segment('seg-2'),
    ]);
    const next = removeSegment(p, 'seg-2');
    expect(next.segments.map((s) => s.id)).toEqual(['seg-1']);
    expect(next.segments[0]!.exit.default).toBeNull();
  });

  it('снимает правила выхода (rules), а не только default', () => {
    const p = project([
      segment('seg-1', {
        exit: { rules: [rule('r1', { kind: 'correct', variable: 'v' }, 'seg-2')], default: null },
      }),
      segment('seg-2'),
    ]);
    const next = removeSegment(p, 'seg-2');
    expect(next.segments[0]!.exit.rules).toEqual([]);
  });

  it('удаление стартового сегмента бросает', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    expect(() => removeSegment(p, 'seg-1')).toThrow(/seg-1/);
  });

  it('удаление несуществующего сегмента бросает', () => {
    const p = project([segment('seg-1')]);
    expect(() => removeSegment(p, 'ghost')).toThrow(/ghost/);
  });

  it('неизменившиеся сегменты остаются теми же объектами по ссылке', () => {
    const p = project([
      segment('seg-1'),
      segment('seg-2', { exit: { rules: [], default: 'seg-3' } }),
      segment('seg-3'),
    ]);
    const next = removeSegment(p, 'seg-3');
    expect(next.segments.find((s) => s.id === 'seg-1')).toBe(p.segments[0]);
  });
});

describe('renameSegment', () => {
  it('меняет title, не трогая остальное', () => {
    const p = project([segment('seg-1')]);
    const next = renameSegment(p, 'seg-1', 'Вступление');
    expect(next.segments[0]!.title).toBe('Вступление');
  });

  it('тот же title — no-op по ссылке', () => {
    const p = project([segment('seg-1', { title: 'Вступление' })]);
    expect(renameSegment(p, 'seg-1', 'Вступление')).toBe(p);
  });

  it('несуществующий сегмент бросает', () => {
    expect(() => renameSegment(project([segment('seg-1')]), 'ghost', 'X')).toThrow(/ghost/);
  });
});

describe('connect', () => {
  it('добавляет правило выхода сегмента', () => {
    const p = project([
      segment('seg-1', { gates: [verdictGate('g1')] }),
      segment('seg-2'),
    ]);
    const next = connect(p, 'seg-1', [{ kind: 'correct', variable: 'g1' }], 'seg-2');
    const rules = next.segments[0]!.exit.rules;
    expect(rules.length).toBe(1);
    expect(rules[0]!.goto).toBe('seg-2');
  });

  it('сегмента-источника нет — бросает', () => {
    const p = project([segment('seg-1')]);
    expect(() => connect(p, 'ghost', [{ kind: 'correct', variable: 'g1' }], 'seg-1')).toThrow(/ghost/);
  });

  it('сегмента назначения нет — бросает', () => {
    const p = project([segment('seg-1', { gates: [verdictGate('g1')] })]);
    expect(() => connect(p, 'seg-1', [{ kind: 'correct', variable: 'g1' }], 'ghost')).toThrow(/ghost/);
  });

  it('переменную не пишет ни один гейт — бросает', () => {
    const p = project([segment('seg-1'), segment('seg-2')]);
    expect(() => connect(p, 'seg-1', [{ kind: 'correct', variable: 'ghost' }], 'seg-2')).toThrow(/ghost/);
  });

  it('переменная гейта вида continue и условие equals — бросает: сравнивать значение не с чем', () => {
    const p = project([
      segment('seg-1', {
        gates: [
          {
            id: 'g1',
            at: { kind: 'seconds', t: 1 },
            config: { kind: 'continue', label: 'Дальше' },
            onWrong: 'retry',
            maxAttempts: null,
            recordAs: 'g1',
          },
        ],
      }),
      segment('seg-2'),
    ]);
    expect(() => connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'x' }], 'seg-2')).toThrow(/g1/);
  });

  it('переменную, записанную гейтом ДРУГОГО сегмента, можно использовать', () => {
    const p = project([
      segment('seg-1', { gates: [verdictGate('g1')] }),
      segment('seg-2'),
    ]);
    // Правило выхода seg-2 ссылается на переменную, которую пишет гейт seg-1.
    const next = connect(p, 'seg-2', [{ kind: 'correct', variable: 'g1' }], 'seg-1');
    expect(next.segments[1]!.exit.rules).toHaveLength(1);
  });

  /**
   * Гипотеза из брифа задачи 11 (`task-11-brief.md`, шаг 1): ребро назад,
   * возможно, уже работает, потому что `connect` проверяет только
   * существование цели, а не её место в списке. Проверено здесь: `s-a` идёт
   * первым и уже привёл зрителя в `s-b` через `default`, а `s-b` заводит
   * правило выхода ОБРАТНО в `s-a` — то самое ребро, на котором стоит
   * механика повтора куска (`player/src/repeat.ts`). Схема результат
   * принимает — запрета на такие рёбра в проекте нет и не будет:
   * они законны (constraints.md).
   */
  it('правило выхода может вести назад, к уже пройденному куску', () => {
    // default у s-b уже указывает назад в s-a: totality (schema.ts) не про
    // это правило, а про весь выход целиком, и держать её честной — не то,
    // что здесь проверяется. Проверяется ровно одно: connect не отказывает
    // ПРАВИЛУ, ведущему назад, только потому что оно ведёт назад.
    const p = project(
      [
        segment('s-a', { exit: { rules: [], default: 's-b' } }),
        segment('s-b', { gates: [choiceGate('v', ['yes', 'no'])], exit: { rules: [], default: 's-a' } }),
      ],
      's-a',
    );

    const next = connect(p, 's-b', [{ kind: 'equals', variable: 'v', value: 'no' }], 's-a');

    expect(next.segments.find((s) => s.id === 's-b')!.exit.rules[0]!.goto).toBe('s-a');
    expect(ProjectSchema.safeParse(next).success).toBe(true);
  });
});

describe('disconnect', () => {
  it('снимает правило выхода', () => {
    const p = project([
      segment('seg-1', {
        gates: [verdictGate('g1')],
        exit: { rules: [rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-1')], default: null },
      }),
    ]);
    const next = disconnect(p, 'seg-1', 'r1');
    expect(next.segments[0]!.exit.rules).toEqual([]);
  });

  it('несуществующее правило бросает', () => {
    const p = project([segment('seg-1')]);
    expect(() => disconnect(p, 'seg-1', 'ghost')).toThrow(/ghost/);
  });

  it('несуществующий сегмент бросает', () => {
    const p = project([segment('seg-1')]);
    expect(() => disconnect(p, 'ghost', 'r1')).toThrow(/ghost/);
  });
});

describe('reachableFrom', () => {
  it('находит недостижимый сегмент — не включает его', () => {
    const p = project([
      segment('seg-1', { exit: { rules: [], default: 'seg-2' } }),
      segment('seg-2'),
      segment('seg-3'),
    ]);
    const reachable = reachableFrom(p);
    expect(reachable.has('seg-1')).toBe(true);
    expect(reachable.has('seg-2')).toBe(true);
    expect(reachable.has('seg-3')).toBe(false);
  });

  it('не зацикливается на цикле', () => {
    const p = project([
      segment('seg-1', { exit: { rules: [], default: 'seg-2' } }),
      segment('seg-2', { exit: { rules: [], default: 'seg-1' } }),
    ]);
    const reachable = reachableFrom(p);
    expect(reachable).toEqual(new Set(['seg-1', 'seg-2']));
  });

  it('включает старт, даже если у него нет правил выхода', () => {
    const p = project([segment('seg-1')]);
    expect(reachableFrom(p).has('seg-1')).toBe(true);
  });

  it('принимает произвольный старт, а не только project.entry', () => {
    const p = project([
      segment('seg-1', { exit: { rules: [], default: 'seg-2' } }),
      segment('seg-2'),
      segment('seg-3'),
    ]);
    expect(reachableFrom(p, 'seg-3')).toEqual(new Set(['seg-3']));
  });

  it('учитывает и rules, и default одновременно', () => {
    const p = project([
      segment('seg-1', {
        gates: [verdictGate('g1')],
        exit: { rules: [rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-2')], default: 'seg-3' },
      }),
      segment('seg-2'),
      segment('seg-3'),
    ]);
    expect(reachableFrom(p)).toEqual(new Set(['seg-1', 'seg-2', 'seg-3']));
  });
});

/**
 * Подсказка автору в `<select>` цели правила выхода (`SegmentPanel.tsx`):
 * цели, из которых можно вернуться в текущую часть, помечены словом «повтор».
 * «Назад» здесь значит НЕ «раньше по списку сегментов» (список не задаёт
 * порядок проигрывания, граф не дерево), а «достижимо обратно по рёбрам
 * выхода» — переиспользует обход `reachableFrom`, второй обход того же
 * графа завёл бы отдельную, тихо расходящуюся копию.
 */
describe('leadsBack', () => {
  it('ведёт назад: из цели по рёбрам выхода можно дойти до текущей части', () => {
    const p = project([
      segment('s-a'),
      segment('s-b', { exit: { rules: [], default: 's-a' } }),
    ]);
    expect(leadsBack(p, 's-a', 's-b')).toBe(true);
  });

  it('ведёт вперёд: из цели до текущей части не дойти — это не повтор', () => {
    const p = project([segment('s-a'), segment('s-b')]);
    expect(leadsBack(p, 's-a', 's-b')).toBe(false);
  });

  it('петля на месте (цель — сама текущая часть) — тоже повтор', () => {
    const p = project([segment('s-a')]);
    expect(leadsBack(p, 's-a', 's-a')).toBe(true);
  });
});

describe('uncoveredOutcomes', () => {
  /**
   * Долг §12.2, закрытый в Сессии 17.
   *
   * Правило выхода вправе смотреть на переменную, записанную гейтом ДРУГОЙ
   * части (`collectVariables` собирает их по всему проекту). Пока сигнатура
   * была `(segment, gates)`, очевидный вызов `(segment, segment.gates)` такой
   * гейт не находил, выпадал в общую ветку и сообщал о недостающих вердиктах —
   * то есть панель показывала дыру там, где схема проект принимает.
   *
   * Тест ловит именно это: обе ветки гейта покрыты, дыр быть не должно.
   * На старой сигнатуре он вернул бы запись про недостающие 'correct'/'wrong'.
   */
  it('переменная записана гейтом ДРУГОЙ части — дыры нет, гейт ищется по всему проекту', () => {
    const withGate = segment('seg-1', { gates: [choiceGate('g1', ['a', 'b'])] });
    const consumer = segment('seg-2', {
      gates: [],
      exit: {
        rules: [
          rule('r1', { kind: 'equals', variable: 'g1', value: 'a' }, 'seg-1'),
          rule('r2', { kind: 'equals', variable: 'g1', value: 'b' }, 'seg-1'),
        ],
        default: null,
      },
    });

    expect(uncoveredOutcomes(project([withGate, consumer]), 'seg-2')).toEqual([]);
  });

  it('default задан — дыр нет', () => {
    const s = segment('seg-1', {
      gates: [choiceGate('g1', ['a', 'b'])],
      exit: { rules: [rule('r1', { kind: 'equals', variable: 'g1', value: 'a' }, 'seg-1')], default: 'seg-1' },
    });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([]);
  });

  it('правил нет вовсе — дыр нет (выхода просто ещё нет, не дефект покрытия)', () => {
    const s = segment('seg-1', { gates: [choiceGate('g1', ['a', 'b'])] });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([]);
  });

  it('частично покрытые варианты choice — дыра', () => {
    const s = segment('seg-1', {
      gates: [choiceGate('g1', ['a', 'b', 'c'])],
      exit: { rules: [rule('r1', { kind: 'equals', variable: 'g1', value: 'a' }, 'seg-1')], default: null },
    });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([{ variable: 'g1', optionIds: ['b', 'c'], verdicts: [] }]);
  });

  it('все варианты choice покрыты equals-правилами — дыры нет', () => {
    const s = segment('seg-1', {
      gates: [choiceGate('g1', ['a', 'b'])],
      exit: {
        rules: [
          rule('r1', { kind: 'equals', variable: 'g1', value: 'a' }, 'seg-1'),
          rule('r2', { kind: 'equals', variable: 'g1', value: 'b' }, 'seg-1'),
        ],
        default: null,
      },
    });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([]);
  });

  it('оба вердикта correct+wrong на одной переменной — дыры нет, даже для choice', () => {
    const s = segment('seg-1', {
      gates: [choiceGate('g1', ['a', 'b'])],
      exit: {
        rules: [
          rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-1'),
          rule('r2', { kind: 'wrong', variable: 'g1' }, 'seg-1'),
        ],
        default: null,
      },
    });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([]);
  });

  it('гейт-ввод: только correct без wrong — дыра verdicts: [wrong]', () => {
    const s = segment('seg-1', {
      gates: [verdictGate('g1')],
      exit: { rules: [rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-1')], default: null },
    });
    expect(uncoveredOutcomes(project([s]), s.id)).toEqual([{ variable: 'g1', optionIds: [], verdicts: ['wrong'] }]);
  });

  it('несколько переменных без default — дыра, даже если каждая по отдельности покрыта полностью', () => {
    const s = segment('seg-1', {
      gates: [verdictGate('g1'), verdictGate('g2')],
      exit: {
        rules: [
          rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-1'),
          rule('r2', { kind: 'wrong', variable: 'g1' }, 'seg-1'),
          rule('r3', { kind: 'correct', variable: 'g2' }, 'seg-1'),
          rule('r4', { kind: 'wrong', variable: 'g2' }, 'seg-1'),
        ],
        default: null,
      },
    });
    expect(uncoveredOutcomes(project([s]), s.id).length).toBeGreaterThan(0);
  });
});

/**
 * Перекрёстная проверка против НАСТОЯЩЕГО валидатора, а не против себя.
 *
 * `connect` и `uncoveredOutcomes` повторяют правила схемы своим кодом. У копии
 * и оригинала одна и та же возможная ошибка: если я понял правило неверно,
 * мои тесты сойдутся с моим же пониманием и промолчат. Поэтому здесь
 * результат правок редактора отдаётся `ProjectSchema` — тому самому коду,
 * который откажется загружать проект у автора.
 */
describe('согласие со схемой: дыра в панели ⇔ отказ валидатора', () => {
  function saveable(p: Project): boolean {
    return ProjectSchema.safeParse(p).success;
  }

  function twoOptionProject(): Project {
    return project([
      segment('seg-1', { gates: [choiceGate('g1', ['a', 'b'])] }),
      segment('seg-2'),
    ]);
  }

  it('покрыты оба варианта — дыр нет и схема принимает', () => {
    let p = twoOptionProject();
    p = connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'a' }], 'seg-2');
    p = connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'b' }], 'seg-2');

    expect(uncoveredOutcomes(p, p.segments[0]!.id)).toEqual([]);
    expect(saveable(p)).toBe(true);
  });

  it('покрыт один вариант из двух — дыра есть и схема отказывает', () => {
    let p = twoOptionProject();
    p = connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'a' }], 'seg-2');

    expect(uncoveredOutcomes(p, p.segments[0]!.id)).toEqual([
      { variable: 'g1', optionIds: ['b'], verdicts: [] },
    ]);
    expect(saveable(p)).toBe(false);
  });

  it('гейт без правил — дыры нет, и схема действительно принимает', () => {
    const p = twoOptionProject();
    expect(uncoveredOutcomes(p, p.segments[0]!.id)).toEqual([]);
    expect(saveable(p)).toBe(true);
  });

  it('снятое правило возвращает и дыру, и отказ схемы', () => {
    let p = twoOptionProject();
    p = connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'a' }], 'seg-2');
    p = connect(p, 'seg-1', [{ kind: 'equals', variable: 'g1', value: 'b' }], 'seg-2');
    const full = p;
    p = disconnect(p, 'seg-1', full.segments[0]!.exit.rules[1]!.id);

    expect(uncoveredOutcomes(p, p.segments[0]!.id)).toHaveLength(1);
    expect(saveable(p)).toBe(false);
  });
});

describe('редьюсер: переключение сегмента и создание сегмента', () => {
  function twoSegments(): Project {
    return project([segment('seg-1'), segment('seg-2')]);
  }

  it('selectSegment не создаёт шаг истории — history тот же объект по ссылке', () => {
    const state = initialHistoryState(twoSegments());
    const next = historyReducer(state, { type: 'selectSegment', id: 'seg-2' });
    expect(next.history).toBe(state.history);
    expect(next.currentSegmentId).toBe('seg-2');
  });

  it('addSegment создаёт шаг истории', () => {
    const state = initialHistoryState(project([segment('seg-1')]));
    const next = historyReducer(state, { type: 'addSegment' });
    expect(next.history).not.toBe(state.history);
    expect(next.history.past).toEqual([state.history.present]);
    expect(next.currentSegmentId).not.toBe(state.currentSegmentId);
  });

  it('undo после addSegment возвращает currentSegmentId в стартовый сегмент', () => {
    const state = initialHistoryState(project([segment('seg-1')]));
    const created = historyReducer(state, { type: 'addSegment' });
    const undone = historyReducer(created, { type: 'undo' });
    expect(undone.currentSegmentId).toBe('seg-1');
  });
});

describe('editorReducer: connect/disconnect через действия', () => {
  it('connect добавляет правило текущему сегменту', () => {
    const p = project([
      segment('seg-1', { gates: [verdictGate('g1')] }),
      segment('seg-2'),
    ]);
    const state = initialState(p);
    const next = editorReducer(state, { type: 'connect', when: [{ kind: 'correct', variable: 'g1' }], goto: 'seg-2' });
    expect(next.project.segments[0]!.exit.rules).toHaveLength(1);
  });

  it('disconnect снимает правило текущего сегмента', () => {
    const p = project([
      segment('seg-1', {
        gates: [verdictGate('g1')],
        exit: { rules: [rule('r1', { kind: 'correct', variable: 'g1' }, 'seg-1')], default: null },
      }),
    ]);
    const state = initialState(p);
    const next = editorReducer(state, { type: 'disconnect', ruleId: 'r1' });
    expect(next.project.segments[0]!.exit.rules).toEqual([]);
  });
});

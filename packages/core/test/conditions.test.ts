/**
 * Язык условий версии 5: цепочка через И, `≠` и сравнение с числом.
 *
 * Проверяется не «схема приняла», а «означает то, что обещано»: правило
 * с двумя условиями обязано срабатывать РОВНО когда подошли оба, а сравнение
 * с числом — молчать там, где числа нет. Валидность не равна достижимости,
 * и именно этот разрыв здесь и ловится. → ADR-019
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { conditionHolds, conditionsHold, nextSegment, findSegment } from '../src/graph.js';
import type { Answers } from '../src/graph.js';
import { loadProject } from '../src/load.js';
import { migrateToCurrent } from '../src/migrations.js';
import { GateSchema } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

/** Минимальный гейт с выбором — основа отрицательных проверок. */
const gate = (options: unknown[], correctId: string | null = null): unknown => ({
  id: 'g',
  at: { kind: 'seconds', t: 0 },
  config: { kind: 'choice', prompt: '?', options, correctId },
  recordAs: 'v',
});

describe('миграция v4 → v5', () => {
  it('одно условие становится списком из одного, не меняя смысла', () => {
    const before = raw('exit-branch.json') as { schemaVersion: number; segments: any[] };
    expect(before.schemaVersion).toBe(4);
    // В версии 4 условие лежит объектом — если это перестанет быть правдой,
    // тест обязан упасть, а не тихо проверять пустоту.
    expect(Array.isArray(before.segments[0].exit.rules[0].when)).toBe(false);

    const after = migrateToCurrent(before) as { schemaVersion: number; segments: any[] };

    expect(after.schemaVersion).toBe(5);
    const rules = after.segments[0].exit.rules;
    expect(rules[0].when).toEqual([{ kind: 'equals', variable: 'куда', value: 'opt-yes' }]);
    expect(rules[1].when).toEqual([{ kind: 'equals', variable: 'куда', value: 'opt-no' }]);
  });

  it('повторный прогон не оборачивает список второй раз', () => {
    const once = migrateToCurrent(raw('exit-branch.json')) as { segments: any[] };
    const twice = migrateToCurrent({ ...once, schemaVersion: 4 }) as { segments: any[] };
    expect(twice.segments[0].exit.rules[0].when).toHaveLength(1);
  });
});

describe('цепочка условий через И', () => {
  const answers: Answers = {
    a: { value: 'x', correct: true },
    b: { value: 'y', correct: false },
  };

  it('подходит, только когда подошли ВСЕ условия', () => {
    expect(conditionsHold(
      [{ kind: 'equals', variable: 'a', value: 'x' }, { kind: 'wrong', variable: 'b' }],
      answers,
    )).toBe(true);

    expect(conditionsHold(
      [{ kind: 'equals', variable: 'a', value: 'x' }, { kind: 'correct', variable: 'b' }],
      answers,
    )).toBe(false);
  });
});

describe('условие «не равен»', () => {
  const answers: Answers = { a: { value: 'x', correct: true } };

  it('верно, когда значение другое', () => {
    expect(conditionHolds({ kind: 'notEquals', variable: 'a', value: 'z' }, answers)).toBe(true);
  });

  it('ложно, когда значение совпало', () => {
    expect(conditionHolds({ kind: 'notEquals', variable: 'a', value: 'x' }, answers)).toBe(false);
  });

  it('ЛОЖНО, когда переменной нет вовсе — иначе правило вело бы зрителя, который не отвечал', () => {
    expect(conditionHolds({ kind: 'notEquals', variable: 'нет', value: 'x' }, answers)).toBe(false);
  });
});

describe('сравнение с числом', () => {
  const answers: Answers = {
    n: { value: '4', correct: true },
    word: { value: 'красный', correct: false },
    blank: { value: '', correct: false },
  };

  it.each([
    ['gt', 3, true],
    ['gt', 4, false],
    ['gte', 4, true],
    ['lt', 5, true],
    ['lt', 4, false],
    ['lte', 4, true],
  ] as const)('%s %s → %s', (op, value, expected) => {
    expect(conditionHolds({ kind: 'compare', variable: 'n', op, value }, answers)).toBe(expected);
  });

  it('нечисловой ответ не подходит и не бросает: это данные зрителя, а не ошибка кода', () => {
    expect(conditionHolds({ kind: 'compare', variable: 'word', op: 'gt', value: 3 }, answers))
      .toBe(false);
  });

  it('пустой ответ не считается нулём', () => {
    expect(conditionHolds({ kind: 'compare', variable: 'blank', op: 'lte', value: 0 }, answers))
      .toBe(false);
  });
});

describe('условные варианты ответа: что запрещает схема', () => {
  it('принимает вариант с условием, пока есть безусловный', () => {
    const parsed = GateSchema.safeParse(gate([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', when: [{ kind: 'correct', variable: 'v2' }] },
    ]));
    expect(parsed.success).toBe(true);
  });

  it('отклоняет гейт, где условны ВСЕ варианты: скрылись бы все', () => {
    const parsed = GateSchema.safeParse(gate([
      { id: 'a', label: 'A', when: [{ kind: 'correct', variable: 'v2' }] },
      { id: 'b', label: 'B', when: [{ kind: 'wrong', variable: 'v2' }] },
    ]));
    expect(parsed.success).toBe(false);
  });

  it('отклоняет условный ВЕРНЫЙ ответ: вопрос стал бы непроходимым молча', () => {
    const parsed = GateSchema.safeParse(gate(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B', when: [{ kind: 'correct', variable: 'v2' }] },
      ],
      'b',
    ));
    expect(parsed.success).toBe(false);
  });

  it('отклоняет пустой список условий у варианта', () => {
    const parsed = GateSchema.safeParse(gate([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B', when: [] },
    ]));
    expect(parsed.success).toBe(false);
  });
});

describe('эталонная фикстура conditions.json', () => {
  const project = loadProject(raw('conditions.json'));
  const segment = findSegment(project, 's-next');

  it('правило из двух условий ведёт в ветку, только когда подошли ОБА', () => {
    // Посчитал верно и не остановился — оба условия подошли.
    expect(nextSegment(segment, {
      'счёт': { value: '4', correct: true },
      'дальше': { value: 'opt-on', correct: false },
    })).toBe('s-deep');

    // Посчитал верно, но остановился — второе условие не подошло.
    expect(nextSegment(segment, {
      'счёт': { value: '4', correct: true },
      'дальше': { value: 'opt-skip', correct: false },
    })).toBe('s-end');

    // Не остановился, но посчитал неверно — не подошло первое.
    expect(nextSegment(segment, {
      'счёт': { value: '3', correct: false },
      'дальше': { value: 'opt-on', correct: false },
    })).toBe('s-end');
  });

  it('условный вариант виден тому, кто ошибся, и скрыт от того, кто ответил верно', () => {
    const config = segment.gates[0]!.config;
    if (config.kind !== 'choice') throw new Error('ожидался гейт с выбором');
    const again = config.options.find((option) => option.id === 'opt-again');
    if (!again?.when) throw new Error('у варианта «разобрать ещё раз» нет условия');

    expect(conditionsHold(again.when, { 'счёт': { value: '3', correct: false } })).toBe(true);
    expect(conditionsHold(again.when, { 'счёт': { value: '4', correct: true } })).toBe(false);
  });
});

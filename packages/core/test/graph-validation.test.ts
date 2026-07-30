/**
 * Тотальность выхода — прямой наследник правила полного покрытия из ADR-013.
 *
 * Правило то же: автор обязан ответить на вопрос «а что при таком ответе».
 * Поменялось только место, где вопрос задаётся: раньше это были рёбра гейта,
 * теперь — правила выхода сегмента.
 *
 * Обобщение, ради которого правило и существует: **валидность данных не равна
 * достижимости поведения**. Схема, проверяющая только целостность ссылок,
 * разрешает объяснение, в котором зритель упирается в тупик.
 */
import { describe, expect, it } from 'vitest';

import { ProjectSchema, SCHEMA_VERSION } from '../src/schema.js';

const bare = (id: string, exit: unknown, gates: unknown[] = []): any => ({
  id,
  title: '',
  audio: { src: `/${id}.mp3`, duration: 10, words: [] },
  elements: [],
  slides: [{ id: `${id}-s1`, at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
  gates,
  exit,
});

const choice = (recordAs: string, ...optionIds: string[]) => ({
  id: `g-${recordAs}`,
  at: { kind: 'seconds', t: 1 },
  config: {
    kind: 'choice',
    prompt: 'Вопрос?',
    options: optionIds.map((id) => ({ id, label: id })),
    correctId: optionIds[0],
  },
  onWrong: 'continue',
  maxAttempts: null,
  recordAs,
});

/** Объяснение из сегмента `start` плюс два тупика, куда можно вести. */
function explanation(exit: unknown, gates: unknown[] = []): any {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'т', stageWidth: 1920, stageHeight: 1080 },
    entry: 'start',
    segments: [
      bare('start', exit, gates),
      bare('да', { rules: [], default: null }),
      bare('нет', { rules: [], default: null }),
    ],
  };
}

const ok = (project: unknown) => ProjectSchema.safeParse(project).success;
const why = (project: unknown): string => {
  const result = ProjectSchema.safeParse(project);
  return result.success ? '' : result.error.issues.map((i) => i.message).join(' | ');
};

describe('выход без правил', () => {
  it('концовка законна', () => {
    expect(ok(explanation({ rules: [], default: null }))).toBe(true);
  });

  it('безусловный переход законен', () => {
    expect(ok(explanation({ rules: [], default: 'да' }))).toBe(true);
  });
});

describe('выход с правилами обязан быть тотальным', () => {
  const rule = (value: string, goto: string) =>
    ({ id: `r-${value}`, when: { kind: 'equals', variable: 'q', value }, goto });

  it('запасной выход делает тотальным что угодно', () => {
    expect(ok(explanation(
      { rules: [rule('yes', 'да')], default: 'нет' },
      [choice('q', 'yes', 'no')],
    ))).toBe(true);
  });

  it('покрытие всех вариантов гейта делает запасной выход лишним', () => {
    expect(ok(explanation(
      { rules: [rule('yes', 'да'), rule('no', 'нет')], default: null },
      [choice('q', 'yes', 'no')],
    ))).toBe(true);
  });

  it('непокрытый вариант без запасного выхода — тупик', () => {
    expect(why(explanation(
      { rules: [rule('yes', 'да')], default: null },
      [choice('q', 'yes', 'no')],
    ))).toMatch(/не покрывают все исходы/);
  });

  it('пара «верно» и «неверно» тотальна сама по себе', () => {
    expect(ok(explanation({
      rules: [
        { id: 'r1', when: { kind: 'correct', variable: 'q' }, goto: 'да' },
        { id: 'r2', when: { kind: 'wrong', variable: 'q' }, goto: 'нет' },
      ],
      default: null,
    }, [choice('q', 'yes', 'no')]))).toBe(true);
  });

  it('одно только «верно» без запасного выхода — тупик для неверного ответа', () => {
    expect(why(explanation({
      rules: [{ id: 'r1', when: { kind: 'correct', variable: 'q' }, goto: 'да' }],
      default: null,
    }, [choice('q', 'yes', 'no')]))).toMatch(/не покрывают все исходы/);
  });

  it('правила по двум разным переменным без запасного выхода не тотальны', () => {
    // Даже если каждая переменная покрыта, состояние «ни на что не ответил»
    // остаётся возможным, и вести зрителя некуда.
    expect(why(explanation({
      rules: [
        { id: 'r1', when: { kind: 'correct', variable: 'q' }, goto: 'да' },
        { id: 'r2', when: { kind: 'wrong', variable: 'w' }, goto: 'нет' },
      ],
      default: null,
    }, [choice('q', 'yes', 'no'), choice('w', 'a', 'b')]))).toMatch(/не покрывают все исходы/);
  });
});

describe('охранник тотальности сам по себе не пустой', () => {
  it('проверка ловит нарушение, а не молчит всегда', () => {
    // Мутация: если убрать правило тотальности, этот тест обязан упасть.
    expect(ok(explanation(
      { rules: [{ id: 'r1', when: { kind: 'equals', variable: 'q', value: 'yes' }, goto: 'да' }], default: null },
      [choice('q', 'yes', 'no')],
    ))).toBe(false);
  });
});

describe('правило выхода не может указывать на исчезнувший вариант', () => {
  it('значение equals обязано быть настоящим вариантом гейта', () => {
    // В версии 2 это ловилось у рёбер: приёмка Сессии 5 нашла, что правка
    // гейта осиротляет ребро. Форма поменялась, дефект остался тем же —
    // проверка обязана переехать вместе с ним.
    expect(why(explanation(
      {
        rules: [
          { id: 'r1', when: { kind: 'equals', variable: 'q', value: 'yes' }, goto: 'да' },
          { id: 'r2', when: { kind: 'equals', variable: 'q', value: 'исчез' }, goto: 'нет' },
        ],
        default: 'да',
      },
      [choice('q', 'yes', 'no')],
    ))).toMatch(/недостижима навсегда/);
  });

  it('живой вариант проверку проходит', () => {
    expect(ok(explanation(
      { rules: [{ id: 'r1', when: { kind: 'equals', variable: 'q', value: 'no' }, goto: 'нет' }], default: 'да' },
      [choice('q', 'yes', 'no')],
    ))).toBe(true);
  });
});

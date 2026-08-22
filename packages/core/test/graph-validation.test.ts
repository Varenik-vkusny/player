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

import { ProjectSchema, SCHEMA_VERSION, ThemeSchema } from '../src/schema.js';

const bare = (id: string, exit: unknown, gates: unknown[] = []): any => ({
  id,
  title: '',
  description: '',
  audio: { src: `/${id}.mp3`, duration: 10, words: [] },
  elements: [],
  slides: [{ id: `${id}-s1`, at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: {} }],
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
    meta: { title: 'т', stageWidth: 1920, stageHeight: 1080 , theme: ThemeSchema.parse({}) },
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
    ({ id: `r-${value}`, when: [{ kind: 'equals', variable: 'q', value }], goto });

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
        { id: 'r1', when: [{ kind: 'correct', variable: 'q' }], goto: 'да' },
        { id: 'r2', when: [{ kind: 'wrong', variable: 'q' }], goto: 'нет' },
      ],
      default: null,
    }, [choice('q', 'yes', 'no')]))).toBe(true);
  });

  it('одно только «верно» без запасного выхода — тупик для неверного ответа', () => {
    expect(why(explanation({
      rules: [{ id: 'r1', when: [{ kind: 'correct', variable: 'q' }], goto: 'да' }],
      default: null,
    }, [choice('q', 'yes', 'no')]))).toMatch(/не покрывают все исходы/);
  });

  it('правила по двум разным переменным без запасного выхода не тотальны', () => {
    // Даже если каждая переменная покрыта, состояние «ни на что не ответил»
    // остаётся возможным, и вести зрителя некуда.
    expect(why(explanation({
      rules: [
        { id: 'r1', when: [{ kind: 'correct', variable: 'q' }], goto: 'да' },
        { id: 'r2', when: [{ kind: 'wrong', variable: 'w' }], goto: 'нет' },
      ],
      default: null,
    }, [choice('q', 'yes', 'no'), choice('w', 'a', 'b')]))).toMatch(/не покрывают все исходы/);
  });
});

describe('охранник тотальности сам по себе не пустой', () => {
  it('проверка ловит нарушение, а не молчит всегда', () => {
    // Мутация: если убрать правило тотальности, этот тест обязан упасть.
    expect(ok(explanation(
      { rules: [{ id: 'r1', when: [{ kind: 'equals', variable: 'q', value: 'yes' }], goto: 'да' }], default: null },
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
          { id: 'r1', when: [{ kind: 'equals', variable: 'q', value: 'yes' }], goto: 'да' },
          { id: 'r2', when: [{ kind: 'equals', variable: 'q', value: 'исчез' }], goto: 'нет' },
        ],
        default: 'да',
      },
      [choice('q', 'yes', 'no')],
    ))).toMatch(/недостижима навсегда/);
  });

  it('живой вариант проверку проходит', () => {
    expect(ok(explanation(
      { rules: [{ id: 'r1', when: [{ kind: 'equals', variable: 'q', value: 'no' }], goto: 'нет' }], default: 'да' },
      [choice('q', 'yes', 'no')],
    ))).toBe(true);
  });
});

/**
 * ССЫЛКА ОТВЕТА НА ФИГУРУ ПРОВЕРЯЕТСЯ (ADR-035, схема v15).
 *
 * Ради этого поле и заводилось. До версии 15 связь держалась на совпадении
 * имён, и разорвать её можно было переименованием любой из двух сторон —
 * молча, без ошибки и без следа. ADR-011 записал последствие честно:
 * «вариант просто деградирует до системной кнопки». Автор рисовал кнопку,
 * привязывал ответ, удалял фигуру — и зритель получал системную кнопку
 * вместо нарисованной, ни о чём не будучи предупреждён.
 */
describe('ответ, привязанный к фигуре, обязан ссылаться на существующую', () => {
  const withBinding = (elementId: string | undefined, elements: unknown[]): unknown => {
    const project = explanation({ rules: [], default: null }, [choice('q', 'yes', 'no')]);
    project.segments[0].elements = elements;
    if (elementId !== undefined) {
      project.segments[0].gates[0].config.options[0].elementId = elementId;
    }
    return project;
  };

  const element = (id: string) => ({
    id,
    type: 'text',
    content: 'т',
    locked: false,
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятая проверка ссылки. Тогда битая ссылка
   * доезжала бы до плеера, и там `#nodes.get` вернул бы undefined —
   * то есть ровно то молчаливое вырождение, от которого уходили.
   */
  it('ссылка на несуществующий элемент — отказ, а не молчаливое вырождение', () => {
    expect(ok(withBinding('нет-такой', [element('есть-такой')]))).toBe(false);
    expect(why(withBinding('нет-такой', [element('есть-такой')]))).toMatch(/нет-такой/);
  });

  /** Положительный контроль: живая ссылка проходит. */
  it('ссылка на существующий элемент того же сегмента проходит', () => {
    expect(ok(withBinding('есть-такой', [element('есть-такой')]))).toBe(true);
  });

  /**
   * Пусто — законный ОСНОВНОЙ случай, а не недоделка: вариант рисуется
   * системной кнопкой. Без этой проверки строгость легко переросла бы
   * в требование привязывать всё подряд.
   */
  it('вариант без ссылки проходит: это системная кнопка', () => {
    expect(ok(withBinding(undefined, []))).toBe(true);
  });

  /**
   * Элемент ДРУГОГО сегмента не годится: сцена своя у каждой главы,
   * и узла с таким именем в момент открытия остановки просто не будет.
   */
  it('элемент чужого сегмента не считается существующим', () => {
    const project = explanation({ rules: [], default: null }, [choice('q', 'yes', 'no')]) as any;
    project.segments[1].elements = [element('чужой')];
    project.segments[0].gates[0].config.options[0].elementId = 'чужой';
    expect(ok(project)).toBe(false);
  });
});

/**
 * Схема v3: что она принимает и, важнее, что отказывается принимать.
 *
 * Валидация обязана падать громко и называть место. Молчаливое принятие
 * битого проекта — это дефект, который доедет до зрителя.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { loadProject, ProjectLoadError } from '../src/load.js';
import { ProjectSchema, SCHEMA_VERSION } from '../src/schema.js';

const DIR = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));
const raw = (name: string): any => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const all = readdirSync(DIR).filter((name) => name.endsWith('.json'));

/**
 * Минимальное валидное объяснение версии 3 — основа отрицательных проверок.
 *
 * Собирается функцией, а не константой: каждый тест ломает свою копию,
 * и общий объект утёк бы правкой из одного теста в другой.
 */
function explanation(): any {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Проверка', stageWidth: 1920, stageHeight: 1080 },
    entry: 'intro',
    segments: [{
      id: 'intro',
      title: 'Введение',
      audio: { src: '/a.mp3', duration: 10, words: [] },
      elements: [{ id: 'box', type: 'shape', content: '' }],
      slides: [{
        id: 's1',
        at: { kind: 'seconds', t: 0 },
        transition: 'morph',
        states: { box: { x: 0, y: 0, width: 100, height: 100 } },
      }],
      gates: [],
      exit: { rules: [], default: null },
    }],
  };
}

const choiceGate = (recordAs: string) => ({
  id: 'g1',
  at: { kind: 'seconds', t: 1 },
  config: {
    kind: 'choice',
    prompt: 'Вопрос?',
    options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }],
    correctId: 'yes',
  },
  onWrong: 'continue',
  maxAttempts: null,
  recordAs,
});

/** Сообщения всех проблем одной строкой — чтобы искать по смыслу, а не по пути. */
function problems(project: unknown): string {
  const result = ProjectSchema.safeParse(project);
  expect(result.success, 'проект прошёл валидацию, хотя не должен был').toBe(false);
  return result.error!.issues.map((i) => i.message).join(' | ');
}

/**
 * Пути всех проблем. Нужны там, где сообщение пишет Zod, а не мы: текст чужой
 * библиотеки меняется от версии к версии, путь — нет.
 */
function problemPaths(project: unknown): string[] {
  const result = ProjectSchema.safeParse(project);
  expect(result.success, 'проект прошёл валидацию, хотя не должен был').toBe(false);
  return result.error!.issues.map((i) => i.path.join('.'));
}

describe('эталонные фикстуры валидны', () => {
  it.each(all)('%s', (name) => {
    expect(() => loadProject(raw(name))).not.toThrow();
  });

  it('заготовка отрицательных проверок сама по себе валидна', () => {
    // Иначе все отрицательные тесты зелены впустую: они падали бы
    // на постороннем дефекте заготовки, а не на том, что ломает тест.
    expect(ProjectSchema.safeParse(explanation()).success).toBe(true);
  });
});

describe('гейт не может ветвить, а развилка не может стоять в середине', () => {
  it('у гейта нет поля для рёбер: лишний ключ отбрасывается, а не создаёт ветку', () => {
    const project = explanation();
    project.segments[0].gates = [{ ...choiceGate('v1'), edges: [{ to: 'intro' }] }];
    const parsed = ProjectSchema.parse(project);
    expect(parsed.segments[0]!.gates[0]).not.toHaveProperty('edges');
  });

  it('выход есть поле сегмента: положить его в середину некуда', () => {
    // Проверка формы, а не поведения. Если однажды `exit` переедет внутрь
    // слайда или гейта, этот тест обязан упасть и заставить написать ADR.
    const parsed = ProjectSchema.parse(explanation());
    expect(parsed.segments[0]).toHaveProperty('exit');
    expect(parsed.segments[0]!.slides[0]).not.toHaveProperty('exit');
  });
});

describe('слайды', () => {
  it('сегмент без слайдов не открывается', () => {
    const project = explanation();
    project.segments[0].slides = [];
    expect(problemPaths(project)).toContain('segments.0.slides');
  });

  it('первый слайд обязан стоять ровно на нуле', () => {
    const project = explanation();
    project.segments[0].slides[0].at = { kind: 'seconds', t: 0.5 };
    expect(problems(project)).toMatch(/первый слайд обязан стоять на нуле/);
  });

  it('первый слайд нельзя привязать к слову', () => {
    const project = explanation();
    project.segments[0].audio.words = [
      { text: 'раз', start: 0, end: 0.3, source: 'manual' },
    ];
    project.segments[0].slides[0].at = {
      kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'раз', before: '', after: '' },
    };
    expect(problems(project)).toMatch(/первый слайд обязан стоять на нуле/);
  });

  it('два слайда на одной секунде — неоднозначность, а не мелочь', () => {
    const project = explanation();
    project.segments[0].slides.push({
      id: 's2', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {},
    });
    expect(problems(project)).toMatch(/два слайда на одной секунде/);
  });

  it('слайды не по порядку не проходят', () => {
    const project = explanation();
    project.segments[0].slides.push(
      { id: 's2', at: { kind: 'seconds', t: 5 }, transition: 'morph', states: {} },
      { id: 's3', at: { kind: 'seconds', t: 2 }, transition: 'morph', states: {} },
    );
    expect(problems(project)).toMatch(/идут не по порядку/);
  });

  it('состояние несуществующего элемента не проходит', () => {
    const project = explanation();
    project.segments[0].slides[0].states['нет-такого'] = { x: 0, y: 0, width: 1, height: 1 };
    expect(problems(project)).toMatch(/которого нет в сегменте/);
  });

  it('нулевой размер законен: из него элемент вырастает', () => {
    const project = explanation();
    project.segments[0].slides[0].states['box'] = { x: 0, y: 0, width: 0, height: 0 };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('отрицательный размер незаконен', () => {
    const project = explanation();
    project.segments[0].slides[0].states['box'] = { x: 0, y: 0, width: -1, height: 10 };
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });
});

describe('переменные зрителя', () => {
  it('две записи в одну переменную — неоднозначность на всё объяснение', () => {
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ'), { ...choiceGate('ответ'), id: 'g2' }];
    expect(problems(project)).toMatch(/записывается дважды/);
  });

  it('правило смотрит на переменную, которой никто не пишет', () => {
    const project = explanation();
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: { kind: 'equals', variable: 'ниоткуда', value: 'yes' }, goto: 'intro' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/не записывает ни один гейт/);
  });

  it('переменную можно записать в одном сегменте, а прочитать в другом', () => {
    // Ответы живут на всё объяснение и переживают переходы между сегментами.
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ')];
    project.segments.push({
      id: 'второй',
      title: '',
      audio: { src: '/b.mp3', duration: 5, words: [] },
      elements: [],
      slides: [{ id: 'b1', at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
      gates: [],
      exit: {
        rules: [{ id: 'r1', when: { kind: 'correct', variable: 'ответ' }, goto: 'intro' }],
        default: 'второй',
      },
    });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('сравнивать значение переменной от гейта «дальше» не с чем', () => {
    const project = explanation();
    project.segments[0].gates = [{
      id: 'g1',
      at: { kind: 'seconds', t: 1 },
      config: { kind: 'continue', label: 'Дальше' },
      onWrong: 'continue',
      maxAttempts: null,
      recordAs: 'дальше',
    }];
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: { kind: 'equals', variable: 'дальше', value: 'x' }, goto: 'intro' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/у него один исход/);
  });
});

describe('ссылки', () => {
  it('стартовый сегмент обязан существовать', () => {
    const project = explanation();
    project.entry = 'нет-такого';
    expect(problems(project)).toMatch(/Стартовый сегмент/);
  });

  it('идентификатор сегмента не повторяется', () => {
    const project = explanation();
    project.segments.push({ ...explanation().segments[0] });
    expect(problems(project)).toMatch(/Идентификатор сегмента повторяется/);
  });

  it('правило не ведёт в несуществующий сегмент', () => {
    const project = explanation();
    project.segments[0].gates = [choiceGate('ответ')];
    project.segments[0].exit = {
      rules: [{ id: 'r1', when: { kind: 'correct', variable: 'ответ' }, goto: 'нет-такого' }],
      default: 'intro',
    };
    expect(problems(project)).toMatch(/несуществующий сегмент/);
  });

  it('метка за пределами дорожки не проходит', () => {
    const project = explanation();
    project.segments[0].gates = [{ ...choiceGate('ответ'), at: { kind: 'seconds', t: 99 } }];
    expect(problems(project)).toMatch(/выходит за длительность/);
  });

  it('ссылка на слово при пустом транскрипте не проходит', () => {
    const project = explanation();
    project.segments[0].gates = [{
      ...choiceGate('ответ'),
      at: { kind: 'word', wordIndex: 0, offset: 0, anchor: { text: 'а', before: '', after: '' } },
    }];
    expect(problems(project)).toMatch(/пустом транскрипте/);
  });
});

describe('загрузка падает громко и перечисляет проблемы', () => {
  it('ошибка — ProjectLoadError со списком, а не «что-то пошло не так»', () => {
    const project = explanation();
    project.entry = 'нет-такого';
    project.segments[0].slides[0].at = { kind: 'seconds', t: 3 };
    try {
      loadProject(project);
      expect.unreachable('загрузка должна была упасть');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectLoadError);
      expect((error as ProjectLoadError).issues.length).toBeGreaterThan(1);
    }
  });
});

/**
 * Копия куска — жёсткая копия, а не ссылка (product.md §7, вторая из трёх
 * механик переиспользования).
 *
 * Несущее ограничение: схема (`schema.ts`) запрещает двум остановкам писать
 * в одну переменную ПО ВСЕМУ ПРОЕКТУ — «второй ответ затёр бы первый».
 * Копия остановки обязана получить своё имя `recordAs`, и все ссылки на
 * него внутри скопированного куска обязаны переехать вместе с ним. Главная
 * проверка здесь — что копия ВАЛИДНА (`problems()` использует ту же функцию
 * схемы, что и сохранение), а не что функция вернула объект нужной формы.
 *
 * **Круг правок 1 (владелец).** Копия ищется в тестах по ИДЕНТИФИКАТОРУ,
 * а не по заголовку: заголовок копии теперь ОТЛИЧАЕТСЯ от оригинала
 * (иначе автор в списке кусков видел бы два одинаково названных элемента),
 * и тест, ищущий по совпадению заголовка, продиктовал бы это поведение
 * продукту, а не проверял его.
 */
import { ProjectSchema, SCHEMA_VERSION, ThemeSchema, type Project, type Segment } from '@player/core';
import { describe, expect, it } from 'vitest';

import { duplicateSegment } from '../src/state/project.js';
import { titleForCopy } from '../src/state/duplicate.js';

/** Сообщения всех проблем валидации одной строкой. Пусто — проект валиден. */
function problems(project: unknown): string {
  const result = ProjectSchema.safeParse(project);
  if (result.success) return '';
  return result.error.issues.map((issue) => issue.message).join(' | ');
}

/**
 * Копия отличается от всего, что было в проекте ДО дублирования, ровно
 * одним признаком, не зависящим от отображаемого текста, — её `id`
 * не встречался среди `source.segments` (`state/project.ts: duplicateSegment`
 * гарантирует свежий id через `claimer`, засеянный `project.segments`).
 */
function copyOf(source: Project, next: Project): Segment {
  const sourceIds = new Set(source.segments.map((segment) => segment.id));
  const copy = next.segments.find((segment) => !sourceIds.has(segment.id));
  if (!copy) throw new Error('копии нет среди сегментов — duplicateSegment ничего не добавил');
  return copy;
}

const box = (x: number) => ({
  x, y: 0, width: 100, height: 100,
  rotation: 0, zIndex: 0, opacity: 1, visible: true, flipX: false, flipY: false, style: {},
});

/**
 * Кусок с остановкой-вопросом (переменная «answer», варианты «a»/«b»)
 * и элементом, состояние которого задано на слайде. Выход — через `default`,
 * без правил: ответ ни на что не влияет, просто нужна ОСТАНОВКА для теста
 * несущего ограничения.
 */
function projectWithGate(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Копия куска', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 's-1',
    styles: [],
    fonts: [],
    segments: [
      {
        authorSpans: [],
        id: 's-1',
        title: 'Кусок с вопросом',
        description: '',
        audio: { src: '/track.mp3', offset: 0, duration: 10, words: [] },
        elements: [{ id: 'hero', type: 'text', content: 'Заголовок', locked: false }],
        slides: [{ id: 'sl-0', at: { kind: 'seconds', t: 0 }, transition: 'morph', transitionSeconds: 0.6, states: { hero: box(0) } }],
        gates: [{
          id: 'g1',
          at: { kind: 'seconds', t: 5 },
          config: {
            kind: 'choice',
            prompt: 'Куда дальше?',
            options: [{ id: 'a', label: 'Налево' }, { id: 'b', label: 'Направо' }],
            correctId: 'a',
          },
          onWrong: 'continue',
          maxAttempts: null,
          recordAs: 'answer',
        }],
        exit: { rules: [], default: 'end' },
      },
      {
        authorSpans: [],
        id: 'end',
        title: 'Конец',
        description: '',
        audio: { src: '/track.mp3', offset: 0, duration: 1, words: [] },
        elements: [],
        slides: [{ id: 'sl-e', at: { kind: 'seconds', t: 0 }, transition: 'cut', transitionSeconds: 0.6, states: {} }],
        gates: [],
        exit: { rules: [], default: null },
      },
    ],
  };
}

/**
 * То же, что `projectWithGate`, но выход s-1 покрыт правилами, СМОТРЯЩИМИ
 * на собственную переменную куска («answer» = «a» / «answer» = «b»),
 * а не через `default`. Это ровно тот случай, где каскад переименования
 * обязан переписать `exit.rules[].when[].variable` и `...value`.
 */
function projectWithGateAndRules(): Project {
  const base = projectWithGate();
  const head = base.segments[0]!;
  return {
    ...base,
    segments: [
      {
        ...head,
        exit: {
          rules: [
            { id: 'r-a', when: [{ kind: 'equals', variable: 'answer', value: 'a' }], goto: 'end' },
            { id: 'r-b', when: [{ kind: 'equals', variable: 'answer', value: 'b' }], goto: 'end' },
          ],
          default: null,
        },
      },
      base.segments[1]!,
    ],
  };
}

/** Кусок без остановки, только с текстом озвучки — проверка, что текст едет вместе с куском. */
function projectWithSpeech(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { title: 'Копия с озвучкой', stageWidth: 1920, stageHeight: 1080, theme: ThemeSchema.parse({}) },
    entry: 's-1',
    styles: [],
    fonts: [],
    segments: [{
      authorSpans: [],
      id: 's-1',
      title: 'Кусок с озвучкой',
      description: '',
      speech: 'Часы это позиция.',
      audio: { src: '/track.mp3', offset: 0, duration: 4, words: [] },
      elements: [],
      slides: [{ id: 'sl-0', at: { kind: 'seconds', t: 0 }, transition: 'cut', transitionSeconds: 0.6, states: {} }],
      gates: [],
      exit: { rules: [], default: null },
    }],
  };
}

describe('копия куска', () => {
  it('копия — валидный проект, а не поломанный', () => {
    const next = duplicateSegment(projectWithGate(), 's-1');
    expect(problems(next)).toBe('');
  });

  it('переменная остановки переименована, иначе схема отвергнет проект', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const original = next.segments.find((s) => s.id === 's-1')!;
    const copy = copyOf(source, next);

    expect(copy.gates[0]!.recordAs).not.toBe(original.gates[0]!.recordAs);
  });

  it('правила выхода копии смотрят на СВОЮ переменную, а не на чужую', () => {
    const source = projectWithGateAndRules();
    const next = duplicateSegment(source, 's-1');
    const copy = copyOf(source, next);

    expect(copy.gates).toHaveLength(1);
    expect(copy.exit.rules.length).toBeGreaterThan(0);
    for (const rule of copy.exit.rules) {
      for (const condition of rule.when) {
        expect(condition.variable).toBe(copy.gates[0]!.recordAs);
      }
    }
  });

  it('дорожка не копируется: копия ссылается на тот же файл тем же окном', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const original = next.segments.find((s) => s.id === 's-1')!;
    const copy = copyOf(source, next);

    expect(copy.audio.src).toBe(original.audio.src);
    expect(copy.audio.offset).toBe(original.audio.offset);
  });

  it('на копию никто не ссылается: связать её — работа автора', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const copy = copyOf(source, next);
    const pointers = next.segments.flatMap((s) =>
      [...s.exit.rules.map((r) => r.goto), s.exit.default]);

    expect(pointers).not.toContain(copy.id);
    expect(next.entry).not.toBe(copy.id);
  });

  it('текст озвучки копируется вместе с куском', () => {
    const source = projectWithSpeech();
    const next = duplicateSegment(source, 's-1');
    const copy = copyOf(source, next);
    expect(copy.speech).toBe('Часы это позиция.');
  });

  it('копия встаёт сразу после оригинала, автор ищет её глазами там, где нажал', () => {
    const next = duplicateSegment(projectWithGate(), 's-1');
    const originalIndex = next.segments.findIndex((s) => s.id === 's-1');
    const copy = next.segments[originalIndex + 1]!;
    expect(copy.id).not.toBe('s-1');
    expect(copy.id).not.toBe('end');
  });

  it('исходный проект не мутирует: у него по-прежнему один кусок с вопросом', () => {
    const source = projectWithGate();
    duplicateSegment(source, 's-1');
    expect(source.segments).toHaveLength(2);
    expect(source.segments[0]!.gates[0]!.recordAs).toBe('answer');
  });

  it('элементы и слайды копии получают собственные id — иначе states указывали бы мимо', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const original = next.segments.find((s) => s.id === 's-1')!;
    const copy = copyOf(source, next);

    expect(copy.elements.map((e) => e.id)).not.toEqual(original.elements.map((e) => e.id));
    expect(copy.slides[0]!.id).not.toBe(original.slides[0]!.id);
    // states указывают на элементы СВОЕЙ (копии), а не оригинала — иначе схема
    // отклонила бы проект («которого нет в сегменте»), и problems() выше это
    // уже покрывает, но здесь — явно, чтобы дефект был виден по имени.
    expect(Object.keys(copy.slides[0]!.states)).toEqual(copy.elements.map((e) => e.id));
  });

  it('варианты ответа получают собственные id, а correctId указывает на СВОЙ вариант', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const original = next.segments.find((s) => s.id === 's-1')!;
    const copy = copyOf(source, next);

    const originalConfig = original.gates[0]!.config;
    const copyConfig = copy.gates[0]!.config;
    if (originalConfig.kind !== 'choice' || copyConfig.kind !== 'choice') {
      throw new Error('фикстура сломана: остановка обязана быть вопросом с вариантами');
    }
    expect(copyConfig.options.map((o) => o.id)).not.toEqual(originalConfig.options.map((o) => o.id));
    expect(copyConfig.correctId).toBe(copyConfig.options[0]!.id);
  });

  it('копировать несуществующий кусок нечем', () => {
    expect(() => duplicateSegment(projectWithGate(), 'нет-такого')).toThrow();
  });

  // --- Круг правок 1: заголовок копии ---

  it('заголовок копии отличается от оригинала: иначе в списке два одинаковых элемента', () => {
    const source = projectWithGate();
    const next = duplicateSegment(source, 's-1');
    const original = next.segments.find((s) => s.id === 's-1')!;
    const copy = copyOf(source, next);

    expect(copy.title).not.toBe(original.title);
  });

  it('копия трижды подряд: пометка не дублируется, а нумеруется', () => {
    // «Кусок» → «Кусок — копия» → «Кусок — копия 2» → «Кусок — копия 3».
    // Если бы пометка дописывалась слепо, третья копия называлась бы
    // «Кусок — копия — копия — копия» — нечитаемо и растёт без предела.
    let project = projectWithGate();
    let sourceId = 's-1'; // каждый следующий раз дублируем КОПИЮ, а не оригинал
    const titles: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const before = project;
      project = duplicateSegment(project, sourceId);
      const copy = copyOf(before, project);
      titles.push(copy.title);
      sourceId = copy.id;
    }
    expect(titles).toEqual(['Кусок с вопросом — копия', 'Кусок с вопросом — копия 2', 'Кусок с вопросом — копия 3']);
  });

  it('пустой заголовок не трогаем: список и так покажет разные id', () => {
    const source = projectWithGate();
    const withoutTitle: Project = {
      ...source,
      segments: [{ ...source.segments[0]!, title: '' }, source.segments[1]!],
    };
    const next = duplicateSegment(withoutTitle, 's-1');
    const copy = copyOf(withoutTitle, next);
    expect(copy.title).toBe('');
  });

  it('длинный заголовок остаётся валиден — у title в схеме нет предела длины', () => {
    const source = projectWithGate();
    const longTitle = 'Кусок '.repeat(200).trim();
    const withLongTitle: Project = {
      ...source,
      segments: [{ ...source.segments[0]!, title: longTitle }, source.segments[1]!],
    };
    const next = duplicateSegment(withLongTitle, 's-1');
    expect(problems(next)).toBe('');
  });
});

describe('titleForCopy: правило построения заголовка копии', () => {
  it('первая копия получает пометку « — копия»', () => {
    expect(titleForCopy('Кусок А')).toBe('Кусок А — копия');
  });

  it('копия копии получает номер, а не вторую пометку', () => {
    expect(titleForCopy('Кусок А — копия')).toBe('Кусок А — копия 2');
  });

  it('номер растёт дальше, база не теряется', () => {
    expect(titleForCopy('Кусок А — копия 2')).toBe('Кусок А — копия 3');
    expect(titleForCopy('Кусок А — копия 9')).toBe('Кусок А — копия 10');
  });

  it('пустой заголовок остаётся пустым', () => {
    expect(titleForCopy('')).toBe('');
    expect(titleForCopy('   ')).toBe('   ');
  });
});

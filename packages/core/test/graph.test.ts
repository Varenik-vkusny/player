/**
 * Костяк объяснения: выбор следующего сегмента по накопленным ответам.
 *
 * Чистые функции, поэтому проверяются юнитом, а не прогоном звука.
 */
import { describe, expect, it } from 'vitest';

import {
  certainRemaining,
  conditionHolds,
  findSegment,
  nextSegment,
  preloadTargetsOfExit,
  type Answers,
} from '../src/graph.js';
import { SCHEMA_VERSION, type Project, type Segment } from '../src/schema.js';

const segment = (id: string, exit: Segment['exit']): Segment => ({
  id,
  title: '',
  audio: { src: `/${id}.mp3`, offset: 0, duration: 10, words: [] },
  elements: [],
  slides: [{ id: `${id}-s1`, at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
  gates: [],
  exit,
});

const project = (segments: Segment[]): Project => ({
  schemaVersion: SCHEMA_VERSION,
  meta: { title: 'т', stageWidth: 1920, stageHeight: 1080 },
  entry: segments[0]!.id,
  segments,
});

const answered = (variable: string, value: string, correct: boolean): Answers =>
  ({ [variable]: { value, correct } });

describe('сегмент по идентификатору', () => {
  it('находится', () => {
    expect(findSegment(project([segment('a', { rules: [], default: null })]), 'a').id).toBe('a');
  });

  it('отсутствующий сегмент бросает там, где спросили', () => {
    // Не undefined: рассинхрон состояния надо увидеть здесь, а не тремя
    // кадрами позже в виде пустой сцены.
    const p = project([segment('a', { rules: [], default: null })]);
    expect(() => findSegment(p, 'нет')).toThrow(/Сегмента «нет» нет в объяснении/);
  });
});

describe('условие против накопленных ответов', () => {
  const answers = answered('вопрос', 'yes', true);

  it('равенство значению', () => {
    expect(conditionHolds({ kind: 'equals', variable: 'вопрос', value: 'yes' }, answers)).toBe(true);
    expect(conditionHolds({ kind: 'equals', variable: 'вопрос', value: 'no' }, answers)).toBe(false);
  });

  it('верно и неверно', () => {
    expect(conditionHolds({ kind: 'correct', variable: 'вопрос' }, answers)).toBe(true);
    expect(conditionHolds({ kind: 'wrong', variable: 'вопрос' }, answers)).toBe(false);
    const мимо = answered('вопрос', 'no', false);
    expect(conditionHolds({ kind: 'wrong', variable: 'вопрос' }, мимо)).toBe(true);
  });

  it('неотвеченный вопрос не подходит ни под какое условие, но и не роняет', () => {
    // Зритель мог дойти до выхода, не встретив этот гейт: он стоял в ветке,
    // которую зритель не видел. Это не ошибка.
    expect(conditionHolds({ kind: 'correct', variable: 'вопрос' }, {})).toBe(false);
    expect(conditionHolds({ kind: 'wrong', variable: 'вопрос' }, {})).toBe(false);
    expect(conditionHolds({ kind: 'equals', variable: 'вопрос', value: 'yes' }, {})).toBe(false);
  });
});

describe('следующий сегмент', () => {
  const развилка = segment('start', {
    rules: [
      { id: 'r1', when: [{ kind: 'equals', variable: 'q', value: 'yes' }], goto: 'да' },
      { id: 'r2', when: [{ kind: 'equals', variable: 'q', value: 'no' }], goto: 'нет' },
    ],
    default: null,
  });

  it('первое подошедшее правило выигрывает', () => {
    expect(nextSegment(развилка, answered('q', 'yes', true))).toBe('да');
    expect(nextSegment(развилка, answered('q', 'no', false))).toBe('нет');
  });

  it('порядок правил — это семантика, а не оформление', () => {
    const оба = segment('s', {
      rules: [
        { id: 'r1', when: [{ kind: 'correct', variable: 'q' }], goto: 'первый' },
        { id: 'r2', when: [{ kind: 'equals', variable: 'q', value: 'yes' }], goto: 'второй' },
      ],
      default: 'запасной',
    });
    // Ответ подходит под ОБА правила. Побеждает то, что выше.
    expect(nextSegment(оба, answered('q', 'yes', true))).toBe('первый');
  });

  it('ни одно правило не подошло — идём в запасной выход', () => {
    const с_запасным = segment('s', {
      rules: [{ id: 'r1', when: [{ kind: 'correct', variable: 'q' }], goto: 'верно' }],
      default: 'дальше',
    });
    expect(nextSegment(с_запасным, answered('q', 'no', false))).toBe('дальше');
  });

  it('сегмент без правил и без запасного выхода — концовка', () => {
    // Не ошибка: именно такой выход получает сегмент после миграции с версии 2,
    // то есть это основной случай, а не краевой.
    expect(nextSegment(segment('s', { rules: [], default: null }), {})).toBeNull();
  });

  it('неотвеченный вопрос при полном покрытии вариантов даёт концовку, а не тупик', () => {
    expect(nextSegment(развилка, {})).toBeNull();
  });
});

describe('что греть заранее', () => {
  it('все возможные продолжения без повторов', () => {
    const s = segment('s', {
      rules: [
        { id: 'r1', when: [{ kind: 'equals', variable: 'q', value: 'a' }], goto: 'один' },
        { id: 'r2', when: [{ kind: 'equals', variable: 'q', value: 'b' }], goto: 'два' },
        { id: 'r3', when: [{ kind: 'equals', variable: 'q', value: 'c' }], goto: 'один' },
      ],
      default: 'два',
    });
    expect(preloadTargetsOfExit(s).sort()).toEqual(['два', 'один']);
  });

  it('у концовки греть нечего', () => {
    expect(preloadTargetsOfExit(segment('s', { rules: [], default: null }))).toEqual([]);
  });
});

/**
 * Прогресс по объяснению. Главное здесь — не число, а ЧЕСТНОСТЬ числа:
 * когда длина зависит от будущих ответов, её нельзя называть.
 */
describe('сколько частей осталось', () => {
  const line = (): Project => ({
    schemaVersion: SCHEMA_VERSION,
    meta: { title: '', stageWidth: 1920, stageHeight: 1080 },
    entry: 'a',
    segments: ['a', 'b', 'c'].map((id, index, all) => ({
      id,
      title: '',
      audio: { src: '/a.mp3', offset: 0, duration: 5, words: [] },
      elements: [],
      slides: [{ id: `${id}-1`, at: { kind: 'seconds', t: 0 }, transition: 'cut', states: {} }],
      gates: [],
      exit: { rules: [], default: all[index + 1] ?? null },
    })),
  } as Project);

  it('на прямой линии остаток известен точно', () => {
    const project = line();
    expect(certainRemaining(project, 'a')).toBe(2);
    expect(certainRemaining(project, 'b')).toBe(1);
  });

  it('у концовки не осталось ничего', () => {
    expect(certainRemaining(line(), 'c')).toBe(0);
  });

  it('развилка впереди делает длину неизвестной', () => {
    const project = line();
    // Часть «a» теперь ветвится: куда пойдёт зритель — зависит от ответа,
    // которого ещё нет.
    project.segments[0]!.exit = {
      rules: [
        { id: 'r1', when: [{ kind: 'equals', variable: 'v', value: 'x' }], goto: 'b' },
        { id: 'r2', when: [{ kind: 'equals', variable: 'v', value: 'y' }], goto: 'c' },
      ],
      default: null,
    };
    expect(certainRemaining(project, 'a')).toBeNull();
  });

  it('развилка ДАЛЬШЕ по пути тоже делает длину неизвестной', () => {
    const project = line();
    project.segments[1]!.exit = {
      rules: [
        { id: 'r1', when: [{ kind: 'equals', variable: 'v', value: 'x' }], goto: 'c' },
        { id: 'r2', when: [{ kind: 'equals', variable: 'v', value: 'y' }], goto: 'a' },
      ],
      default: null,
    };
    // Из «a» идти ещё можно, но за «b» путь расходится.
    expect(certainRemaining(project, 'a')).toBeNull();
  });

  it('два правила в ОДНУ часть неоднозначности не создают', () => {
    const project = line();
    project.segments[0]!.exit = {
      rules: [
        { id: 'r1', when: [{ kind: 'equals', variable: 'v', value: 'x' }], goto: 'b' },
        { id: 'r2', when: [{ kind: 'equals', variable: 'v', value: 'y' }], goto: 'b' },
      ],
      default: null,
    };
    // Ответ влияет на то, ПОЧЕМУ мы идём дальше, но не на то, КУДА.
    expect(certainRemaining(project, 'a')).toBe(2);
  });

  it('цикл не имеет определённой длины', () => {
    const project = line();
    project.segments[2]!.exit = { rules: [], default: 'a' };
    expect(certainRemaining(project, 'a')).toBeNull();
  });
});

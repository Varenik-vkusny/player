/**
 * Костяк объяснения: выбор следующего сегмента по накопленным ответам.
 *
 * Чистые функции, поэтому проверяются юнитом, а не прогоном звука.
 */
import { describe, expect, it } from 'vitest';

import {
  conditionHolds,
  findSegment,
  nextSegment,
  preloadTargetsOfExit,
  type Answers,
} from '../src/graph.js';
import type { Project, Segment } from '../src/schema.js';

const segment = (id: string, exit: Segment['exit']): Segment => ({
  id,
  title: '',
  audio: { src: `/${id}.mp3`, duration: 10, words: [] },
  elements: [],
  slides: [{ id: `${id}-s1`, at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
  gates: [],
  exit,
});

const project = (segments: Segment[]): Project => ({
  schemaVersion: 3,
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
      { id: 'r1', when: { kind: 'equals', variable: 'q', value: 'yes' }, goto: 'да' },
      { id: 'r2', when: { kind: 'equals', variable: 'q', value: 'no' }, goto: 'нет' },
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
        { id: 'r1', when: { kind: 'correct', variable: 'q' }, goto: 'первый' },
        { id: 'r2', when: { kind: 'equals', variable: 'q', value: 'yes' }, goto: 'второй' },
      ],
      default: 'запасной',
    });
    // Ответ подходит под ОБА правила. Побеждает то, что выше.
    expect(nextSegment(оба, answered('q', 'yes', true))).toBe('первый');
  });

  it('ни одно правило не подошло — идём в запасной выход', () => {
    const с_запасным = segment('s', {
      rules: [{ id: 'r1', when: { kind: 'correct', variable: 'q' }, goto: 'верно' }],
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
        { id: 'r1', when: { kind: 'equals', variable: 'q', value: 'a' }, goto: 'один' },
        { id: 'r2', when: { kind: 'equals', variable: 'q', value: 'b' }, goto: 'два' },
        { id: 'r3', when: { kind: 'equals', variable: 'q', value: 'c' }, goto: 'один' },
      ],
      default: 'два',
    });
    expect(preloadTargetsOfExit(s).sort()).toEqual(['два', 'один']);
  });

  it('у концовки греть нечего', () => {
    expect(preloadTargetsOfExit(segment('s', { rules: [], default: null }))).toEqual([]);
  });
});

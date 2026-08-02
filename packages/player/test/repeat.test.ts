/**
 * Повтор куска: какие остановки молчат, чьи ответы стираются.
 *
 * Чистые функции, юнитами — `Player` юнит-тестами не покрыт и быть не может
 * (инвариант №1: часы — позиция в аудио, в юните аудио нет). Поведение
 * зрителя целиком проверяет e2e/player-repeat.spec.ts; здесь — только
 * правило, которое плеер зовёт, не имея своей копии.
 */
import { describe, expect, it } from 'vitest';

import { answersToClear, openableGates } from '../src/repeat.js';

const gate = (id: string, recordAs: string) => ({ id, recordAs });

describe('какие остановки открываются', () => {
  const gates = [gate('g1', 'v1'), gate('g2', 'v2')];

  it('первый проход: открываются все', () => {
    expect(openableGates(gates, new Set()).map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('отвеченные в этом просмотре молчат', () => {
    expect(openableGates(gates, new Set(['g1'])).map((g) => g.id)).toEqual(['g2']);
  });

  it('порядок остановок сохраняется', () => {
    expect(openableGates(gates, new Set()).map((g) => g.id)).toEqual(['g1', 'g2']);
  });
});

describe('чьи ответы стираются при повторе', () => {
  const segments = [
    { id: 'a', gates: [gate('g-a', 'ответА')] },
    { id: 'b', gates: [gate('g-b', 'ответБ')] },
  ];

  it('стираются ответы остановок, чьи переменные прочитало сработавшее правило', () => {
    const rule = { id: 'r1', goto: 'a', when: [{ kind: 'equals', variable: 'ответБ', value: 'нет' }] };
    expect([...answersToClear(segments, rule)]).toEqual(['g-b']);
  });

  it('запасной выход не стирает ничего: у него нет условий', () => {
    expect([...answersToClear(segments, null)]).toEqual([]);
  });

  it('правило по переменной из ЧУЖОГО куска стирает именно ту остановку', () => {
    const rule = { id: 'r1', goto: 'a', when: [{ kind: 'equals', variable: 'ответА', value: 'да' }] };
    expect([...answersToClear(segments, rule)]).toEqual(['g-a']);
  });

  it('условие без переменной пропускается, а не роняет переход', () => {
    const rule = { id: 'r1', goto: 'a', when: [{ kind: 'correct' } as { variable?: string }] };
    expect([...answersToClear(segments, rule)]).toEqual([]);
  });
});

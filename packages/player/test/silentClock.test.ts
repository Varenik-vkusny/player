/**
 * Часы немого сегмента: арифметика якоря.
 *
 * Контекст здесь ПОДСТАВНОЙ, и это не замена браузерной проверке, а то, чего
 * браузер дать не может, — управляемое время. В живом `AudioContext` нельзя
 * встать ровно на 1.5 с и спросить позицию; здесь можно, и потому проверяется
 * то самое, ради чего часы существуют: что остановка на гейте не отматывает
 * время назад и что стык узлов планируется точно.
 *
 * Живой прогон в браузере закрывает `e2e/silent.spec.ts` — там проверяется,
 * что слайды немого сегмента действительно сменяются.
 */
import { describe, expect, it } from 'vitest';

import { SilentClock } from '../src/clock.js';

/** Минимум, которым пользуется SilentClock. Больше он ни о чём контекст не просит. */
function fakeContext(): { ctx: AudioContext; setNow: (t: number) => void } {
  const state = { currentTime: 0, state: 'running' as AudioContextState };
  const ctx = {
    get currentTime() { return state.currentTime; },
    get state() { return state.state; },
    async suspend() { state.state = 'suspended'; },
    async resume() { state.state = 'running'; },
  };
  return {
    ctx: ctx as unknown as AudioContext,
    setNow: (t: number) => { state.currentTime = t; },
  };
}

const LEAD = 0.02;

describe('SilentClock', () => {
  it('длительность берётся объявленной, а не выводится из дорожки', () => {
    const { ctx } = fakeContext();
    expect(new SilentClock(ctx, 6).duration).toBe(6);
  });

  it('отказывает на бессмысленной длительности', () => {
    // Слом: убрать проверку в конструкторе — немой сегмент нулевой длины
    // построится молча, и слайды на нём не сменятся ни разу.
    const { ctx } = fakeContext();
    expect(() => new SilentClock(ctx, 0)).toThrow(RangeError);
    expect(() => new SilentClock(ctx, -1)).toThrow(RangeError);
    expect(() => new SilentClock(ctx, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('до старта позиция ноль, а стык не запланирован', () => {
    const { ctx } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    expect(clock.position).toBe(0);
    expect(clock.scheduleEnd).toBeNull();
    expect(clock.isRunning).toBe(false);
  });

  it('позиция идёт вместе с контекстным временем', () => {
    // Слом: считать позицию от `performance.now()` вместо `ctx.currentTime` —
    // подставной контекст перестанет на неё влиять, и тест покраснеет.
    // Это же и есть проверка инварианта №1: время берётся из контекста.
    const { ctx, setNow } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    setNow(10);
    const startAt = clock.start();
    expect(startAt).toBeCloseTo(10 + LEAD, 6);

    // Ещё не дошли до запланированного старта — позиция стоит на нуле.
    setNow(10 + LEAD / 2);
    expect(clock.position).toBe(0);

    setNow(11.5);
    expect(clock.position).toBeCloseTo(1.5 - LEAD, 6);

    // За концом сегмента позиция не растёт.
    setNow(100);
    expect(clock.position).toBe(6);
  });

  it('старт со смещения не отматывает время назад', () => {
    const { ctx, setNow } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    setNow(5);
    clock.start(2);
    setNow(5 + LEAD);
    expect(clock.position).toBeCloseTo(2, 6);
  });

  it('стык узлов планируется РОВНО на конец сегмента', () => {
    // От этого зависит переход между кусками: S9 намерил, что ловля конца
    // опросом в кадре даёт 65 мс задержки и щелчок на одном переходе
    // из двадцати. Слом: вернуть из scheduleEnd `ctxTime + duration`,
    // забыв вычесть смещение старта, — покраснеет второй случай.
    const { ctx, setNow } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    setNow(3);
    const startAt = clock.start();
    expect(clock.scheduleEnd).toBeCloseTo(startAt + 6, 6);

    clock.stop();
    setNow(3);
    const startedLate = clock.start(2);
    expect(clock.scheduleEnd).toBeCloseTo(startedLate + 4, 6);
  });

  it('остановка на гейте встаёт РОВНО на цели и не отматывает', async () => {
    // Инвариант №4: возобновление идёт с той же позиции, перемотки
    // не происходит никогда. Слом: записать в freezeAt текущую позицию
    // вместо целевой — тест покраснеет на первом же ожидании.
    const { ctx, setNow } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    setNow(0);
    clock.start();
    setNow(2.517);

    await clock.freezeAt(2.5);

    expect(clock.isFrozen).toBe(true);
    expect(clock.isRunning).toBe(false);
    expect(clock.position).toBe(2.5);
    expect(ctx.state).toBe('suspended');

    // Замороженная позиция не зависит от того, сколько простояли.
    setNow(60);
    expect(clock.position).toBe(2.5);

    await clock.resumeFromFreeze();
    expect(ctx.state).toBe('running');
    expect(clock.isFrozen).toBe(false);
    setNow(60 + LEAD);
    expect(clock.position).toBeCloseTo(2.5, 6);
  });

  it('остановка ДО первого движения времени возможна', () => {
    // Гейт на нулевой секунде — первое, что построит автор на пустом проекте.
    const { ctx } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    clock.holdBeforeStart(0);
    expect(clock.isFrozen).toBe(true);
    expect(clock.position).toBe(0);
  });

  it('перемотка головки в редакторе не будит остановленные часы', () => {
    const { ctx, setNow } = fakeContext();
    const clock = new SilentClock(ctx, 6);

    clock.seek(3);
    expect(clock.position).toBe(3);
    expect(clock.isRunning).toBe(false);

    setNow(0);
    clock.start(3);
    setNow(LEAD);
    clock.seek(1);
    expect(clock.isRunning).toBe(true);
    setNow(2 * LEAD);
    expect(clock.position).toBeCloseTo(1, 6);
  });

  it('перемотка за пределы сегмента отказывает', () => {
    const { ctx } = fakeContext();
    const clock = new SilentClock(ctx, 6);
    expect(() => clock.seek(6.001)).toThrow(RangeError);
    expect(() => clock.seek(-0.001)).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadProject } from '@player/core';
import type { Condition, ExitRule } from '@player/core';

import { conditionText, ruleText } from '../src/state/conditionText.js';

/**
 * Человеческое описание условия и правила выхода (переехало из
 * `panels/SegmentPanel.tsx` в общий модуль — см. комментарий модуля).
 * Чистая логика, без React и DOM — как её соседи `exits.test.ts`
 * и `branchTree.test.ts`.
 *
 * Фикстура грузится через `loadProject`, а не `ProjectSchema.parse`:
 * `conditions.json` лежит в старой версии схемы и доходит до текущей
 * только через миграцию.
 */

const FIXTURES = fileURLToPath(new URL('../../../fixtures/projects/', import.meta.url));

function loadFixture(name: string) {
  return loadProject(JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')));
}

const project = loadFixture('conditions.json');

describe('conditionText', () => {
  /**
   * Что сломает: замена `optionLabelAnywhere` на голый `condition.value`
   * (например, случайно вернуть id вместо подписи) — тест покраснеет,
   * ожидая «Четыре», а получая «4».
   * Верно ли при любой реализации: нет — тождество здесь нетривиально,
   * подпись и id у варианта «4»/«Четыре» РАЗНЫЕ строки.
   */
  it('equals: значение — подпись варианта, а не его id', () => {
    const condition: Condition = { kind: 'equals', variable: 'счёт', value: '4' };
    expect(conditionText(condition, project)).toBe('«счёт» = «Четыре»');
  });

  it('notEquals: значение — подпись варианта, а не его id', () => {
    const condition: Condition = { kind: 'notEquals', variable: 'дальше', value: 'opt-skip' };
    expect(conditionText(condition, project)).toBe('«дальше» ≠ «Хватит на сегодня»');
  });

  it('correct: без значения, только имя переменной и слово «верно»', () => {
    const condition: Condition = { kind: 'correct', variable: 'счёт' };
    expect(conditionText(condition, project)).toBe('«счёт» верно');
  });

  it('wrong: без значения, только имя переменной и слово «неверно»', () => {
    const condition: Condition = { kind: 'wrong', variable: 'дальше' };
    expect(conditionText(condition, project)).toBe('«дальше» неверно');
  });

  /**
   * Что сломает: перепутать знак в `OP_SIGN` (например, `gte` → «>» вместо
   * «≥») — тест покраснеет на конкретном символе.
   * Верно ли при любой реализации: нет — четыре знака сравнения различны,
   * совпадение возможно только если код действительно смотрит на `op`.
   */
  it('compare: знак берётся из операции, число — как есть', () => {
    expect(conditionText({ kind: 'compare', variable: 'счёт', op: 'gt', value: 3 }, project))
      .toBe('«счёт» > 3');
    expect(conditionText({ kind: 'compare', variable: 'счёт', op: 'gte', value: 4 }, project))
      .toBe('«счёт» ≥ 4');
    expect(conditionText({ kind: 'compare', variable: 'счёт', op: 'lt', value: 4 }, project))
      .toBe('«счёт» < 4');
    expect(conditionText({ kind: 'compare', variable: 'счёт', op: 'lte', value: 3 }, project))
      .toBe('«счёт» ≤ 3');
  });

  /**
   * Подпись не нашлась (id не существующего варианта) — честный фолбэк
   * на сам id, а не пустая строка и не бросок.
   * Что сломает: замена `?? optionId` на `?? ''` — тест увидит пустые кавычки.
   */
  it('неизвестный id варианта — подписью остаётся сам id', () => {
    const condition: Condition = { kind: 'equals', variable: 'счёт', value: 'unknown-id' };
    expect(conditionText(condition, project)).toBe('«счёт» = «unknown-id»');
  });
});

describe('ruleText', () => {
  /**
   * Настоящее правило из фикстуры: два условия через «и», подписи вариантов,
   * а не id, и цель — title сегмента.
   * Что сломает: соединить условия через «&&» вместо «и» (буквальное слово
   * схемы вместо слова автора), или подставить id цели вместо title.
   * Верно ли при любой реализации: нет — сравнивается КОНКРЕТНАЯ строка.
   */
  it('склеивает условия через «и» и показывает title цели', () => {
    const segment = project.segments.find((candidate) => candidate.id === 's-next')!;
    const rule: ExitRule = segment.exit.rules[0]!;
    expect(rule.id).toBe('r-deep');
    expect(ruleText(rule, project)).toBe(
      '«счёт» ≥ 4 и «дальше» ≠ «Хватит на сегодня» → Углубление для тех, кто посчитал верно и не остановился',
    );
  });

  /**
   * Цель, которой нет в проекте (гипотетическое рассогласование), — честный
   * фолбэк на сам id цели, тем же способом, что и для подписи варианта выше.
   */
  it('несуществующая цель — заголовком остаётся сам id', () => {
    const rule: ExitRule = { id: 'r-fake', when: [{ kind: 'correct', variable: 'счёт' }], goto: 'no-such-segment' };
    expect(ruleText(rule, project)).toBe('«счёт» верно → no-such-segment');
  });
});

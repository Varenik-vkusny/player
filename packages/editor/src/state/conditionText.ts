/**
 * Человеческое описание условия выхода и правила выхода целиком.
 *
 * Переехало из `panels/SegmentPanel.tsx` (было приватным там): вид «Ветки»
 * обязан показывать ТУ ЖЕ строку — «при каком ответе рассказ уходит в эту
 * ветку», — а вторая копия перевода разъехалась бы с первой МОЛЧА. В проекте
 * это уже случалось со списком типов элементов. Один модуль, один перевод,
 * оба вида (панель сегментов и доска веток) читают отсюда.
 *
 * Чистый модуль — без React, без DOM, как и его соседи в `state/`.
 */
import type { Condition, ExitRule, Project } from '@player/core';

import { answerVariables } from './exits.js';

/** Заголовок сегмента для показа автору — title, если он есть, иначе id. */
export function titleOfId(project: Project, id: string): string {
  const segment = project.segments.find((candidate) => candidate.id === id);
  return segment ? (segment.title || segment.id) : id;
}

/** Знак сравнения так, как его читает автор, а не как он назван в схеме. */
const OP_SIGN: Record<'gt' | 'gte' | 'lt' | 'lte', string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

/**
 * Подпись варианта, найденная по ВСЕМУ объяснению.
 *
 * Ищет среди переменных всего проекта, а не одного сегмента: правило выхода
 * вправе смотреть на переменную, записанную гейтом другого сегмента
 * (`docs/planning.md` §12.2 — известный долг). Не нашли — подписью остаётся
 * сам id, честно, а не выдуманное имя.
 */
export function optionLabelAnywhere(project: Project, variable: string, optionId: string): string {
  const source = answerVariables(project).find((candidate) => candidate.name === variable);
  return source?.options.find((option) => option.id === optionId)?.label ?? optionId;
}

/**
 * Человеческое описание ОДНОГО условия.
 *
 * Значение показывается ПОДПИСЬЮ варианта, а не его id: «opt-skip» — слово
 * схемы, «Хватит на сегодня» — слово автора, и в правиле он ищет глазами
 * именно второе.
 */
export function conditionText(condition: Condition, project: Project): string {
  switch (condition.kind) {
    case 'equals':
      return `«${condition.variable}» = «${optionLabelAnywhere(project, condition.variable, condition.value)}»`;
    case 'notEquals':
      return `«${condition.variable}» ≠ «${optionLabelAnywhere(project, condition.variable, condition.value)}»`;
    case 'correct':
      return `«${condition.variable}» верно`;
    case 'wrong':
      return `«${condition.variable}» неверно`;
    case 'compare':
      return `«${condition.variable}» ${OP_SIGN[condition.op]} ${condition.value}`;
    default: {
      const unreachable: never = condition;
      throw new Error(`Неизвестный вид условия: ${JSON.stringify(unreachable)}`);
    }
  }
}

/**
 * Человеческое описание правила выхода: цепочка условий и цель.
 *
 * Условия соединены словом «и», а не значком: список читается сверху вниз
 * как предложение, и знак `&&` в нём был бы словом схемы, а не автора.
 */
export function ruleText(rule: ExitRule, project: Project): string {
  const target = titleOfId(project, rule.goto);
  return `${rule.when.map((condition) => conditionText(condition, project)).join(' и ')} → ${target}`;
}

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
 * КОРОТКОЕ имя условия — то, что автор прочитает с одного взгляда.
 *
 * `conditionText` рядом даёт полную запись со ссылкой на переменную:
 * «otvet» = «Останавливается и ждёт». Она верна и нужна там, где условий
 * несколько и надо понимать, о какой переменной речь.
 *
 * На доске веток она вредна: имя ветки стоит под своей развилкой, автор
 * и так видит, из какого вопроса ветка вышла, а имя переменной — слово
 * схемы, не его. Остаётся то, что он выбирал руками: подпись ответа.
 *
 * Разбирать строку `conditionText` обратно было бы вторым парсером своего
 * же формата — поэтому короткая форма строится из тех же данных, а не
 * из готового текста.
 */
export function conditionAnswer(condition: Condition, project: Project): string {
  switch (condition.kind) {
    case 'equals':
      return optionLabelAnywhere(project, condition.variable, condition.value);
    case 'notEquals':
      return `не ${optionLabelAnywhere(project, condition.variable, condition.value)}`;
    case 'correct':
      return 'верный ответ';
    case 'wrong':
      return 'неверный ответ';
    case 'compare':
      return `${OP_SIGN[condition.op]} ${condition.value}`;
    default: {
      const unreachable: never = condition;
      throw new Error(`Неизвестный вид условия: ${JSON.stringify(unreachable)}`);
    }
  }
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

/**
 * Куда ведёт ОДИН вариант ответа.
 *
 * Куплено 18.08.2026: владелец нажал «разделить здесь» и не понял, что
 * получилось. Разбирая случай, приёмщик насчитал ЧЕТЫРЕ действия в четырёх
 * местах, ни одно из которых не подсказано. Одно из четырёх — «развести
 * ответы по главам»: варианты живут в панели остановки, а их назначение —
 * в отдельной секции «Правила выхода», и связь между ними автор держит
 * в голове.
 *
 * Это ПОКАЗ, а не устройство: модель не меняется. Остановка по-прежнему
 * только записывает ответ и никуда не перекидывает, решение принимает выход
 * главы (ADR-015). Здесь лишь читается уже принятое решение и называется
 * словами автора.
 *
 * Второго перевода не заводится: заголовок главы берётся `titleOfId` —
 * той же функцией, которой пользуется `ruleText` для секции «Правила
 * выхода». Разъехаться двум показам одного факта нечем.
 *
 * Правила ищутся ПО ВСЕМУ ПРОЕКТУ, а `default` берётся у главы, которой
 * принадлежит остановка. Довод у обоих один — не соврать: правило вправе
 * смотреть на переменную, записанную гейтом другой главы (`optionLabelAnywhere`
 * выше, долг §12.2), и, найдя его только у своей главы, мы объявили бы
 * «никуда не ведёт» там, где рассказ идёт. А безусловный выход — свойство
 * именно той главы, из которой рассказ уходит.
 */
export type OptionDestination =
  /** Есть своё правило: этот ответ уводит вот сюда. */
  | { readonly via: 'rule'; readonly targetId: string; readonly text: string }
  /** Своего правила нет, но у главы есть безусловный выход. */
  | { readonly via: 'default'; readonly targetId: string; readonly text: string }
  /** Ответ участвует в правилах, но не как простое равенство: одним именем не назвать. */
  | { readonly via: 'conditions'; readonly targetId: null; readonly text: string }
  /** Выхода нет вовсе: рассказ на этом ответе кончается. */
  | { readonly via: 'none'; readonly targetId: null; readonly text: string };

export function optionDestination(
  project: Project,
  segmentId: string,
  variable: string,
  optionId: string,
): OptionDestination {
  const own = project.segments.find((candidate) => candidate.id === segmentId);

  const isThisOption = (condition: Condition): boolean =>
    condition.kind === 'equals' && condition.variable === variable && condition.value === optionId;

  const matching = project.segments.flatMap((segment) =>
    segment.exit.rules.filter((rule) => rule.when.some(isThisOption)));

  // Ровно одно правило и ровно из одного условия — единственный случай,
  // когда назначение выражается одним именем главы. Всё прочее (два правила
  // про один ответ, цепочка через «и») зависит ещё от чего-то, и назвать
  // это одной главой значило бы соврать точнее, чем промолчать.
  const plain = matching.filter((rule) => rule.when.length === 1);
  if (matching.length === 1 && plain.length === 1) {
    const targetId = plain[0]!.goto;
    return { via: 'rule', targetId, text: `ведёт в «${titleOfId(project, targetId)}»` };
  }
  if (matching.length > 0) {
    return {
      via: 'conditions',
      targetId: null,
      text: 'зависит от условий — смотрите «Правила выхода»',
    };
  }

  // Своего правила нет. Если у главы есть ДРУГИЕ правила про эту же
  // переменную, ответ проваливается мимо них — куда именно, решает всё тот
  // же выход, и честно назвать это можно только через «Правила выхода».
  /*
   * МОЖЕТ ЛИ ЭТОТ ОТВЕТ ВООБЩЕ ПОПАСТЬ ПОД ЧУЖОЕ ПРАВИЛО.
   *
   * Своего правила у него нет (проверено выше). Но правило про ТУ ЖЕ
   * переменную может его зацепить — например, условием «не равно A».
   * Тогда назвать одну главу нельзя честно, и остаётся отправить автора
   * в «Правила выхода».
   *
   * А вот правило вида «переменная равна ДРУГОМУ ответу» зацепить его
   * не может никогда: равенство с чужим значением при этом ответе ложно
   * по построению. Значит рассказ пойдёт запасным выходом, и это можно
   * сказать прямо.
   *
   * Уточнено 22.08.2026. Прежняя проверка считала «зависит от условий»
   * при ЛЮБОМ упоминании переменной, и после того, как «Завести ветку»
   * стала сразу давать главе запасной выход, автор на втором ответе видел
   * «зависит от условий — смотрите Правила выхода» там, где правда была
   * проста: «пойдёт туда же, куда все остальные».
   */
  const couldMatch = (own?.exit.rules ?? []).some((rule) =>
    rule.when.some((condition) => condition.variable === variable && condition.kind !== 'equals'));
  const fallback = own?.exit.default ?? null;

  if (fallback !== null) {
    const via = couldMatch ? 'conditions' : 'default';
    const title = titleOfId(project, fallback);
    return via === 'default'
      ? { via: 'default', targetId: fallback, text: `пойдёт в «${title}», как и все остальные ответы` }
      : { via: 'conditions', targetId: null, text: 'зависит от условий — смотрите «Правила выхода»' };
  }

  return {
    via: 'none',
    targetId: null,
    text: 'никуда не ведёт: рассказ на этом ответе кончится',
  };
}


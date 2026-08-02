/**
 * Копия куска — жёсткая копия (product.md §7, вторая из трёх механик
 * переиспользования). Не путать с «повтором своего раздела» (ребро назад
 * по графу, ничего не копируется, см. `exits.ts: connect`) и со «ссылкой
 * на общий блок» (отложено [П]). Копия дальше живёт своей жизнью: правки
 * оригинала её не касаются и наоборот.
 *
 * **Несущее ограничение.** Схема (`schema.ts`, `ProjectSchema.superRefine`)
 * запрещает двум остановкам писать в одну переменную ПО ВСЕМУ ПРОЕКТУ:
 * «Второй ответ затёр бы первый, и правило выхода стало бы неоднозначным».
 * Значит копия остановки обязана получить своё имя `recordAs`, а вместе
 * с ним — переписанные ссылки на неё в условиях: собственных правилах
 * выхода куска и условиях показа вариантов ответа. Без этого каскада
 * проект переставал бы сохраняться не в момент копирования, а позже,
 * при следующей загрузке — автор узнал бы о поломке дальше от причины.
 *
 * Это и есть долг §13.2 (префикс переменных), до сих пор теоретический:
 * «пока блоки не вставляются из других проектов, разница теоретическая».
 * Копия куска делает его практическим.
 *
 * Свободные имена — только через `freeId` (`elements.ts`), а не свой
 * генератор: он же используется `addSegment` и `split.ts`, и повторять
 * его ограничения `Id` из схемы во втором месте значило бы дать им
 * разъехаться.
 *
 * Чистый модуль — как и `split.ts`, ни React, ни DOM, ни `project.segments`.
 * Работает с ОДНОЙ частью и списками занятых имён, которые ей передаёт
 * вызывающий; сборка нового `project.segments` — работа узкой дверцы
 * `state/project.ts` (её экспортированный `duplicateSegment`). Так копию
 * можно проверять юнит-тестами без проекта целиком, а дверца остаётся
 * закрытой (тест инвариантов, «дверца: project.segments и project.entry
 * читают в одном месте»).
 */
import type { Condition, Gate, Segment } from '@player/core';

import { freeId } from './elements.js';

/**
 * Заголовок копии — не совпадает с оригиналом, иначе в списке кусков автор
 * видит два одинаково названных элемента и не понимает, где оригинал,
 * а где копия (найдено владельцем в круге правок 1: тест из брифа искал
 * копию ПО СОВПАДЕНИЮ заголовка, и это продиктовало продукту неверное
 * поведение вместо того, чтобы его проверять).
 *
 * Правило: `«Кусок» → «Кусок — копия»`. Если заголовок УЖЕ кончается на
 * «— копия» (с необязательным номером), пометка не дублируется — вместо
 * «А — копия — копия» получается «А — копия 2», затем «А — копия 3» и так
 * далее: копия копии копии остаётся читаемой, а не расползается вширь.
 *
 * Пустой заголовок (`title: ''`, законное значение схемы) не трогаем: и
 * список кусков, и `titleOf` в `SegmentPanel.tsx` в этом случае показывают
 * `id`, а id копии и так гарантированно другой (см. `copySegment` ниже) —
 * дописывать пометку было бы дописыванием к тому, чего не видно.
 */
export function titleForCopy(sourceTitle: string): string {
  if (sourceTitle.trim() === '') return sourceTitle;

  const match = /^(.*) — копия(?: (\d+))?$/.exec(sourceTitle);
  if (!match) return `${sourceTitle} — копия`;

  const base = match[1]!;
  const previousNumber = match[2] ? Number(match[2]) : 1;
  return `${base} — копия ${previousNumber + 1}`;
}

/**
 * «circle-3» → «circle», «g-fork» остаётся собой: числовой хвост срезается,
 * чтобы новый id выглядел как свободное имя того же семейства, а не как
 * суффикс поверх суффикса («circle-3-1»).
 */
function prefixOf(id: string): string {
  const match = /^(.+)-\d+$/.exec(id);
  return match ? match[1]! : id;
}

/**
 * Раздаёт свободные id по образцу исходного. `seed` — то, что уже занято
 * ДО первой раздачи (например, id самого оригинала — чтобы копия точно
 * не унаследовала его имя); каждая выдача сразу метится занятой, иначе
 * вторая claim с тем же префиксом в одном проходе получила бы то же имя.
 */
function claimer(seed: readonly { id: string }[] = []) {
  const taken = [...seed];
  return (sourceId: string): string => {
    const id = freeId(prefixOf(sourceId), taken);
    taken.push({ id });
    return id;
  };
}

/** Что меняется у переменной остановки при копировании: новое имя и карта
 *  «старый id варианта → новый» (пустая у остановок без вариантов). */
interface VariableRemap {
  readonly variable: string;
  readonly options: ReadonlyMap<string, string>;
}

/**
 * Переписывает условие, если оно смотрит на переменную ИЗ ЭТОЙ копии.
 *
 * Условия на переменные ЧУЖИХ (не копируемых) остановок не трогаем: те
 * остановки по-прежнему стоят там же и пишут те же имена — переписывать
 * ссылку на них значило бы сослаться на переменную, которой никто не пишет.
 * Совпадение имени исключено схемой: `recordAs` уникален по всему проекту
 * ДО копирования, поэтому ключ `variableRemap`, взятый у гейта ЭТОГО куска,
 * не может случайно означать чужую переменную.
 */
function remapCondition(condition: Condition, remap: ReadonlyMap<string, VariableRemap>): Condition {
  const target = remap.get(condition.variable);
  if (!target) return condition;
  if (condition.kind === 'equals' || condition.kind === 'notEquals') {
    return { ...condition, variable: target.variable, value: target.options.get(condition.value) ?? condition.value };
  }
  return { ...condition, variable: target.variable };
}

function remapConditions(when: readonly Condition[], remap: ReadonlyMap<string, VariableRemap>): Condition[] {
  return when.map((condition) => remapCondition(condition, remap));
}

/**
 * Копирует ОДНУ часть жёстко: новые id элементам, слайдам, остановкам,
 * правилам выхода, новое имя переменной у каждой остановки — и один проход,
 * переписывающий все ссылки на них внутри копии.
 *
 * `takenSegmentIds` и `takenVariables` — то, что уже занято в проекте: сама
 * функция проект не видит (см. комментарий модуля), поэтому обязана
 * выдать копии неконфликтующие id и имя переменной, каких ей передал
 * вызывающий. Идентична по духу `takenSegmentIds` в `splitSegmentAtGate`.
 *
 * Дорожка НЕ копируется: копия ссылается на тот же файл тем же окном
 * (`src`/`fileId`, `offset`, `duration`, `words`) — ровно так же, как это
 * уже делает разрез (`split.ts`) и `addSegment` (`exits.ts`): своей озвучки
 * у только что созданного куска взяться неоткуда.
 *
 * `exit.rules[].goto` и `exit.default` остаются ПРЕЖНИМИ: копия ведёт туда
 * же, куда вёл оригинал — предсказуемо и обратимо. Увести копию в никуда
 * значило бы сделать недостижимым то, что автор только что создал.
 *
 * Порядок работы: сначала карты «старый id → новый» по каждому виду
 * (элементы, слайды, остановки — вместе с переменной и вариантами ответа),
 * потом один проход переписывает все ссылки сразу. Иначе условие,
 * ссылающееся на остановку, которая встретится в списке позже, осталось бы
 * смотреть на старое имя.
 */
export function copySegment(
  source: Segment,
  takenSegmentIds: readonly { id: string }[],
  takenVariables: readonly { id: string }[],
): Segment {
  const newSegmentId = claimer(takenSegmentIds)(source.id);

  // --- карта: элементы ---
  const claimElementId = claimer(source.elements);
  const elementIdMap = new Map<string, string>();
  const elements = source.elements.map((element) => {
    const id = claimElementId(element.id);
    elementIdMap.set(element.id, id);
    return { ...element, id };
  });

  // --- карта: слайды, и сразу переезд ссылок на элементы в states ---
  const claimSlideId = claimer(source.slides);
  const slides = source.slides.map((slide) => ({
    ...slide,
    id: claimSlideId(slide.id),
    states: Object.fromEntries(
      Object.entries(slide.states).map(([elementId, state]) => [elementIdMap.get(elementId) ?? elementId, state]),
    ),
  }));

  // --- карта: переменные остановок — ПО ВСЕМУ ПРОЕКТУ, не только по куску
  // (см. `takenVariables` в комментарии функции и schema.ts: «Переменная
  // записывается дважды…»).
  const claimVariable = claimer(takenVariables);
  const claimGateId = claimer(source.gates);

  // Первый проход по остановкам: новые id, новое имя переменной, новые id
  // вариантов ответа. `when` вариантов пока не трогаем — они могут смотреть
  // на переменную остановки, которая в этом цикле встретится позже, а карта
  // должна быть полной до того, как переписывать ссылки.
  const variableRemap = new Map<string, VariableRemap>();
  const gatesStep1: Gate[] = source.gates.map((gate) => {
    const id = claimGateId(gate.id);
    const newRecordAs = claimVariable(gate.recordAs);

    if (gate.config.kind !== 'choice') {
      variableRemap.set(gate.recordAs, { variable: newRecordAs, options: new Map() });
      return { ...gate, id, recordAs: newRecordAs };
    }

    const claimOptionId = claimer(gate.config.options);
    const optionIdMap = new Map<string, string>();
    const options = gate.config.options.map((option) => {
      const optionId = claimOptionId(option.id);
      optionIdMap.set(option.id, optionId);
      return { ...option, id: optionId };
    });
    variableRemap.set(gate.recordAs, { variable: newRecordAs, options: optionIdMap });

    return {
      ...gate,
      id,
      recordAs: newRecordAs,
      config: {
        ...gate.config,
        options,
        correctId: gate.config.correctId === null ? null : (optionIdMap.get(gate.config.correctId) ?? null),
      },
    };
  });

  // Второй проход: карта переменных этого куска теперь полна — переписываем
  // условия показа вариантов ответа.
  const gates: Gate[] = gatesStep1.map((gate) => {
    if (gate.config.kind !== 'choice') return gate;
    const options = gate.config.options.map((option) =>
      option.when ? { ...option, when: remapConditions(option.when, variableRemap) } : option,
    );
    return { ...gate, config: { ...gate.config, options } };
  });

  // --- карта: правила выхода — goto и default НЕ переезжают (см. комментарий
  // функции), меняются только id правила и переменная/значение в условиях.
  const claimRuleId = claimer(source.exit.rules);
  const exit = {
    rules: source.exit.rules.map((rule) => ({
      id: claimRuleId(rule.id),
      when: remapConditions(rule.when, variableRemap),
      goto: rule.goto,
    })),
    default: source.exit.default,
  };

  return {
    ...source,
    id: newSegmentId,
    title: titleForCopy(source.title),
    elements,
    slides,
    gates,
    exit,
  };
}

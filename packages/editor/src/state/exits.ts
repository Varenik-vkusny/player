/**
 * Правила выхода сегментов в редакторе: создание/удаление/переименование
 * сегментов, правила выхода между ними, вопросы «что достижимо» и «какой
 * исход гейта не покрыт правилами».
 *
 * Было `state/graph.ts` — про рёбра гейтов версии 2, где ответ на гейте сам
 * решал, куда прыгнуть. В версии 3 гейт только записывает ответ в переменную
 * (`recordAs`), а решение о следующем сегменте принимает `Exit` — поле
 * самого сегмента (ADR-015). Файл переименован и переписан вокруг этого:
 * вместо `Edge`/`EdgeWhen` — `ExitRule`/`Condition`, вместо узла с рёбрами —
 * сегмент с полем `exit`.
 *
 * Чистый модуль — без React, без DOM, без побочных эффектов. Узкая дверца
 * к `project.segments` — это `state/project.ts` (см. его комментарий); этот
 * файл в белый список дверцы не входит и потому обязан обращаться только
 * к структуре хребта (`project.segments`, `project.entry`) и к полям
 * сегмента (`segment.exit`, `segment.gates`), а не к слайдам или элементам.
 */
import type { Condition, Exit, ExitRule, Gate, Project, Segment } from '@player/core';

import { freeId } from './elements.js';

/**
 * Создаёт новый сегмент-концовку: без правил выхода, без элементов, с одним
 * слайдом на нуле (минимум схемы).
 *
 * Дорожка копируется у сегмента `audioFrom` ПО ССЫЛКЕ, не глубокой копией:
 * `audio` — обязательное поле схемы, а своей дорожки у нового сегмента пока
 * взяться неоткуда (загрузка аудио — не в этой сессии). Копия объекта
 * раздула бы память проекта без всякой пользы: содержимое всё равно общее.
 */
export function addSegment(project: Project, audioFrom: string): { project: Project; segment: Segment } {
  const source = project.segments.find((candidate) => candidate.id === audioFrom);
  if (!source) {
    throw new Error(`Сегмента «${audioFrom}», у которого берётся дорожка, нет в проекте`);
  }

  const id = freeId('segment', project.segments);
  const segment: Segment = {
    id,
    // Порядковый номер нового сегмента в массиве — не id и не число сегментов
    // ДО добавления, а позиция, которую сегмент займёт (segments.length + 1).
    title: `Сегмент ${project.segments.length + 1}`,
    audio: source.audio,
    elements: [],
    slides: [{ id: freeId('slide', []), at: { kind: 'seconds', t: 0 }, transition: 'morph', states: {} }],
    gates: [],
    exit: { rules: [], default: null },
  };

  return { project: { ...project, segments: [...project.segments, segment] }, segment };
}

/**
 * Удаляет сегмент и ВСЕ ссылки на него у остальных сегментов — правила
 * выхода, ведущие в удалённый сегмент, и `default`, если он на него указывал.
 *
 * Без каскада схема отказала бы при следующей загрузке: `ExitRule.goto`
 * и `Exit.default` обязаны указывать на существующий сегмент. Узнать об этом
 * на сохранении, а не спустя полчаса при следующем открытии, дешевле.
 */
export function removeSegment(project: Project, segmentId: string): Project {
  if (segmentId === project.entry) {
    // Стартовый сегмент один и он обязателен схемой — удалить его значило бы
    // оставить объяснение без входной точки.
    throw new Error(`Стартовый сегмент «${segmentId}» удалить нельзя: он обязателен схемой`);
  }
  if (!project.segments.some((segment) => segment.id === segmentId)) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте`);
  }

  const segments = project.segments
    .filter((segment) => segment.id !== segmentId)
    .map((segment) => {
      const rules = segment.exit.rules.filter((rule) => rule.goto !== segmentId);
      const defaultId = segment.exit.default === segmentId ? null : segment.exit.default;
      // Ничего не изменилось — та же ссылка на exit, как и было: на этом
      // держится решение StageView, пересобирать сцену или нет.
      if (rules.length === segment.exit.rules.length && defaultId === segment.exit.default) return segment;
      return { ...segment, exit: { rules, default: defaultId } };
    });

  return { ...project, segments };
}

/** Переименовывает сегмент, не трогая остальное. */
export function renameSegment(project: Project, segmentId: string, title: string): Project {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте`);
  }
  if (segment.title === title) return project;

  const segments = project.segments.map((candidate) => (candidate.id === segmentId ? { ...candidate, title } : candidate));
  return { ...project, segments };
}

/**
 * Сегменты, достижимые из `startId` (по умолчанию — из `project.entry`),
 * включая сам старт.
 *
 * Обход по `exit.rules[].goto` и `exit.default` — оба способа выйти
 * из сегмента, а не только первый подошедший: достижимость спрашивает
 * «куда МОЖЕТ привести», а не «куда приведёт вот этот конкретный ответ».
 * Ссылки на несуществующие сегменты пропускаются: в валидном проекте их
 * не бывает, а бросать здесь незачем — функция отвечает на вопрос «что
 * достижимо», а не «валиден ли проект».
 */
export function reachableFrom(project: Project, startId?: string): ReadonlySet<string> {
  const start = startId ?? project.entry;
  const byId = new Map(project.segments.map((segment) => [segment.id, segment] as const));

  const visited = new Set<string>([start]);
  const stack = [start];

  while (stack.length > 0) {
    const id = stack.pop()!;
    const segment = byId.get(id);
    if (!segment) continue;
    const targets = segment.exit.rules.map((rule) => rule.goto);
    if (segment.exit.default !== null) targets.push(segment.exit.default);
    for (const to of targets) {
      if (visited.has(to)) continue; // не даёт циклу зациклить обход
      visited.add(to);
      stack.push(to);
    }
  }

  return visited;
}

/** Переменная зрителя, какой её видит правило выхода: кто её пишет и какого рода. */
interface VariableSource {
  readonly kind: Gate['config']['kind'];
  readonly segmentId: string;
  readonly optionIds: readonly string[];
}

/**
 * Собирает переменные, которые пишут гейты. Повторяет сбор из
 * `ProjectSchema.superRefine` (`schema.ts`) — переменная может быть
 * записана в ЛЮБОМ сегменте, не только в том, чей выход её проверяет
 * («переменные зрителя живут на всё объяснение»).
 */
function collectVariables(project: Project): Map<string, VariableSource> {
  const variables = new Map<string, VariableSource>();
  for (const segment of project.segments) {
    for (const gate of segment.gates) {
      if (variables.has(gate.recordAs)) continue; // схема отдельно запрещает повтор — не наша забота здесь
      const config = gate.config;
      variables.set(gate.recordAs, {
        kind: config.kind,
        segmentId: segment.id,
        optionIds: config.kind === 'choice' ? config.options.map((option) => option.id) : [],
      });
    }
  }
  return variables;
}

/**
 * Годится ли условие к употреблению вообще.
 *
 * Повторяет часть правил схемы намеренно: то, что здесь разрешено, обязано
 * пройти загрузку, а то, что запрещено, схема всё равно отклонит — только
 * позже и без связи с тем, что автор только что нажал.
 */
function assertUsable(variables: Map<string, VariableSource>, condition: Condition): void {
  const source = variables.get(condition.variable);
  if (!source) {
    throw new Error(`Переменную «${condition.variable}» не пишет ни один гейт объяснения`);
  }
  if ((condition.kind === 'equals' || condition.kind === 'notEquals') && source.kind === 'continue') {
    throw new Error(
      `Переменная «${condition.variable}» пишется гейтом вида «дальше»: у него один исход, `
        + 'и сравнивать её значение не с чем',
    );
  }
}

/** Упоминает ли набор условий переменную. Пустой и отсутствующий — не упоминают. */
function mentions(when: readonly Condition[] | undefined, variable: string): boolean {
  return when !== undefined && when.some((condition) => condition.variable === variable);
}

/** Переименовывает переменную во всех условиях набора, не трогая остальные поля. */
function renameIn(
  when: readonly Condition[],
  previous: string,
  next: string,
): Condition[] {
  return when.map((condition) =>
    condition.variable === previous ? { ...condition, variable: next } : condition,
  );
}

/**
 * Добавляет правило выхода сегменту `segmentId`.
 *
 * Повторяет часть правил схемы (`schema.ts`, блок про `exit.rules`) — не
 * изобретает своё: то, что здесь разрешено, обязано пройти загрузку, а то,
 * что запрещено, схема всё равно отклонит, только позже и без привязки
 * к тому, что автор только что сделал.
 */
export function connect(
  project: Project,
  segmentId: string,
  when: readonly Condition[],
  goto: string,
): Project {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте: не от кого вести правило выхода`);
  }
  if (!project.segments.some((candidate) => candidate.id === goto)) {
    throw new Error(`Сегмента «${goto}» нет в проекте: правилу выхода некуда вести`);
  }
  // Пустой список отклоняем здесь, а не только схемой: правило без условий —
  // это запасной выход, а он задаётся отдельным полем.
  if (when.length === 0) {
    throw new Error('Правило выхода без условий: пустое правило — это запасной выход');
  }

  const variables = collectVariables(project);
  for (const condition of when) assertUsable(variables, condition);

  const rule: ExitRule = { id: freeId('rule', segment.exit.rules), when: [...when], goto };
  const exit: Exit = { ...segment.exit, rules: [...segment.exit.rules, rule] };
  const segments = project.segments.map((candidate) => (candidate.id === segmentId ? { ...candidate, exit } : candidate));
  return { ...project, segments };
}

/** Находит сегмент и его правило либо внятно объясняет, чего не нашлось. */
function requireRule(project: Project, segmentId: string, ruleId: string): { segment: Segment; rule: ExitRule } {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) throw new Error(`Сегмента «${segmentId}» нет в проекте`);
  const rule = segment.exit.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) throw new Error(`Правила «${ruleId}» нет у сегмента «${segmentId}»`);
  return { segment, rule };
}

/** Заменяет набор условий у правила, оставив всё прочее нетронутым. */
function withConditions(project: Project, segmentId: string, ruleId: string, when: readonly Condition[]): Project {
  return {
    ...project,
    segments: project.segments.map((segment) =>
      segment.id !== segmentId
        ? segment
        : {
            ...segment,
            exit: {
              ...segment.exit,
              rules: segment.exit.rules.map((rule) =>
                rule.id === ruleId ? { ...rule, when: [...when] } : rule,
              ),
            },
          },
    ),
  };
}

/**
 * Добавляет условие к правилу выхода: оно соединяется с прежними через И.
 *
 * Правило становится строже, а не шире. Чтобы стало шире, автор заводит
 * второе правило — ИЛИ в этом языке выражается порядком правил. → ADR-019
 */
export function addCondition(project: Project, segmentId: string, ruleId: string, condition: Condition): Project {
  const { rule } = requireRule(project, segmentId, ruleId);
  assertUsable(collectVariables(project), condition);
  return withConditions(project, segmentId, ruleId, [...rule.when, condition]);
}

/**
 * Снимает условие правила по его месту в списке.
 *
 * Последнее условие снять нельзя: правило без условий — это запасной выход,
 * а он задаётся отдельным полем. Автор, которому правило больше не нужно,
 * снимает правило целиком.
 */
export function removeCondition(project: Project, segmentId: string, ruleId: string, index: number): Project {
  const { rule } = requireRule(project, segmentId, ruleId);
  if (index < 0 || index >= rule.when.length) {
    throw new Error(`У правила «${ruleId}» нет условия номер ${index}`);
  }
  if (rule.when.length === 1) {
    throw new Error(
      `У правила «${ruleId}» осталось одно условие: правило без условий — это запасной выход. `
        + 'Снимите правило целиком.',
    );
  }
  return withConditions(project, segmentId, ruleId, rule.when.filter((_, at) => at !== index));
}

/** Снимает правило выхода `ruleId` у сегмента `segmentId`. */
export function disconnect(project: Project, segmentId: string, ruleId: string): Project {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте`);
  }

  const rules = segment.exit.rules.filter((rule) => rule.id !== ruleId);
  if (rules.length === segment.exit.rules.length) {
    throw new Error(`У сегмента «${segmentId}» нет правила выхода «${ruleId}»`);
  }

  const exit: Exit = { ...segment.exit, rules };
  const segments = project.segments.map((candidate) => (candidate.id === segmentId ? { ...candidate, exit } : candidate));
  return { ...project, segments };
}

/**
 * Почему такое имя переменной принять нельзя. `undefined` — можно.
 *
 * Одна функция на две задачи, и это не удобство, а требование: панель
 * обязана объяснять автору причину ПОКА ОН ПЕЧАТАЕТ, а `renameVariable` —
 * падать на том же самом. Две копии правил разошлись бы, и разошлись бы
 * тихо: поле показывало бы «всё хорошо» там, где запись отвергается.
 *
 * Ограничения `Id` из схемы (`schema.ts`) повторяются, а не изобретаются:
 * то, что разрешено здесь, обязано пройти загрузку.
 */
export function variableRenameProblem(
  project: Project,
  gateId: string,
  nextName: string,
): string | undefined {
  if (nextName.trim() === '') {
    return 'Имя переменной не может быть пустым: на него ссылаются правила развилок';
  }
  if (nextName !== nextName.trim()) {
    return 'Имя переменной не должно начинаться или заканчиваться пробелом';
  }

  // Схема отдельно запрещает двум остановкам писать в одну переменную
  // («второй ответ затёр бы первый»). Ловим это здесь, пока автор смотрит
  // на поле, а не при следующей загрузке файла.
  const taken = project.segments
    .flatMap((segment) => segment.gates)
    .find((candidate) => candidate.id !== gateId && candidate.recordAs === nextName);
  if (taken) {
    return `Переменную «${nextName}» уже пишет остановка «${taken.id}»: `
      + 'две остановки в одну переменную писать не могут, второй ответ затёр бы первый';
  }

  return undefined;
}

/**
 * Переименовывает переменную, в которую остановка `gateId` пишет ответ.
 *
 * Имя переменной задаёт автор (`product.md` §2в [Р]): до этого оно бралось
 * из внутреннего id остановки и не правилось, а значит сослаться на ответ
 * из будущего вопроса или развилки было нечем — «обычный вопрос терял смысл».
 *
 * **Каскад обязателен, и он — вся суть этой функции.** Правило выхода
 * ссылается на переменную ПО ИМЕНИ (`Condition.variable`) и живёт при этом
 * в поле `exit` ЛЮБОГО сегмента, не обязательно того, где стоит остановка:
 * переменные зрителя живут на всё объяснение. Переименовать одно поле
 * `recordAs` и не тронуть правила — значит оставить правило, которое
 * не сработает никогда. Схема такую ложь не поймает: имя переменной,
 * которую никто не пишет, отвергается только `connect`, а уже лежащее
 * в проекте правило проходит загрузку молча.
 *
 * Проверки идут ДО любой правки: занятое имя не должно оставить проект
 * наполовину переименованным.
 */
export function renameVariable(project: Project, gateId: string, nextName: string): Project {
  const owner = project.segments.find((segment) => segment.gates.some((gate) => gate.id === gateId));
  const gate = owner?.gates.find((candidate) => candidate.id === gateId);
  if (!owner || !gate) {
    throw new Error(`Остановки «${gateId}» нет в объяснении: переименовывать нечего`);
  }

  const previous = gate.recordAs;
  if (nextName === previous) return project;

  const problem = variableRenameProblem(project, gateId, nextName);
  if (problem) throw new Error(problem);

  return {
    ...project,
    segments: project.segments.map((segment) => {
      // Каскад идёт по ДВУМ местам, где может стоять имя переменной: правила
      // выхода и условия показа вариантов ответа. Второе появилось вместе
      // с условными вариантами, и пропустить его значило бы оставить
      // осиротевшее условие — валидный проект с веткой, недостижимой навсегда.
      const gates = segment.gates.map((candidate) => {
        const renamed = candidate.id === gateId && segment.id === owner.id
          ? { ...candidate, recordAs: nextName }
          : candidate;

        const config = renamed.config;
        if (config.kind !== 'choice') return renamed;
        if (!config.options.some((option) => mentions(option.when, previous))) return renamed;

        return {
          ...renamed,
          config: {
            ...config,
            options: config.options.map((option) =>
              mentions(option.when, previous)
                ? { ...option, when: renameIn(option.when!, previous, nextName) }
                : option,
            ),
          },
        };
      });

      const touched = segment.exit.rules.some((rule) => mentions(rule.when, previous));
      const exit: Exit = touched
        ? {
            ...segment.exit,
            rules: segment.exit.rules.map((rule) =>
              mentions(rule.when, previous)
                ? { ...rule, when: renameIn(rule.when, previous, nextName) }
                : rule,
            ),
          }
        : segment.exit;

      // `gates` пересобран через map всегда, поэтому сравнение по ссылке ниже
      // его бы не узнало. Сверяем поэлементно: сегмент без единого упоминания
      // обязан остаться прежним ОБЪЕКТОМ — на этом стоит вся история правок.
      const gatesSame = gates.every((gate, index) => gate === segment.gates[index]);

      return gatesSame && exit === segment.exit ? segment : { ...segment, gates, exit };
    }),
  };
}

/**
 * Части, в которые автор ещё ничего не положил.
 *
 * Пустая ветка — **незавершённое состояние, а не валидное** (`product.md`
 * §2б [Р]). Ветка рождается пустой по построению разреза: каждый вариант
 * ответа получает свою часть, и наполнить их — отдельная работа, которую
 * легко забыть. Без этой проверки объяснение можно было опубликовать так,
 * что зритель проваливается в никуда.
 *
 * Тишина не годится как признак: тишину автор может захотеть намеренно,
 * и тогда «пусто по ошибке» стало бы неотличимо от «пауза задумана».
 * Поэтому смотрим на СОДЕРЖИМОЕ, а не на длительность.
 *
 * Слайд на нуле в счёт не идёт: он есть у каждой части по схеме
 * (`slides.min(1)`), и считать его содержимым значило бы не найти
 * ни одной пустой ветки никогда.
 */
export function emptySegments(project: Project): readonly Segment[] {
  return project.segments.filter(
    (segment) =>
      segment.elements.length === 0 && segment.slides.length === 1 && segment.gates.length === 0,
  );
}

/** Переменная объяснения: что про неё можно спросить и чем она бывает. */
export interface AnswerVariable {
  readonly name: string;
  readonly kind: 'choice' | 'input' | 'continue';
  readonly options: readonly { readonly id: string; readonly label: string }[];
  /** id верного варианта, либо null у развилки: у неё верного ответа нет. */
  readonly correctId: string | null;
}

/**
 * Переменные ВСЕГО объяснения, в порядке появления.
 *
 * Не одной части: ответы живут на всё объяснение, и правило десятой части
 * вправе смотреть на ответ, данный во второй (`authoring-flow.md` §8).
 * Повтор имени схема запрещает отдельно, поэтому первый выигрывает.
 */
export function answerVariables(project: Project): readonly AnswerVariable[] {
  const found: AnswerVariable[] = [];
  const seen = new Set<string>();
  for (const segment of project.segments) {
    for (const gate of segment.gates) {
      if (seen.has(gate.recordAs)) continue;
      seen.add(gate.recordAs);
      const config = gate.config;
      found.push({
        name: gate.recordAs,
        kind: config.kind,
        options: config.kind === 'choice'
          ? config.options.map((option) => ({ id: option.id, label: option.label }))
          : [],
        correctId: config.kind === 'choice' ? config.correctId : null,
      });
    }
  }
  return found;
}

/** Где стоит условие, которое не сработает никогда. */
export type DeadComparisonPlace =
  | { readonly kind: 'rule'; readonly ruleId: string }
  | { readonly kind: 'option'; readonly gateId: string; readonly optionId: string };

/** Сравнение с числом на переменной, которая числом не бывает. */
export interface DeadComparison {
  readonly segmentId: string;
  readonly where: DeadComparisonPlace;
  readonly variable: string;
}

/**
 * Сравнения с числом, которые не сработают НИКОГДА.
 *
 * Схема такое пропускает, и правильно делает: `счёт > 3` синтаксически
 * безупречно, даже когда «счёт» хранит слово «красный». Но `Number('красный')`
 * даёт `NaN`, условие не подходит ни при каком ответе, и ветка за ним
 * недостижима — при полностью валидном проекте.
 *
 * Это ровно тот класс дефекта, что уже дважды стоил проекту времени:
 * валидность не равна достижимости. Место ему в панели проблем, а не
 * в схеме, — по тому же основанию, что и у пустых частей: это незавершённая
 * работа автора, а не испорченный файл. Отказать в загрузке значило бы
 * запретить автору сначала поставить сравнение, а потом поправить варианты.
 *
 * Переменная гейта БЕЗ выбора (ввод, «дальше») под подозрение не попадает:
 * там зритель вводит что угодно, включая число, и судить о ней нечем.
 */
export function deadComparisons(project: Project): readonly DeadComparison[] {
  const variables = collectVariables(project);
  const found: DeadComparison[] = [];

  const comparable = (variable: string): boolean => {
    const source = variables.get(variable);
    // Переменной нет вовсе — про это ругается схема, здесь молчим,
    // чтобы автор не получил две жалобы об одном и том же.
    if (!source || source.kind !== 'choice') return true;
    return source.optionIds.some((id) => id.trim() !== '' && Number.isFinite(Number(id)));
  };

  const scan = (segmentId: string, where: DeadComparisonPlace, when: readonly Condition[]): void => {
    for (const condition of when) {
      if (condition.kind !== 'compare') continue;
      if (comparable(condition.variable)) continue;
      found.push({ segmentId, where, variable: condition.variable });
    }
  };

  for (const segment of project.segments) {
    for (const rule of segment.exit.rules) {
      scan(segment.id, { kind: 'rule', ruleId: rule.id }, rule.when);
    }
    for (const gate of segment.gates) {
      if (gate.config.kind !== 'choice') continue;
      for (const option of gate.config.options) {
        if (!option.when) continue;
        scan(segment.id, { kind: 'option', gateId: gate.id, optionId: option.id }, option.when);
      }
    }
  }

  return found;
}

/** Дыра в покрытии: какой переменной не хватает исходов, и каких именно. */
export interface UncoveredOutcome {
  readonly variable: string;
  /** Варианты выбора без правила. */
  readonly optionIds: readonly string[];
  /** Каких вердиктов не хватает: 'correct' и/или 'wrong'. */
  readonly verdicts: readonly ('correct' | 'wrong')[];
}

/**
 * Дыры в покрытии выхода сегмента — ТОЧНО то же правило тотальности, что
 * в схеме (`schema.ts`, комментарий «Выход обязан быть ТОТАЛЬНЫМ»), но как
 * вопрос «чего не хватает», а не как отказ при загрузке: автору нужно
 * увидеть дыру ДО сохранения, а не после.
 *
 * Схема считает выход тотальным, если есть `default`, либо ВСЕ правила
 * сегмента смотрят на ОДНУ переменную и она разобрана целиком: либо покрыты
 * все варианты гейта с выбором, либо взяты оба исхода «верно» и «неверно».
 * Смешение нескольких переменных в правилах одного выхода без `default` —
 * ВСЕГДА дыра, даже если каждая переменная по отдельности покрыта полностью:
 * схема не считает такой выход тотальным, потому что порядок проверки
 * правил разных переменных неоднозначен. Это не изобретено здесь — это
 * прямое чтение `schema.ts` (`if (byVariable.size === 1) { ... }`).
 *
 * `gates` передаётся отдельно от `segment.gates`: переменная, на которую
 * смотрит правило выхода, не обязана быть записана гейтом ЭТОГО сегмента
 * (см. `collectVariables` выше) — вызывающий сам решает, какой набор гейтов
 * подставить (обычно `segment.gates`, но не только).
 */
export function uncoveredOutcomes(segment: Segment, gates: readonly Gate[]): UncoveredOutcome[] {
  if (segment.exit.default !== null) return [];
  if (segment.exit.rules.length === 0) return []; // без единого правила выход просто пуст — не дыра, а «выхода ещё нет»

  // Покрытие доказуемо только у правил с ОДНИМ условием: цепочка через И
  // сужает, а не покрывает. Здесь это повторяет `schema.ts` дословно, потому
  // что панель обязана предсказывать вердикт схемы, а не спорить с ним.
  const single = segment.exit.rules.every((rule) => rule.when.length === 1);
  const only = single ? segment.exit.rules.map((rule) => rule.when[0]!) : [];
  const byVariable = new Set(only.map((condition) => condition.variable));
  const kinds = new Set(only.map((condition) => condition.kind));
  const gateByVariable = new Map(gates.map((gate) => [gate.recordAs, gate] as const));

  // Единственный случай, где схема вообще способна признать выход тотальным:
  // все правила об одном условии и смотрят на одну и ту же переменную.
  if (single && byVariable.size === 1) {
    const variable = [...byVariable][0]!;

    if (kinds.has('correct') && kinds.has('wrong')) return []; // оба вердикта — тотально

    if (kinds.size === 1 && kinds.has('equals')) {
      const gate = gateByVariable.get(variable);
      if (gate && gate.config.kind === 'choice') {
        const covered = new Set(
          only.filter((condition) => condition.kind === 'equals').map((condition) => condition.value),
        );
        const optionIds = gate.config.options.map((option) => option.id).filter((id) => !covered.has(id));
        return optionIds.length > 0 ? [{ variable, optionIds, verdicts: [] }] : [];
      }
    }

    // Одна переменная, но ни одна из двух тотальных форм не собралась —
    // считаем недостающими вердикты (общий случай input/continue или choice
    // без чистого набора equals).
    const verdicts: ('correct' | 'wrong')[] = [];
    if (!kinds.has('correct')) verdicts.push('correct');
    if (!kinds.has('wrong')) verdicts.push('wrong');
    return [{ variable, optionIds: [], verdicts: verdicts.length > 0 ? verdicts : ['correct', 'wrong'] }];
  }

  // Несколько разных переменных без default — схема отказывает всегда,
  // даже если каждая переменная по отдельности разобрана полностью. Дыра —
  // по одной записи на переменную, без детализации: детализировать здесь
  // нечего, дефект не в конкретном варианте, а в самом смешении переменных.
  return [...byVariable].map((variable) => ({ variable, optionIds: [], verdicts: [] }));
}

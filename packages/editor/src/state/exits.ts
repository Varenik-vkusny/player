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
 * Добавляет правило выхода сегменту `segmentId`.
 *
 * Повторяет часть правил схемы (`schema.ts`, блок про `exit.rules`) — не
 * изобретает своё: то, что здесь разрешено, обязано пройти загрузку, а то,
 * что запрещено, схема всё равно отклонит, только позже и без привязки
 * к тому, что автор только что сделал.
 */
export function connect(project: Project, segmentId: string, condition: Condition, goto: string): Project {
  const segment = project.segments.find((candidate) => candidate.id === segmentId);
  if (!segment) {
    throw new Error(`Сегмента «${segmentId}» нет в проекте: не от кого вести правило выхода`);
  }
  if (!project.segments.some((candidate) => candidate.id === goto)) {
    throw new Error(`Сегмента «${goto}» нет в проекте: правилу выхода некуда вести`);
  }

  const variables = collectVariables(project);
  const source = variables.get(condition.variable);
  if (!source) {
    throw new Error(`Переменную «${condition.variable}» не пишет ни один гейт объяснения`);
  }
  if (condition.kind === 'equals' && source.kind === 'continue') {
    throw new Error(
      `Переменная «${condition.variable}» пишется гейтом вида «дальше»: у него один исход, `
        + 'и сравнивать её значение не с чем',
    );
  }

  const rule: ExitRule = { id: freeId('rule', segment.exit.rules), when: condition, goto };
  const exit: Exit = { ...segment.exit, rules: [...segment.exit.rules, rule] };
  const segments = project.segments.map((candidate) => (candidate.id === segmentId ? { ...candidate, exit } : candidate));
  return { ...project, segments };
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

  const byVariable = new Set(segment.exit.rules.map((rule) => rule.when.variable));
  const kinds = new Set(segment.exit.rules.map((rule) => rule.when.kind));
  const gateByVariable = new Map(gates.map((gate) => [gate.recordAs, gate] as const));

  // Единственный случай, где схема вообще способна признать выход тотальным:
  // все правила смотрят на одну и ту же переменную.
  if (byVariable.size === 1) {
    const variable = [...byVariable][0]!;

    if (kinds.has('correct') && kinds.has('wrong')) return []; // оба вердикта — тотально

    if (kinds.size === 1 && kinds.has('equals')) {
      const gate = gateByVariable.get(variable);
      if (gate && gate.config.kind === 'choice') {
        const covered = new Set(
          segment.exit.rules.filter((rule) => rule.when.kind === 'equals').map((rule) => (rule.when as { value: string }).value),
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

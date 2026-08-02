/**
 * Панель сегментов: список сегментов объяснения, правила выхода текущего,
 * дыры в покрытии гейтов.
 *
 * Было `GraphPanel.tsx` — про узлы и рёбра версии 2. В версии 3 гейт
 * не решает, куда прыгать (у него нет поля для этого вообще, см. schema.ts):
 * решение принимает `Exit` — поле самого сегмента (ADR-015). Файл переименован
 * и переписан вокруг этого: вместо узла с рёбрами — список сегментов
 * и список правил выхода ОДНОГО сегмента, вместо `Edge`/`EdgeWhen` —
 * `ExitRule`/`Condition`.
 *
 * Доска нодов для сегментов однажды появится (см. CLAUDE.md), но это другая
 * сессия — здесь список, а не холст.
 *
 * Чисто презентационная, как `Inspector.tsx` и `MarkPanel.tsx`: правила —
 * что достижимо, чего не хватает — целиком живут в чистом модуле
 * `state/exits.ts` (ADR-010). Этот файл только раскладывает виджеты
 * и передаёт готовые действия в редьюсер через колбэки.
 *
 * Единственное собственное состояние — выбор цели в `<select>` рядом
 * с кнопкой «Соединить» для ещё не покрытого варианта/исхода: это ввод
 * автора для одного клика вперёд, а не данные проекта и не правило выхода.
 */
import { useMemo, useState, type ReactElement } from 'react';

import type { Condition, ExitRule, Project, Segment } from '@player/core';

import {
  answerVariables,
  deadComparisons,
  emptySegments,
  leadsBack,
  reachableFrom,
  uncoveredOutcomes,
} from '../state/exits.js';

export interface SegmentPanelProps {
  readonly project: Project;
  readonly currentSegmentId: string;
  readonly onSelectSegment: (id: string) => void;
  readonly onAddSegment: () => void;
  readonly onRemoveSegment: (id: string) => void;
  readonly onDuplicateSegment: (id: string) => void;
  readonly onConnect: (when: readonly Condition[], goto: string) => void;
  readonly onAddCondition: (ruleId: string, condition: Condition) => void;
  readonly onRemoveCondition: (ruleId: string, index: number) => void;
  readonly onDisconnect: (ruleId: string) => void;
}

/** Заголовок сегмента для показа автору — title, если он есть, иначе id. */
function titleOf(segment: Segment): string {
  return segment.title || segment.id;
}

function titleOfId(project: Project, id: string): string {
  const segment = project.segments.find((candidate) => candidate.id === id);
  return segment ? titleOf(segment) : id;
}

/**
 * Подпись варианта — из конфигурации гейта, а не голый id.
 *
 * Гейт ищется только среди гейтов ЭТОГО сегмента: переменную, на которую
 * смотрит правило выхода, вправе писать гейт другого сегмента
 * (docs/planning.md §12.2 — известный долг, не решается здесь). Не нашли —
 * подписью остаётся сам id, честно, а не выдуманное имя.
 */
function optionLabel(segment: Segment, variable: string, optionId: string): string {
  const gate = segment.gates.find((candidate) => candidate.recordAs === variable);
  if (!gate || gate.config.kind !== 'choice') return optionId;
  const option = gate.config.options.find((candidate) => candidate.id === optionId);
  return option?.label ?? optionId;
}

/** Знак сравнения так, как его читает автор, а не как он назван в схеме. */
const OP_SIGN: Record<'gt' | 'gte' | 'lt' | 'lte', string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

/**
 * Человеческое описание ОДНОГО условия.
 *
 * Значение показывается ПОДПИСЬЮ варианта, а не его id: «opt-skip» — слово
 * схемы, «Хватит на сегодня» — слово автора, и в правиле он ищет глазами
 * именно второе.
 */
function conditionText(condition: Condition, project: Project): string {
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
function ruleText(rule: ExitRule, project: Project): string {
  const target = titleOfId(project, rule.goto);
  return `${rule.when.map((condition) => conditionText(condition, project)).join(' и ')} → ${target}`;
}

const VERDICT_LABEL: Record<'correct' | 'wrong', string> = {
  correct: 'верно',
  wrong: 'неверно',
};

/**
 * Подпись варианта, найденная по ВСЕМУ объяснению.
 *
 * Отличается от `optionLabel` выше намеренно: та ищет в одном сегменте, и это
 * известный долг (`planning.md` §12.2). Панели нужен весь проект, потому что
 * она и предлагает переменные всего проекта — искать в одном сегменте значило
 * бы показать автору голые id для половины его же переменных.
 */
function optionLabelAnywhere(project: Project, variable: string, optionId: string): string {
  const source = answerVariables(project).find((candidate) => candidate.name === variable);
  return source?.options.find((option) => option.id === optionId)?.label ?? optionId;
}

const KIND_LABEL: Record<Condition['kind'], string> = {
  equals: 'равен',
  notEquals: 'не равен',
  correct: 'отвечен верно',
  wrong: 'отвечен неверно',
  compare: 'сравнить с числом',
};

/**
 * Форма добавления условия к правилу выхода.
 *
 * Автор ВЫБИРАЕТ переменную, вид и значение, а не пишет выражение: язык
 * условий намеренно не текстовый (`product.md` §2 [Р]), и поле ввода
 * потребовало бы парсера, сообщений парсера и обучения синтаксису.
 *
 * Добавленное условие соединяется с прежними через И — правило становится
 * строже. Чтобы стало шире, автор заводит второе правило. → ADR-019
 */
function AddConditionForm({
  project,
  ruleId,
  onAdd,
}: {
  readonly project: Project;
  readonly ruleId: string;
  readonly onAdd: (ruleId: string, condition: Condition) => void;
}): ReactElement {
  const variables = useMemo(() => answerVariables(project), [project]);
  const [open, setOpen] = useState(false);
  const [variable, setVariable] = useState(variables[0]?.name ?? '');
  const [kind, setKind] = useState<Condition['kind']>('equals');
  const [value, setValue] = useState('');
  const [op, setOp] = useState<'gt' | 'gte' | 'lt' | 'lte'>('gt');
  const [threshold, setThreshold] = useState('0');

  const source = variables.find((candidate) => candidate.name === variable);

  if (!open) {
    return (
      <button
        type="button"
        className="ed-action"
        data-testid={`exit-condition-add-${ruleId}`}
        disabled={variables.length === 0}
        onClick={() => setOpen(true)}
      >
        + условие
      </button>
    );
  }

  const submit = (): void => {
    let condition: Condition;
    if (kind === 'compare') {
      const parsed = Number(threshold);
      // Пустое и нечисловое до правила не доходят: правило с NaN не сработало
      // бы никогда, а автор не узнал бы почему.
      if (!Number.isFinite(parsed)) return;
      condition = { kind: 'compare', variable, op, value: parsed };
    } else if (kind === 'equals' || kind === 'notEquals') {
      const chosen = value !== '' ? value : (source?.options[0]?.id ?? '');
      if (chosen === '') return;
      condition = { kind, variable, value: chosen };
    } else {
      condition = { kind, variable };
    }
    onAdd(ruleId, condition);
    setOpen(false);
  };

  return (
    <div className="ed-exit-condition-form" data-testid={`exit-condition-form-${ruleId}`}>
      <select
        className="ed-insp-input"
        data-testid={`exit-condition-variable-${ruleId}`}
        value={variable}
        onChange={(event) => setVariable(event.target.value)}
      >
        {variables.map((candidate) => (
          <option key={candidate.name} value={candidate.name}>
            {candidate.name}
          </option>
        ))}
      </select>

      <select
        className="ed-insp-input"
        data-testid={`exit-condition-kind-${ruleId}`}
        value={kind}
        onChange={(event) => setKind(event.target.value as Condition['kind'])}
      >
        {(Object.keys(KIND_LABEL) as Condition['kind'][])
          // Вердикт о развилке невозможен, и предлагать его значило бы дать
          // автору собрать правило, которое схема отклонит при сохранении.
          .filter((candidate) =>
            candidate === 'correct' || candidate === 'wrong'
              // У развилки верного ответа нет, вердикт о ней невозможен, и
              // предлагать его значило бы дать автору собрать правило, которое
              // схема отклонит при сохранении.
              ? !(source?.kind === 'choice' && source.correctId === null)
              : true,
          )
          .map((candidate) => (
            <option key={candidate} value={candidate}>
              {KIND_LABEL[candidate]}
            </option>
          ))}
      </select>

      {kind === 'equals' || kind === 'notEquals' ? (
        source && source.kind === 'choice' ? (
          <select
            className="ed-insp-input"
            data-testid={`exit-condition-value-${ruleId}`}
            value={value !== '' ? value : (source.options[0]?.id ?? '')}
            onChange={(event) => setValue(event.target.value)}
          >
            {source.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="ed-insp-input"
            type="text"
            data-testid={`exit-condition-value-${ruleId}`}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        )
      ) : null}

      {kind === 'compare' ? (
        <>
          <select
            className="ed-insp-input"
            data-testid={`exit-condition-op-${ruleId}`}
            value={op}
            onChange={(event) => setOp(event.target.value as 'gt' | 'gte' | 'lt' | 'lte')}
          >
            <option value="gt">&gt;</option>
            <option value="gte">≥</option>
            <option value="lt">&lt;</option>
            <option value="lte">≤</option>
          </select>
          <input
            className="ed-insp-input"
            type="number"
            data-testid={`exit-condition-number-${ruleId}`}
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </>
      ) : null}

      <button
        type="button"
        className="ed-action"
        data-testid={`exit-condition-submit-${ruleId}`}
        onClick={submit}
      >
        Добавить
      </button>
      <button type="button" className="ed-action" onClick={() => setOpen(false)}>
        Отмена
      </button>
    </div>
  );
}

export function SegmentPanel({
  project,
  currentSegmentId,
  onSelectSegment,
  onAddSegment,
  onRemoveSegment,
  onDuplicateSegment,
  onConnect,
  onDisconnect,
  onAddCondition,
  onRemoveCondition,
}: SegmentPanelProps): ReactElement {
  const currentSegment = project.segments.find((candidate) => candidate.id === currentSegmentId);
  if (!currentSegment) {
    // Рассинхрон вида и проекта — то же требование, что и у currentSegment()
    // в state/project.ts: молча показать пустую панель значило бы спрятать
    // настоящую причину.
    throw new Error(`Текущего сегмента «${currentSegmentId}» нет в проекте`);
  }

  const reachable = useMemo(() => reachableFrom(project), [project]);
  const empty = useMemo(() => new Set(emptySegments(project).map((s) => s.id)), [project]);
  // По ВСЕМУ объяснению, а не по текущей части: правило десятой части вправе
  // сравнивать переменную, записанную во второй, и мёртвым оно будет там же.
  const dead = useMemo(() => deadComparisons(project), [project]);
  const holes = useMemo(
    () => uncoveredOutcomes(currentSegment, currentSegment.gates),
    [currentSegment],
  );
  // Цели, ведущие НАЗАД: из них можно по рёбрам выхода дойти обратно до
  // текущей части — тот самый повтор (leadsBack, exits.ts). Список сегментов
  // не задаёт порядок проигрывания, поэтому «назад» проверяется обходом
  // графа, а не позицией в массиве.
  const repeatTargets = useMemo(
    () =>
      new Set(
        project.segments
          .filter((segment) => leadsBack(project, currentSegmentId, segment.id))
          .map((segment) => segment.id),
      ),
    [project, currentSegmentId],
  );

  // Цель в <select> для каждой ещё не заведённой связки — ключ вида
  // «variable-optionId» или «variable-verdict». Живёт здесь и только здесь:
  // это черновой выбор автора перед кликом «Соединить», не данные проекта.
  const [targets, setTargets] = useState<Record<string, string>>({});
  const defaultTarget = project.segments[0]!.id;

  const targetFor = (key: string): string => targets[key] ?? defaultTarget;
  const setTargetFor = (key: string, value: string): void =>
    setTargets((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="ed-segment-panel" aria-label="Части">
      <h2 className="ed-insp-title">Части</h2>

      <ul className="ed-segment-list">
        {project.segments.map((segment) => {
          const isCurrent = segment.id === currentSegmentId;
          const isUnreachable = !reachable.has(segment.id);
          return (
            <li key={segment.id} className="ed-segment-row">
              <button
                type="button"
                className={isCurrent ? 'ed-segment-button ed-segment-button-current' : 'ed-segment-button'}
                aria-current={isCurrent ? 'true' : undefined}
                data-testid={`segment-${segment.id}`}
                // Название сегмента в списке обрезается многоточием, если не
                // влезло: список имён это терпит (текущее имя целиком видно
                // в заголовке «Правила выхода …»), но полное имя должно быть
                // доступно наведением.
                title={titleOf(segment)}
                onClick={() => onSelectSegment(segment.id)}
              >
                {titleOf(segment)}
              </button>
              {isUnreachable ? (
                <span className="ed-segment-unreachable" data-testid={`segment-unreachable-${segment.id}`}>
                  недостижим
                </span>
              ) : null}
              {empty.has(segment.id) ? (
                <span className="ed-segment-unreachable" data-testid={`segment-empty-${segment.id}`}>
                  пусто
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="ed-segment-actions">
        <button type="button" className="ed-action" data-testid="segment-add" onClick={onAddSegment}>
          Добавить часть
        </button>
        <button
          type="button"
          className="ed-action"
          data-testid="segment-remove"
          disabled={currentSegmentId === project.entry}
          onClick={() => onRemoveSegment(currentSegmentId)}
        >
          Удалить часть
        </button>
        <button
          type="button"
          className="ed-action"
          data-testid="segment-duplicate"
          onClick={() => onDuplicateSegment(currentSegmentId)}
        >
          Сделать копию части
        </button>
      </div>

      <h3 className="ed-insp-title">Правила выхода «{titleOf(currentSegment)}»</h3>
      {currentSegment.exit.rules.length > 0 || currentSegment.exit.default !== null ? (
        <ul className="ed-exit-rules">
          {currentSegment.exit.rules.map((rule) => (
            <li key={rule.id} className="ed-exit-rule-row">
              <span className="ed-exit-rule-text">{ruleText(rule, project)}</span>
              {/* Условия показаны и по отдельности: цепочка через И читается
                  одной строкой, но снять из неё можно только конкретное. */}
              {rule.when.length > 1 ? (
                <ul className="ed-exit-conditions" data-testid={`exit-conditions-${rule.id}`}>
                  {rule.when.map((condition, index) => (
                    <li key={`${rule.id}:${index}`} className="ed-exit-condition">
                      <span>{conditionText(condition, project)}</span>
                      <button
                        type="button"
                        className="ed-action"
                        data-testid={`exit-condition-remove-${rule.id}-${index}`}
                        onClick={() => onRemoveCondition(rule.id, index)}
                      >
                        убрать
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <AddConditionForm
                project={project}
                ruleId={rule.id}
                onAdd={onAddCondition}
              />
              <button
                type="button"
                className="ed-action"
                data-testid={`exit-disconnect-${rule.id}`}
                onClick={() => onDisconnect(rule.id)}
              >
                снять
              </button>
            </li>
          ))}
          {currentSegment.exit.default !== null ? (
            <li className="ed-exit-rule-row">
              <span className="ed-exit-rule-text">
                иначе → {titleOfId(project, currentSegment.exit.default)}
              </span>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="ed-segment-empty">У этой части нет правил перехода.</p>
      )}

      {/* Сравнение с числом на переменной, которая числом не бывает, схему
          проходит: «счёт > 3» безупречно, даже когда «счёт» хранит слово.
          Но условие не подойдёт ни при каком ответе, и ветка за ним
          недостижима навсегда — при полностью валидном проекте. → ADR-019 */}
      {dead.length > 0 ? (
        <>
          <h3 className="ed-insp-title">Условия, которые не сработают</h3>
          <div className="ed-exit-uncovered" data-testid="dead-comparisons">
            {dead.map((problem) => (
              <div
                key={`${problem.segmentId}:${
                  problem.where.kind === 'rule'
                    ? problem.where.ruleId
                    : `${problem.where.gateId}:${problem.where.optionId}`
                }:${problem.variable}`}
                className="ed-exit-hole"
              >
                <span className="ed-exit-hole-text">
                  «{titleOfId(project, problem.segmentId)}»:{' '}
                  {problem.where.kind === 'rule'
                    ? 'правило выхода'
                    : `вариант ответа «${optionLabelAnywhere(project, problem.variable, problem.where.optionId)}»`}{' '}
                  сравнивает «{problem.variable}» с числом, но ни один её вариант числом не является.
                  Это условие не подойдёт никогда.
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* Пустая ветка — незавершённое состояние, а не валидное
          (product.md §2б [Р]). Ветка рождается пустой по построению разреза,
          и наполнить её легко забыть: разрез рождает сразу несколько. */}
      <h3 className="ed-insp-title">Пустые части</h3>
      <div className="ed-exit-uncovered" data-testid="empty-segments">
        {empty.size === 0 ? (
          <p className="ed-segment-empty">Во всех частях что-то есть.</p>
        ) : (
          <>
            {project.segments
              .filter((segment) => empty.has(segment.id))
              .map((segment) => (
                <div key={segment.id} className="ed-exit-hole">
                  <span className="ed-exit-hole-text">
                    «{titleOf(segment)}» — здесь пока ничего нет
                  </span>
                </div>
              ))}
            <p className="ed-segment-empty">
              Пока такая часть есть, объяснение публиковать нельзя: зритель прошёл бы её
              насквозь. Тишина не подходит как признак — тишину можно захотеть намеренно,
              и тогда «пусто по ошибке» стало бы неотличимо от «пауза задумана».
            </p>
          </>
        )}
      </div>

      <h3 className="ed-insp-title">Непокрыто</h3>
      <div className="ed-exit-uncovered" data-testid="exit-uncovered">
        {holes.length === 0 ? (
          <p className="ed-segment-empty">Все варианты и исходы вопросов этой части ведут куда-то.</p>
        ) : (
          holes.map((hole) => (
            <div key={hole.variable} className="ed-exit-hole-group">
              {hole.optionIds.map((optionId) => {
                const key = `${hole.variable}-${optionId}`;
                const label = optionLabel(currentSegment, hole.variable, optionId);
                return (
                  <div key={key} className="ed-exit-hole">
                    <span className="ed-exit-hole-text">
                      Переменная «{hole.variable}»: вариант «{label}» никуда не ведёт
                    </span>
                    <select
                      className="ed-exit-select"
                      data-testid={`exit-target-${hole.variable}-${optionId}`}
                      value={targetFor(key)}
                      onChange={(event) => setTargetFor(key, event.target.value)}
                    >
                      {project.segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {titleOf(segment)}
                          {repeatTargets.has(segment.id) ? ' (повтор)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`exit-connect-${hole.variable}-${optionId}`}
                      onClick={() =>
                        onConnect([{ kind: 'equals', variable: hole.variable, value: optionId }], targetFor(key))
                      }
                    >
                      Соединить
                    </button>
                  </div>
                );
              })}
              {hole.verdicts.map((verdict) => {
                const key = `${hole.variable}-${verdict}`;
                return (
                  <div key={key} className="ed-exit-hole">
                    <span className="ed-exit-hole-text">
                      Переменная «{hole.variable}»: исход «{VERDICT_LABEL[verdict]}» никуда не ведёт
                    </span>
                    <select
                      className="ed-exit-select"
                      data-testid={`exit-target-${hole.variable}-${verdict}`}
                      value={targetFor(key)}
                      onChange={(event) => setTargetFor(key, event.target.value)}
                    >
                      {project.segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {titleOf(segment)}
                          {repeatTargets.has(segment.id) ? ' (повтор)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`exit-connect-${hole.variable}-${verdict}`}
                      onClick={() => onConnect([{ kind: verdict, variable: hole.variable }], targetFor(key))}
                    >
                      Соединить
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

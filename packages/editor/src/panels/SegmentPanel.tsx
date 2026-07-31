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

import { emptySegments, reachableFrom, uncoveredOutcomes } from '../state/exits.js';

export interface SegmentPanelProps {
  readonly project: Project;
  readonly currentSegmentId: string;
  readonly onSelectSegment: (id: string) => void;
  readonly onAddSegment: () => void;
  readonly onRemoveSegment: (id: string) => void;
  readonly onConnect: (condition: Condition, goto: string) => void;
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

/** Человеческое описание одного правила выхода: условие и цель. */
function ruleText(rule: ExitRule, project: Project): string {
  const target = titleOfId(project, rule.goto);
  switch (rule.when.kind) {
    case 'equals':
      return `«${rule.when.variable}» = «${rule.when.value}» → ${target}`;
    case 'correct':
      return `«${rule.when.variable}» верно → ${target}`;
    case 'wrong':
      return `«${rule.when.variable}» неверно → ${target}`;
  }
}

const VERDICT_LABEL: Record<'correct' | 'wrong', string> = {
  correct: 'верно',
  wrong: 'неверно',
};

export function SegmentPanel({
  project,
  currentSegmentId,
  onSelectSegment,
  onAddSegment,
  onRemoveSegment,
  onConnect,
  onDisconnect,
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
  const holes = useMemo(
    () => uncoveredOutcomes(currentSegment, currentSegment.gates),
    [currentSegment],
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
      </div>

      <h3 className="ed-insp-title">Правила выхода «{titleOf(currentSegment)}»</h3>
      {currentSegment.exit.rules.length > 0 || currentSegment.exit.default !== null ? (
        <ul className="ed-exit-rules">
          {currentSegment.exit.rules.map((rule) => (
            <li key={rule.id} className="ed-exit-rule-row">
              <span className="ed-exit-rule-text">{ruleText(rule, project)}</span>
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
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`exit-connect-${hole.variable}-${optionId}`}
                      onClick={() =>
                        onConnect({ kind: 'equals', variable: hole.variable, value: optionId }, targetFor(key))
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
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`exit-connect-${hole.variable}-${verdict}`}
                      onClick={() => onConnect({ kind: verdict, variable: hole.variable }, targetFor(key))}
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

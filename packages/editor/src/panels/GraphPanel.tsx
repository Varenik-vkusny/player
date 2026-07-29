/**
 * Панель графа сегментов: узлы, рёбра текущего узла, дыры в покрытии гейтов.
 *
 * Чисто презентационная, как `Inspector.tsx` и `MarkPanel.tsx`: правила графа —
 * что достижимо, что не покрыто, что можно удалить — целиком живут в чистом
 * модуле `state/graph.ts` (ADR-010). Этот файл только раскладывает виджеты
 * и передаёт готовые действия в редьюсер через колбэки.
 *
 * Единственное собственное состояние — выбор цели в `<select>` рядом
 * с кнопкой «Соединить» для ещё не покрытого варианта/исхода: это ввод
 * автора для одного клика вперёд, а не данные проекта и не правило графа.
 */
import { useMemo, useState, type ReactElement } from 'react';

import type { Edge, EdgeWhen, Project, SegmentNode } from '@player/core';

import { reachableFrom, uncoveredOptions } from '../state/graph.js';

export interface GraphPanelProps {
  readonly project: Project;
  readonly currentNodeId: string;
  readonly onSelectNode: (id: string) => void;
  readonly onAddNode: () => void;
  readonly onRemoveNode: (id: string) => void;
  readonly onConnect: (when: EdgeWhen, to: string) => void;
  readonly onDisconnect: (edgeId: string) => void;
}

/** Заголовок узла для показа автору — title, если он есть, иначе id. */
function titleOf(node: SegmentNode): string {
  return node.title || node.id;
}

function titleOfId(project: Project, id: string): string {
  const node = project.nodes.find((candidate) => candidate.id === id);
  return node ? titleOf(node) : id;
}

/** Подпись варианта гейта — из его конфигурации, а не голый id. */
function optionLabel(node: SegmentNode, gateId: string, optionId: string): string {
  const gate = node.scene.gates.find((candidate) => candidate.id === gateId);
  if (!gate || gate.config.kind !== 'choice') return optionId;
  const option = gate.config.options.find((candidate) => candidate.id === optionId);
  return option?.label ?? optionId;
}

/** Человеческое описание одного исходящего ребра: условие и цель. */
function edgeText(edge: Edge, node: SegmentNode, project: Project): string {
  const target = titleOfId(project, edge.to);
  switch (edge.when.kind) {
    case 'option':
      return `вариант «${optionLabel(node, edge.when.gateId, edge.when.optionId)}» → ${target}`;
    case 'correct':
      return `верно → ${target}`;
    case 'wrong':
      return `неверно → ${target}`;
    case 'end':
      return `конец узла → ${target}`;
  }
}

const VERDICT_LABEL: Record<'correct' | 'wrong', string> = {
  correct: 'верно',
  wrong: 'неверно',
};

export function GraphPanel({
  project,
  currentNodeId,
  onSelectNode,
  onAddNode,
  onRemoveNode,
  onConnect,
  onDisconnect,
}: GraphPanelProps): ReactElement {
  const currentNode = project.nodes.find((candidate) => candidate.id === currentNodeId);
  if (!currentNode) {
    // Рассинхрон вида и проекта — то же требование, что и у currentNode()
    // в state/project.ts: молча показать пустую панель значило бы спрятать
    // настоящую причину.
    throw new Error(`Текущего узла «${currentNodeId}» нет в проекте`);
  }

  const reachable = useMemo(() => reachableFrom(project), [project]);
  const holes = useMemo(() => uncoveredOptions(currentNode), [currentNode]);

  // Цель в <select> для каждой ещё не заведённой связки — ключ вида
  // «gateId-optionId» или «gateId-verdict». Живёт здесь и только здесь:
  // это черновой выбор автора перед кликом «Соединить», не данные проекта.
  const [targets, setTargets] = useState<Record<string, string>>({});
  const defaultTarget = project.nodes[0]!.id;

  const targetFor = (key: string): string => targets[key] ?? defaultTarget;
  const setTargetFor = (key: string, value: string): void =>
    setTargets((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="ed-graph-panel" aria-label="Граф сегментов">
      <h2 className="ed-insp-title">Граф</h2>

      <ul className="ed-graph-nodes">
        {project.nodes.map((node) => {
          const isCurrent = node.id === currentNodeId;
          const isUnreachable = !reachable.has(node.id);
          return (
            <li key={node.id} className="ed-graph-node-row">
              <button
                type="button"
                className={isCurrent ? 'ed-graph-node ed-graph-node-current' : 'ed-graph-node'}
                aria-current={isCurrent ? 'true' : undefined}
                data-testid={`graph-node-${node.id}`}
                // Название узла в списке обрезается многоточием, если не влезло:
                // список имён это терпит (текущее имя целиком видно в заголовке
                // «Рёбра узла …»), но полное имя должно быть доступно наведением.
                title={titleOf(node)}
                onClick={() => onSelectNode(node.id)}
              >
                {titleOf(node)}
              </button>
              {isUnreachable ? (
                <span className="ed-graph-unreachable" data-testid={`graph-unreachable-${node.id}`}>
                  недостижим
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="ed-graph-actions">
        <button type="button" className="ed-action" data-testid="graph-add-node" onClick={onAddNode}>
          Добавить узел
        </button>
        <button
          type="button"
          className="ed-action"
          data-testid="graph-remove-node"
          disabled={currentNodeId === project.entry}
          onClick={() => onRemoveNode(currentNodeId)}
        >
          Удалить узел
        </button>
      </div>

      <h3 className="ed-insp-title">Рёбра узла «{titleOf(currentNode)}»</h3>
      {currentNode.edges.length > 0 ? (
        <ul className="ed-graph-edges">
          {currentNode.edges.map((edge) => (
            <li key={edge.id} className="ed-graph-edge-row">
              <span className="ed-graph-edge-text">{edgeText(edge, currentNode, project)}</span>
              <button
                type="button"
                className="ed-action"
                data-testid={`graph-disconnect-${edge.id}`}
                onClick={() => onDisconnect(edge.id)}
              >
                снять
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ed-graph-empty">У узла нет исходящих рёбер.</p>
      )}

      <h3 className="ed-insp-title">Непокрыто</h3>
      <div className="ed-graph-uncovered" data-testid="graph-uncovered">
        {holes.length === 0 ? (
          <p className="ed-graph-empty">Все варианты и исходы гейтов узла ведут куда-то.</p>
        ) : (
          holes.map((hole) => (
            <div key={hole.gateId} className="ed-graph-hole-group">
              {hole.optionIds.map((optionId) => {
                const key = `${hole.gateId}-${optionId}`;
                const label = optionLabel(currentNode, hole.gateId, optionId);
                return (
                  <div key={key} className="ed-graph-hole">
                    <span className="ed-graph-hole-text">
                      Гейт «{hole.gateId}»: вариант «{label}» никуда не ведёт
                    </span>
                    <select
                      className="ed-graph-select"
                      data-testid={`graph-target-${hole.gateId}-${optionId}`}
                      value={targetFor(key)}
                      onChange={(event) => setTargetFor(key, event.target.value)}
                    >
                      {project.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {titleOf(node)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`graph-connect-${hole.gateId}-${optionId}`}
                      onClick={() =>
                        onConnect({ kind: 'option', gateId: hole.gateId, optionId }, targetFor(key))
                      }
                    >
                      Соединить
                    </button>
                  </div>
                );
              })}
              {hole.verdicts.map((verdict) => {
                const key = `${hole.gateId}-${verdict}`;
                return (
                  <div key={key} className="ed-graph-hole">
                    <span className="ed-graph-hole-text">
                      Гейт «{hole.gateId}»: исход «{VERDICT_LABEL[verdict]}» никуда не ведёт
                    </span>
                    <select
                      className="ed-graph-select"
                      data-testid={`graph-target-${hole.gateId}-${verdict}`}
                      value={targetFor(key)}
                      onChange={(event) => setTargetFor(key, event.target.value)}
                    >
                      {project.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {titleOf(node)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ed-action"
                      data-testid={`graph-connect-${hole.gateId}-${verdict}`}
                      onClick={() => onConnect({ kind: verdict, gateId: hole.gateId }, targetFor(key))}
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

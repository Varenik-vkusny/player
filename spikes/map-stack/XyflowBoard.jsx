/**
 * Вариант Б — `@xyflow/react`. Тот же граф, те же четыре вида ребра, тот же
 * вид узла, но кастомный `nodeType`. Позиции берутся ИЗ ТОЙ ЖЕ layout.js —
 * `nodesDraggable={false}` намеренно: доска — вычисленный вид, а не второе
 * хранилище позиций (см. CLAUDE.md, доска ветвлений).
 *
 * `nodeTypes`/`edgeTypes` подняты в модульную область НАРОЧНО: библиотека
 * сверяет их по ссылке между рендерами (`useNodeOrEdgeTypesWarning`,
 * читал в исходнике node_modules/@xyflow/react/dist/esm/index.mjs:3217) и
 * при новом объекте на каждый рендер бросает предупреждение error002
 * в консоль. Если бы `nodeTypes` создавался инлайн внутри компонента —
 * предупреждение было бы гарантированным, а не гипотетическим.
 */
import { useMemo } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, Handle, Position, MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { layoutGraph } from './layout.js';
import {
  BOARD_BACKGROUND, GRID_STEP, NODE_WIDTH, NODE_HEIGHT,
  NODE_FILL, EMPTY_NODE_BORDER, EMPTY_NODE_FILL,
  EDGE_STROKE, START_EDGE_STROKE, BROKEN_EDGE_STROKE,
} from './theme.js';

function SegmentNode({ data }) {
  return (
    <div
      data-node-id={data.id}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        boxSizing: 'border-box',
        borderRadius: 6,
        padding: '10px 12px',
        color: '#f5f7fa',
        font: '13px/1.4 system-ui, sans-serif',
        background: data.isEmpty ? EMPTY_NODE_FILL : NODE_FILL,
        border: data.isEmpty ? EMPTY_NODE_BORDER : 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.id}</div>
      <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>{data.title}</div>
      {data.isEnd && <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>конец</div>}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

function StartNode() {
  return (
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: START_EDGE_STROKE }}>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

// Подняты за пределы компонента — см. комментарий вверху файла про error002.
const NODE_TYPES = { segment: SegmentNode, start: StartNode };

function toFlowKind(kind) {
  if (kind === 'start') return START_EDGE_STROKE;
  if (kind === 'broken') return BROKEN_EDGE_STROKE;
  return EDGE_STROKE;
}

export function XyflowBoard({ graph }) {
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const nodeIds = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph.nodes]);

  const nodes = useMemo(() => graph.nodes.map((n) => ({
    id: n.id,
    type: n.isStart ? 'start' : 'segment',
    position: posById.get(n.id) ?? { x: 0, y: 0 },
    data: n,
    draggable: false,
  })), [graph.nodes, posById]);

  // Сломанное ребро указывает на `s-nonexistent`, которого нет среди узлов.
  // Не подменяем цель заглушкой — оставляем как есть, чтобы увидеть, что
  // library делает с рёбрами в никуда (см. отчёт спайка, пункт 5).
  const edges = useMemo(() => graph.edges.map((e) => {
    const color = toFlowKind(e.kind);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      style: {
        stroke: color,
        strokeWidth: 2,
        strokeDasharray: e.kind === 'broken' ? '6 4' : undefined,
      },
      labelStyle: { fill: EDGE_STROKE, fontSize: 12, fontFamily: 'ui-monospace, monospace' },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  }), [graph.edges]);

  const missingTargets = graph.edges.filter((e) => !nodeIds.has(e.target)).map((e) => e.target);

  return (
    <div data-testid="xyflow-board" style={{ width: '100%', height: '100%' }}>
      {missingTargets.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 5, top: 8, right: 8, background: 'rgba(220,80,80,0.15)',
          color: BROKEN_EDGE_STROKE, font: '11px ui-monospace, monospace', padding: '4px 8px', borderRadius: 4,
        }}>
          цель вне узлов: {missingTargets.join(', ')}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Lines} gap={GRID_STEP} color="rgba(255,255,255,0.06)" />
      </ReactFlow>
      <style>{`.react-flow { background: ${BOARD_BACKGROUND}; }`}</style>
    </div>
  );
}

/**
 * Вариант А — своя отрисовка. Один <svg> на всю доску рисует ВСЕ рёбра
 * (как у Twine), узлы — обычные div поверх него. Позиции — из layout.js,
 * прокрутка — обычным overflow:auto, pan/zoom нет.
 */
import { useMemo } from 'react';
import { layoutGraph } from './layout.js';
import {
  BOARD_BACKGROUND, GRID_STEP, NODE_WIDTH, NODE_HEIGHT, GAP,
  NODE_FILL, EMPTY_NODE_BORDER, EMPTY_NODE_FILL,
  EDGE_STROKE, EDGE_STROKE_WIDTH, START_EDGE_STROKE, BROKEN_EDGE_STROKE,
} from './theme.js';

const START_DOT = 18;

function edgeColor(kind) {
  if (kind === 'start') return START_EDGE_STROKE;
  if (kind === 'broken') return BROKEN_EDGE_STROKE;
  return EDGE_STROKE;
}

/** Точка на границе карточки, обращённой к другому центру — просто верх/низ,
 *  у нас раскладка слоями сверху вниз, горизонтальных переходов между
 *  соседними слоями почти нет. */
function anchor(pos, fromTop) {
  const cx = pos.x + NODE_WIDTH / 2;
  const cy = fromTop ? pos.y : pos.y + NODE_HEIGHT;
  return { x: cx, y: cy };
}

export function OwnBoard({ graph }) {
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const byId = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const width = Math.max(...positions.map((p) => p.x)) + NODE_WIDTH + GAP * 2;
  const height = Math.max(...positions.map((p) => p.y)) + NODE_HEIGHT + GAP * 2;

  return (
    <div
      data-testid="own-board"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'auto',
        background: `
          linear-gradient(${BOARD_BACKGROUND}, ${BOARD_BACKGROUND}),
          repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0 1px, transparent 1px ${GRID_STEP}px),
          repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px ${GRID_STEP}px)
        `,
        backgroundColor: BOARD_BACKGROUND,
      }}
    >
      <div style={{ position: 'relative', width, height }}>
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          <defs>
            <marker id="arrow-normal" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={EDGE_STROKE} />
            </marker>
            <marker id="arrow-start" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={START_EDGE_STROKE} />
            </marker>
            <marker id="arrow-broken" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={BROKEN_EDGE_STROKE} />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const from = byId.get(edge.source);
            // у сломанного ребра цели в раскладке нет — тянем культю вправо от источника
            const to = byId.get(edge.target) ?? (from ? { x: from.x + NODE_WIDTH + 60, y: from.y } : null);
            if (!from || !to) return null;

            const a = anchor(from, false);
            const b = edge.kind === 'broken'
              ? { x: to.x + NODE_WIDTH / 2, y: to.y + NODE_HEIGHT / 2 }
              : anchor(to, true);
            const midY = (a.y + b.y) / 2;
            const path = `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
            const marker = edge.kind === 'start' ? 'arrow-start' : edge.kind === 'broken' ? 'arrow-broken' : 'arrow-normal';

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={edgeColor(edge.kind)}
                  strokeWidth={EDGE_STROKE_WIDTH}
                  strokeDasharray={edge.kind === 'broken' ? '6 4' : undefined}
                  markerEnd={`url(#${marker})`}
                />
                {edge.label && (
                  <text
                    x={(a.x + b.x) / 2}
                    y={midY - 6}
                    fill={EDGE_STROKE}
                    fontSize="12"
                    textAnchor="middle"
                    fontFamily="ui-monospace, monospace"
                  >
                    {edge.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {positions.map((pos) => {
          const node = nodesById.get(pos.id);
          if (!node) return null;

          if (node.isStart) {
            return (
              <div
                key={pos.id}
                title="старт"
                style={{
                  position: 'absolute',
                  left: pos.x + NODE_WIDTH / 2 - START_DOT / 2,
                  top: pos.y + NODE_HEIGHT / 2 - START_DOT / 2,
                  width: START_DOT,
                  height: START_DOT,
                  borderRadius: '50%',
                  background: START_EDGE_STROKE,
                }}
              />
            );
          }

          return (
            <div
              key={pos.id}
              data-node-id={pos.id}
              style={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: NODE_WIDTH,
                height: NODE_HEIGHT,
                boxSizing: 'border-box',
                borderRadius: 6,
                padding: '10px 12px',
                color: '#f5f7fa',
                font: '13px/1.4 system-ui, sans-serif',
                background: node.isEmpty ? EMPTY_NODE_FILL : NODE_FILL,
                border: node.isEmpty ? EMPTY_NODE_BORDER : 'none',
              }}
            >
              <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.id}
              </div>
              <div style={{ marginTop: 4, opacity: 0.85, fontSize: 12 }}>{node.title}</div>
              {node.isEnd && (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>конец</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

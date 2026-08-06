/**
 * Раскладка доски ветвлений. Чистая функция: на входе граф `{ entry, nodes, edges }`
 * (форма — см. graph.js), на выходе массив позиций `[{ id, x, y }]`.
 *
 * Алгоритм: слои по достижимости в ширину (BFS) от `__start__` (или от `entry`,
 * если псевдо-узла старта нет). Внутри слоя узлы идут в ряд слева направо.
 * Шаг между слоями и внутри слоя берётся из размеров карточки — так уже
 * не нужно синхронизировать два места руками.
 *
 * Циклы (ребро назад на уже размещённый узел) не зацикливают обход: BFS
 * с `visited` заходит в узел ровно один раз, повторное ребро просто не
 * порождает новый слой. Проверено на графе, где `s-end` ссылается обратно
 * на `s-count` (собран только в памяти при разработке спайка, см. отчёт).
 *
 * Рёбра типа `broken` ведут на несуществующий id — такой узел никогда не
 * появится ни в одном слое (не считаем цель существующей веткой обхода),
 * поэтому источник сломанного ребра кладётся в приёмник «недостижимых»
 * вместе с любыми другими узлами, до которых не дошёл BFS.
 */

export function layoutGraph(graph, opts = {}) {
  const NODE_WIDTH = opts.nodeWidth ?? 220;
  const NODE_HEIGHT = opts.nodeHeight ?? 96;
  const GAP = opts.gap ?? 25;

  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const outgoing = new Map();
  for (const id of nodeIds) outgoing.set(id, []);
  for (const e of graph.edges) {
    if (!outgoing.has(e.source)) continue;
    if (!nodeIds.has(e.target)) continue; // сломанное ребро — цели в графе нет
    outgoing.get(e.source).push(e.target);
  }

  const root = nodeIds.has('__start__') ? '__start__' : graph.entry;

  const layerOf = new Map();
  if (root && nodeIds.has(root)) {
    layerOf.set(root, 0);
    let frontier = [root];
    let depth = 0;
    while (frontier.length) {
      const next = [];
      for (const id of frontier) {
        for (const targetId of outgoing.get(id) ?? []) {
          if (layerOf.has(targetId)) continue; // страж от циклов
          layerOf.set(targetId, depth + 1);
          next.push(targetId);
        }
      }
      frontier = next;
      depth += 1;
    }
  }

  // Всё, до чего BFS не дошёл (изолированные и фиктивные узлы вроде
  // источника сломанного ребра) — отдельным слоем в конце, а не потеряно.
  const maxLayer = layerOf.size ? Math.max(...layerOf.values()) : -1;
  let unreachedLayer = maxLayer + 1;
  for (const n of graph.nodes) {
    if (!layerOf.has(n.id)) layerOf.set(n.id, unreachedLayer);
  }

  const byLayer = new Map();
  for (const n of graph.nodes) {
    const layer = layerOf.get(n.id);
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(n.id);
  }

  const positions = [];
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  for (const layer of layers) {
    const ids = byLayer.get(layer);
    ids.forEach((id, index) => {
      positions.push({
        id,
        x: index * (NODE_WIDTH + GAP),
        y: layer * (NODE_HEIGHT + GAP),
      });
    });
  }
  return positions;
}

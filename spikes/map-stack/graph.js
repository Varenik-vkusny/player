/**
 * Строит граф ветвлений из «сырого» проекта (форма fixtures/projects/conditions.json,
 * schemaVersion 5) — без обращения к packages/core: спайку интересна только форма
 * exit.rules / exit.default, а не полный `loadProject`.
 *
 * Видов ребра четыре:
 *   1. rule    — exit.rules[].goto,       подпись — id правила;
 *   2. default — exit.default (строка),   без подписи;
 *   3. конец   — exit.default === null,   это НЕ ребро, а пометка на узле;
 *   4. broken  — goto/default указывает на несуществующий id сегмента.
 *
 * Плюс отдельный псевдо-узел `__start__` и зелёное ребро от него к `entry` —
 * ориентир Twine показывает вход в граф так же, а не подсветкой самого узла.
 */

export function buildGraph(project) {
  const nodes = project.segments.map((seg) => ({
    id: seg.id,
    title: seg.title,
    isEnd: seg.exit.default === null,
    isEmpty: false, // у всех сегментов conditions.json есть elements/slides
  }));

  const edges = [];
  for (const seg of project.segments) {
    for (const rule of seg.exit.rules) {
      edges.push({
        id: `${seg.id}::rule::${rule.id}`,
        source: seg.id,
        target: rule.goto,
        kind: 'rule',
        label: rule.id,
      });
    }
    if (seg.exit.default !== null) {
      edges.push({
        id: `${seg.id}::default`,
        source: seg.id,
        target: seg.exit.default,
        kind: 'default',
        label: '',
      });
    }
  }

  nodes.push({ id: '__start__', title: '', isStart: true });
  edges.push({ id: '__start__::entry', source: '__start__', target: project.entry, kind: 'start', label: '' });

  return { entry: project.entry, nodes, edges };
}

/**
 * Добавляет ФИКТИВНЫЙ узел со сломанным переходом — ТОЛЬКО в памяти.
 * В `conditions.json` такого узла нет и не будет: фикстура неприкосновенна,
 * а вид «сломанное ребро» в ней не встречается ни разу.
 *
 * Тот же узел несёт и вид «пустой узел» (в conditions.json пустых нет —
 * у всех четырёх сегментов есть elements/slides): фиктивному узлу нечего
 * показать, кроме заглушки, это ровно то же самое условие, что у пустой
 * заготовки в Twine. Одно добавление — два вида, а не два добавления.
 */
export function addBrokenNode(graph) {
  const nodes = [
    ...graph.nodes,
    { id: 's-broken', title: '(фиктивный) узел со сломанным переходом', isEnd: false, isEmpty: true },
  ];
  const edges = [
    ...graph.edges,
    { id: 's-broken::default', source: 's-broken', target: 's-nonexistent', kind: 'broken', label: '' },
  ];
  return { ...graph, nodes, edges };
}

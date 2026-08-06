/** Отдельная точка входа варианта А — для честного замера веса сборки:
 *  этот бандл не должен содержать ни строки варианта Б. */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildGraph, addBrokenNode } from './graph.js';
import { OwnBoard } from './OwnBoard.jsx';

function App() {
  const [graph, setGraph] = useState(null);
  useEffect(() => {
    fetch('/fixtures/conditions.json')
      .then((r) => r.json())
      .then((raw) => setGraph(addBrokenNode(buildGraph(raw))));
  }, []);
  if (!graph) return <div style={{ color: '#fff', padding: 16 }}>Загружаю conditions.json…</div>;
  return <div style={{ position: 'fixed', inset: 0 }}><OwnBoard graph={graph} /></div>;
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

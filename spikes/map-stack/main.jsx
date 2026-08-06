/**
 * Спайк карты ветвлений: своя отрисовка vs `@xyflow/react` на ОДНОМ и том
 * же настоящем графе (fixtures/projects/conditions.json, не трогается).
 * Кнопка переключает вариант — измерения бандла делаются отдельными
 * сборками (vite.config.a.mjs / vite.config.b.mjs), эта страница только
 * для визуального сравнения и снятия консоли в dev.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildGraph, addBrokenNode } from './graph.js';
import { OwnBoard } from './OwnBoard.jsx';
import { XyflowBoard } from './XyflowBoard.jsx';

function App() {
  const [variant, setVariant] = useState('a');
  const [graph, setGraph] = useState(null);

  useEffect(() => {
    fetch('/fixtures/conditions.json')
      .then((r) => r.json())
      .then((raw) => setGraph(addBrokenNode(buildGraph(raw))));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, background: '#111', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setVariant('a')} disabled={variant === 'a'}>А — своя отрисовка</button>
        <button onClick={() => setVariant('b')} disabled={variant === 'b'}>Б — @xyflow/react</button>
        <span style={{ color: '#aaa', font: '12px ui-monospace, monospace' }}>
          узлов: {graph?.nodes.length ?? '…'} · рёбер: {graph?.edges.length ?? '…'}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {!graph ? (
          <div style={{ color: '#fff', padding: 16 }}>Загружаю conditions.json…</div>
        ) : variant === 'a' ? (
          <OwnBoard graph={graph} />
        ) : (
          <XyflowBoard graph={graph} />
        )}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

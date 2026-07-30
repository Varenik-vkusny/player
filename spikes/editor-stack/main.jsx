/**
 * Спайк стека редактора: moveable + selecto + @scena/react-guides
 * на НАСТОЯЩЕЙ сцене — эталонная фикстура, пропущенная через loadProject,
 * и renderScene, импортированный из плеера (инвариант №5).
 *
 * Спайк отвечает на вопросы, которых нет в документации библиотек:
 *
 *   1. Понимают ли они `transform: scale()` на родителе сцены. У нас сцена
 *      всегда 1920x1080 и всегда вписана в контейнер, а `CLAUDE.md` прямо
 *      предупреждает, что смешение координатных пространств ломает
 *      перетаскивание тихо.
 *   2. Можно ли снять с них ЛОГИЧЕСКИЕ координаты для записи в проект.
 *   3. Работают ли они поверх чужого DOM — того, что построил renderScene,
 *      а не React.
 *
 * Спайк одноразовый: в `pnpm check` не входит, запускается руками
 * через `pnpm spike:editor-stack`.
 */
import { StrictMode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Moveable from 'react-moveable';
import Selecto from 'react-selecto';
import Guides from '@scena/react-guides';

import { loadProject } from '@player/core';
import { entryNodeOf, renderScene, segmentOf } from '@player/player';

const RULER = 24;

/** Масштаб берётся из DOM, никогда из сохранённого значения. */
function useStageScale(ref, stageWidth) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host || !stageWidth) return undefined;
    const measure = () => setScale(host.clientWidth / stageWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [ref, stageWidth]);
  return scale;
}

function App() {
  const viewportRef = useRef(null);
  const hostRef = useRef(null);
  const moveableRef = useRef(null);
  const rulerH = useRef(null);
  const rulerV = useRef(null);

  const [segment, setSegment] = useState(null);
  const [boxes, setBoxes] = useState({});      // id → логическая геометрия
  const [selected, setSelected] = useState([]);
  const [targets, setTargets] = useState([]);
  const [vGuides, setVGuides] = useState([]);
  const [hGuides, setHGuides] = useState([]);
  const [log, setLog] = useState([]);

  const say = useCallback((line) => setLog((prev) => [...prev, line].slice(-24)), []);
  const scale = useStageScale(viewportRef, segment?.stage.width);

  // Фикстура v1 проходит миграцию на лету — тот же путь, что у плеера.
  //
  // Взята `scene-gate.json`, а не `demo.json`, намеренно: у demo шесть
  // элементов из семи несут `opacity: 0` в собственном стиле и проявляются
  // анимациями (ADR-009). `renderScene` без таймлайна честно показывает их
  // до-анимационное состояние, то есть невидимыми, — и двигать было бы
  // нечего. У `scene-gate.json` четыре элемента и ни одного кью.
  useEffect(() => {
    fetch('/fixtures/scene-gate.json')
      .then((r) => r.json())
      .then((raw) => {
        const project = loadProject(raw);
        const seg = segmentOf(project, entryNodeOf(project));
        setSegment(seg);
        setBoxes(Object.fromEntries(seg.scene.elements.map((el) => [
          el.id, { x: el.x, y: el.y, width: el.width, height: el.height, rotation: el.rotation },
        ])));
      });
  }, []);

  // Сцену строит ПЛЕЕР, а не React. Библиотеки обязаны работать поверх
  // чужого DOM: если для них нужен свой рендер, инвариант №5 сломан.
  useLayoutEffect(() => {
    if (!segment || !hostRef.current) return;
    renderScene(hostRef.current, segment.scene, segment.stage);
    say(`сцена построена renderScene: элементов ${segment.scene.elements.length}`);
  }, [segment, say]);

  useLayoutEffect(() => {
    if (!hostRef.current) return;
    setTargets(selected.map((id) => hostRef.current.querySelector(`[data-id="${id}"]`)).filter(Boolean));
  }, [selected, boxes]);

  /** Записать жест в модель — в логических координатах сцены. */
  const commit = useCallback((id, patch) => {
    setBoxes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const restore = useCallback((node, id) => {
    setBoxes((prev) => {
      const b = prev[id];
      if (b) {
        node.style.left = `${b.x}px`;
        node.style.top = `${b.y}px`;
        node.style.width = `${b.width}px`;
        node.style.height = `${b.height}px`;
        node.style.transform = b.rotation ? `rotate(${b.rotation}deg)` : '';
      }
      return prev;
    });
  }, []);

  if (!segment) return <div className="left">Загружаю demo.json…</div>;

  const stage = segment.stage;
  const guideProps = {
    type: undefined, zoom: scale, unit: 100, backgroundColor: '#27272a',
    lineColor: '#71717a', textColor: '#d4d4d8', segment: 2,
  };

  return (
    <>
      <div className="left">
        <h3>
          Сцена {stage.width}×{stage.height} · масштаб {scale.toFixed(4)} ·
          фикстура scene-gate.json (v1 → миграция → v2)
        </h3>
        <div className="hint">
          Тяни рамкой по пустому месту — множественное выделение. Тяни с линейки — направляющая.
        </div>
        <div className="frame">
          <div className="corner" />
          <div className="ruler-h">
            <Guides ref={rulerH} {...guideProps} type="horizontal"
              onChangeGuides={({ guides }) => setVGuides(guides)} />
          </div>
          <div className="ruler-v">
            <Guides ref={rulerV} {...guideProps} type="vertical"
              onChangeGuides={({ guides }) => setHGuides(guides)} />
          </div>

          <div className="viewport" ref={viewportRef}>
            <div className="stage-host" ref={hostRef} style={{ transform: `scale(${scale})` }} />

            <Moveable
              ref={moveableRef}
              target={targets}
              draggable resizable rotatable snappable
              origin={false}
              throttleDrag={0}
              verticalGuidelines={vGuides}
              horizontalGuidelines={hGuides}
              elementGuidelines={segment.scene.elements.map((e) => `[data-id="${e.id}"]`)}
              snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
              elementSnapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
              snapThreshold={6}
              onDrag={({ target, beforeTranslate }) => {
                const id = target.dataset['id'];
                const rot = boxes[id]?.rotation ?? 0;
                target.style.transform =
                  `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)` + (rot ? ` rotate(${rot}deg)` : '');
              }}
              onDragEnd={({ target, lastEvent }) => {
                if (!lastEvent) return;
                const id = target.dataset['id'];
                const [dx, dy] = lastEvent.beforeTranslate;
                setBoxes((prev) => {
                  const b = prev[id];
                  const next = { ...b, x: b.x + dx, y: b.y + dy };
                  target.style.left = `${next.x}px`;
                  target.style.top = `${next.y}px`;
                  target.style.transform = next.rotation ? `rotate(${next.rotation}deg)` : '';
                  return { ...prev, [id]: next };
                });
                say(`перетаскивание «${id}»: ${dx.toFixed(1)}, ${dy.toFixed(1)} логических`);
              }}
              onResize={({ target, width, height, drag }) => {
                target.style.width = `${width}px`;
                target.style.height = `${height}px`;
                target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`;
              }}
              onResizeEnd={({ target, lastEvent }) => {
                if (!lastEvent) return;
                const id = target.dataset['id'];
                const [dx, dy] = lastEvent.drag.beforeTranslate;
                setBoxes((prev) => {
                  const b = prev[id];
                  const next = { ...b, x: b.x + dx, y: b.y + dy, width: lastEvent.width, height: lastEvent.height };
                  target.style.left = `${next.x}px`;
                  target.style.top = `${next.y}px`;
                  target.style.transform = next.rotation ? `rotate(${next.rotation}deg)` : '';
                  return { ...prev, [id]: next };
                });
                say(`размер «${id}»: ${lastEvent.width.toFixed(0)}×${lastEvent.height.toFixed(0)}`);
              }}
              onRotate={({ target, transform }) => { target.style.transform = transform; }}
              onRotateEnd={({ target, lastEvent }) => {
                if (!lastEvent) return;
                const id = target.dataset['id'];
                commit(id, { rotation: lastEvent.rotation });
                target.style.transform = `rotate(${lastEvent.rotation}deg)`;
                say(`поворот «${id}»: ${lastEvent.rotation.toFixed(1)}°`);
              }}
              onDragGroup={({ events }) => {
                events.forEach(({ target, beforeTranslate }) => {
                  target.style.transform = `translate(${beforeTranslate[0]}px, ${beforeTranslate[1]}px)`;
                });
              }}
              onDragGroupEnd={({ events }) => {
                setBoxes((prev) => {
                  const next = { ...prev };
                  events.forEach(({ target, lastEvent }) => {
                    if (!lastEvent) return;
                    const id = target.dataset['id'];
                    const b = next[id];
                    next[id] = { ...b, x: b.x + lastEvent.beforeTranslate[0], y: b.y + lastEvent.beforeTranslate[1] };
                    target.style.left = `${next[id].x}px`;
                    target.style.top = `${next[id].y}px`;
                    target.style.transform = next[id].rotation ? `rotate(${next[id].rotation}deg)` : '';
                  });
                  return next;
                });
                say(`группа: сдвинуто ${events.length} элементов`);
              }}
              onResizeGroup={({ events }) => {
                events.forEach(({ target, width, height, drag }) => {
                  target.style.width = `${width}px`;
                  target.style.height = `${height}px`;
                  target.style.transform = `translate(${drag.beforeTranslate[0]}px, ${drag.beforeTranslate[1]}px)`;
                });
              }}
              onResizeGroupEnd={({ events }) => {
                setBoxes((prev) => {
                  const next = { ...prev };
                  events.forEach(({ target, lastEvent }) => {
                    if (!lastEvent) return;
                    const id = target.dataset['id'];
                    const b = next[id];
                    next[id] = {
                      ...b,
                      x: b.x + lastEvent.drag.beforeTranslate[0],
                      y: b.y + lastEvent.drag.beforeTranslate[1],
                      width: lastEvent.width, height: lastEvent.height,
                    };
                    target.style.left = `${next[id].x}px`;
                    target.style.top = `${next[id].y}px`;
                    target.style.width = `${next[id].width}px`;
                    target.style.height = `${next[id].height}px`;
                    target.style.transform = next[id].rotation ? `rotate(${next[id].rotation}deg)` : '';
                  });
                  return next;
                });
                say(`группа: изменён размер ${events.length} элементов`);
              }}
            />

            <Selecto
              dragContainer=".viewport"
              selectableTargets={['.stage-host [data-id]']}
              hitRate={0}
              selectByClick
              selectFromInside={false}
              toggleContinueSelect={['shift']}
              /**
               * Сторож передачи жеста. Без него selecto забирает КАЖДОЕ
               * нажатие внутри области, включая нажатия на ручки moveable,
               * и в `onSelectEnd` мы принудительно зовём `dragStart` —
               * то есть ресайз и поворот молча превращаются в перетаскивание.
               *
               * Замерено: при нажатии на юго-восточную ручку элемент получал
               * `translate(1036px, 189px)` вместо изменения размера, а ширина
               * оставалась 1640px. Ни ошибки, ни предупреждения — просто
               * другой жест.
               */
              onDragStart={(e) => {
                const node = e.inputEvent.target;
                // Проверка по классу, а не через `isMoveableElement`: замерено,
                // что для самих ручек он возвращает ложь, и сторож не срабатывал.
                const наРучке = node instanceof Element
                  && !!node.closest('.moveable-control-box, .moveable-control, .moveable-area');
                const наВыделенном = targets.some((t) => t === node || t.contains(node));
                if (наРучке || наВыделенном) e.stop();
              }}
              onSelectEnd={({ selected: sel, isDragStart, inputEvent }) => {
                const ids = sel.map((n) => n.dataset['id']);
                setSelected(ids);
                say(`выделено: ${ids.length ? ids.join(', ') : '—'}`);
                if (isDragStart) {
                  inputEvent.preventDefault();
                  moveableRef.current?.dragStart(inputEvent);
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <button onClick={() => { setSelected([]); setVGuides([]); setHGuides([]); }}>Сбросить</button>
        <button onClick={() => {
          // Круговая проверка: логическое × масштаб обязано совпасть с экранным.
          const rows = Object.entries(boxes).map(([id, b]) => {
            const node = hostRef.current.querySelector(`[data-id="${id}"]`);
            if (!node) return `${id}: нет узла`;
            const r = node.getBoundingClientRect();
            const v = viewportRef.current.getBoundingClientRect();
            const expected = v.left + b.x * scale;
            return `${id.padEnd(9)} расхождение ${(r.left - expected).toFixed(3)} px`;
          });
          rows.forEach(say);
        }}>Круговая проверка координат</button>

        <h4>Логические координаты</h4>
        <pre>{Object.entries(boxes).map(([id, b]) =>
          `${id.padEnd(9)} ${b.x.toFixed(1).padStart(7)} ${b.y.toFixed(1).padStart(7)} ` +
          `${b.width.toFixed(0).padStart(5)}×${b.height.toFixed(0)} ${b.rotation.toFixed(1)}°`).join('\n')}</pre>

        <h4>Направляющие</h4>
        <pre>{`вертикальных: ${vGuides.length}\nгоризонтальных: ${hGuides.length}`}</pre>

        <h4>Журнал</h4>
        <pre>{log.join('\n') || '—'}</pre>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

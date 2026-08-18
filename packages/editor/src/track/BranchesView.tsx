/**
 * Вид «Ветки»: устройство рассказа целиком (`branches.md` §5, §6).
 *
 * Сессия 42 рисовала только основную ветку — пять открытых вопросов
 * (`branches.md` §11) стояли в пути. Владелец 16.08.2026 снял их разом:
 * «как в фигме — просто пространство, по которому можно ездить, зажимая
 * колёсико мыши», плюс полноценный масштаб. Вид больше не подгоняет ветку
 * под ширину экрана и не решает, что показать, а что спрятать за прокруткой:
 * дерево целиком лежит на бесконечном полотне, автор ездит и масштабирует
 * его сам, как карту.
 *
 * Вся арифметика — чужая и готовая: `branchTree.ts` строит полосы дерева,
 * `branchLayout.ts` кладёт их в иксы и игреки, `branchSpace.ts` считает
 * камеру (сдвиг + масштаб). Этот файл только рисует то, что они посчитали,
 * и ловит два жеста — колесо и зажатое среднее колёсико. Ни одной формулы
 * раскладки или масштаба здесь нет и не должно появиться: два обхода одной
 * и той же арифметики разойдутся молча, как предупреждает `branchLayout.ts`
 * про `leadsBack`.
 *
 * Сворачивание веток — состояние САМОГО ВИДА, не проекта: это
 * предпросмотр автора для себя, зритель его не увидит никогда, ровно как
 * сворачивание ленты слайдов.
 *
 * ГЛАВНАЯ ОПАСНОСТЬ, измеренная в этом проекте: `setPointerCapture`
 * на сцене переадресует последующий `click` захватившему узлу — кнопки
 * внутри холста перестают отвечать, без единой ошибки в консоли. Плитки
 * глав — кнопки. Поэтому захват указателя берётся ТОЛЬКО на средней кнопке
 * мыши (`button === 1`) и всегда отпускается в `pointerup`/`pointercancel`;
 * левый щелчок эту ветку кода вообще не задевает.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { BranchLane } from '../state/branchTree.js';
import type { DurationRange } from '../state/durationRange.js';
import { layoutLanes, NAME_WIDTH, ROW_HEIGHT, TAIL_WIDTH, type LaneRow, type TileBox } from './branchLayout.js';
import {
  fitView,
  IDENTITY_VIEW,
  panBy,
  wheelIntent,
  zoomAt,
  type SpaceView,
} from './branchSpace.js';

export interface BranchesViewProps {
  /** Дерево полос целиком, в порядке обхода (`branchTree`). */
  readonly lanes: readonly BranchLane[];
  /** Глава, открытая на холсте: её плитка выделена. */
  readonly currentId: string;
  /** Щелчок по плитке — холст показывает эту главу (`branches.md` §5.5). */
  readonly onPick: (id: string) => void;
  /** Двойной щелчок и правка имени. Пустое имя не принимается. */
  readonly onRename: (id: string, title: string) => void;
  /**
   * Вилка длительностей объяснения (`branches.md` §8). Одного числа
   * у объяснения нет: ветки разной длины — у разных зрителей разное время,
   * и любое единственное число будет враньём.
   */
  readonly range: DurationRange;
  /**
   * Почему выделенный диапазон нельзя вынести в ветку. `undefined` — можно.
   * Причина показывается автору строкой, а кнопка гаснет: погасить кнопку,
   * не сказав почему, — то же самое, что не показать её вовсе.
   */
  readonly extractReason: (chapterIds: readonly string[]) => string | undefined;
  /** «Вынести в ветку» — выделенные подряд идущие главы становятся веткой. */
  readonly onExtract: (chapterIds: readonly string[]) => void;
}

/** Длительность словами автора: «8:02», а не «482 с». */
function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Текст хвоста. `layoutLanes` всегда печатает «дальше → …» — она не знает
 * о направлении текста, только о факте `repeat`. Слово переставляет вид,
 * не задваивая расчёт (позицию, длину для вписывания и т.д.) из `branchLayout.ts`.
 */
function tailText(row: LaneRow): string {
  if (row.tail.kind === 'end' || !row.tail.repeat) return row.tail.label;
  return row.tail.label.replace('дальше →', 'назад →');
}

/** Ломаная связки/обычной дуги: от начала вниз (или вверх) до Y цели, затем вбок до X цели. */
function elbowPath(fromX: number, fromY: number, toX: number, toY: number): string {
  if (fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  return `M ${fromX} ${fromY} L ${fromX} ${toY} L ${toX} ${toY}`;
}

/**
 * Дуга повтора — кривая ВВЕРХ над строками, чтобы не путать с обычной
 * ломаной вниз.
 *
 * Вершина НЕ ПОДНИМАЕТСЯ ВЫШЕ ПОЛОТНА. Замерено 17.08.2026 на фикстуре
 * `repeat`: у повтора из первой же строки вершина уходила на `y = −5.6`,
 * а полотно начинается на нуле — верх дуги просто срезался, и автор видел
 * не дугу, а две вертикальные палки. Ошибка того рода, что не бросает
 * и не пишет в консоль: рисуется молча и неправильно.
 */
function repeatArcPath(fromX: number, fromY: number, toX: number, toY: number): string {
  /*
   * УПРАВЛЯЮЩАЯ ТОЧКА НЕ РАВНА ВЕРШИНЕ, и на этом легко обмануться.
   * У симметричной кубической кривой настоящая вершина поднимается лишь
   * на ТРИ ЧЕТВЕРТИ от подъёма управляющих точек. Замерено 17.08.2026:
   * при подъёме 33.6 кривая вставала на 25.2 — то есть на 1.2 единицы
   * выше края плитки, и дуги на экране не было видно вовсе, хотя разметка
   * в DOM присутствовала и выглядела правдоподобно.
   *
   * Концы дуги сидят на середине строки, то есть на 24 единицы НИЖЕ
   * верхнего края плитки. Чтобы кривая вышла над плиткой на заметные
   * 12 единиц, подняться она обязана на 36, а управляющие точки — на 48.
   */
  const CONTROL_LIFT = 48;
  const apex = Math.max(2, Math.min(fromY, toY) - CONTROL_LIFT);
  return `M ${fromX} ${fromY} C ${fromX} ${apex}, ${toX} ${apex}, ${toX} ${toY}`;
}

export function BranchesView({
  lanes, currentId, onPick, onRename, range, extractReason, onExtract,
}: BranchesViewProps): ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [view, setView] = useState<SpaceView>(IDENTITY_VIEW);
  /**
   * Выделенный диапазон глав — состояние ВЗГЛЯДА, не объяснения.
   * В проект не пишется и в `Editor.tsx` не поднимается, ровно как
   * свёрнутость веток: это предпросмотр редактора, а не свойство рассказа.
   */
  const [selection, setSelection] = useState<readonly string[]>([]);

  const layout = useMemo(() => layoutLanes(lanes, collapsed), [lanes, collapsed]);

  /**
   * Признак сироты берётся у полосы, а не у строки раскладки: раскладке он
   * безразличен (она не знает, кто до полосы доходит), а виду нужен — иначе
   * вынесенная ветка выглядит как обычная, и автор не поймёт, почему зритель
   * в неё не попадает. Молчащая сирота — худший исход операции «вынести».
   */
  const orphans = useMemo(
    () => new Set(lanes.filter((lane) => lane.orphan).map((lane) => lane.id)),
    [lanes],
  );

  /**
   * При каком ответе рассказ уходит в эту ветку (`branches.md` §5.1, долг
   * Сессии 43). Строка уже посчитана в `branchTree.ts` — `conditionText`
   * зовётся ровно один раз на весь редактор, здесь только достаётся по id
   * полосы. `LaneRow` из `branchLayout.ts` этого поля не несёт: раскладке
   * оно безразлично (не влияет ни на один икс/игрек), а заводить его там
   * значило бы протащить смысл через чистую арифметику без всякой нужды.
   */
  const entryConditions = useMemo(
    () => new Map(lanes.map((lane) => [lane.id, lane.entryCondition] as const)),
    [lanes],
  );

  /**
   * Щелчок по плитке: показать главу на холсте и выделить её одну.
   * Shift-щелчок: растянуть выделение по ЭТОЙ ЖЕ полосе от прежнего края
   * до нажатой плитки. Через полосы выделение не тянется — ветка обязана
   * быть цепочкой, а две полосы цепочки не образуют (`extractBlockedReason`
   * отказал бы, но лучше не дать собрать заведомо негодное, чем собрать
   * и погасить кнопку).
   */
  const pickTile = useCallback((row: LaneRow, tile: TileBox, extend: boolean) => {
    onPick(tile.id);
    setSelection((prev) => {
      const ids = row.tiles.map((each) => each.id);
      const clicked = ids.indexOf(tile.id);
      const anchor = prev.length > 0 ? ids.indexOf(prev[0]!) : -1;
      if (!extend || anchor < 0) return [tile.id];
      const from = Math.min(anchor, clicked);
      const to = Math.max(anchor, clicked);
      // Первым в списке остаётся якорь: следующий Shift-щелчок тянет от него.
      const run = ids.slice(from, to + 1);
      return anchor <= clicked ? run : [...run].reverse();
    });
  }, [onPick]);

  const selectionReason = selection.length === 0 ? undefined : extractReason(selection);
  const canExtract = selection.length > 0 && selectionReason === undefined;

  const handleExtract = useCallback(() => {
    if (selection.length === 0) return;
    onExtract(selection);
    setSelection([]);
  }, [onExtract, selection]);

  const toggleCollapse = useCallback((laneId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId); else next.add(laneId);
      return next;
    });
  }, []);

  // Правка имени начинается с текущего — автор чаще уточняет, чем пишет заново.
  const startRename = useCallback((tile: TileBox) => {
    setEditing(tile.id);
    setDraft(tile.title);
  }, []);

  const commitRename = useCallback(() => {
    if (editing === null) return;
    const title = draft.trim();
    // Пустое имя не принимается: плитка без подписи ничего не говорит автору.
    if (title.length > 0) onRename(editing, title);
    setEditing(null);
  }, [editing, draft, onRename]);

  // Esc отменяет правку, не записывая.
  useEffect(() => {
    if (editing === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  /**
   * Размер окна пространства меряется у `.ed-branches-space` (окна),
   * а не у полотна: полотно раскладывается АБСОЛЮТНО позиционированными
   * строками и само по себе не имеет размера — наблюдатель на нём измерил
   * бы 0×0 и никогда не сдвинулся бы. Тот же приём, что у прежней ленты глав
   * и у дорожки: размер контейнера, не содержимого.
   */
  const spaceRef = useRef<HTMLDivElement>(null);
  const [spaceSize, setSpaceSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const space = spaceRef.current;
    if (!space) return undefined;
    const observer = new ResizeObserver(() => {
      setSpaceSize({ width: space.clientWidth, height: space.clientHeight });
    });
    observer.observe(space);
    setSpaceSize({ width: space.clientWidth, height: space.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Вписывание — один раз при первом ненулевом размере окна. Дальше вид
  // принадлежит автору и не прыгает сам, даже когда дерево меняется
  // (сворачивание ветки, переименование).
  const hasFittedRef = useRef(false);
  useEffect(() => {
    if (hasFittedRef.current) return;
    if (spaceSize.width <= 0 || spaceSize.height <= 0) return;
    hasFittedRef.current = true;
    setView(fitView(layout.bounds, spaceSize.width, spaceSize.height));
  }, [spaceSize, layout.bounds]);

  const handleFit = useCallback(() => {
    const space = spaceRef.current;
    if (!space) return;
    setView(fitView(layout.bounds, space.clientWidth, space.clientHeight));
  }, [layout.bounds]);

  /**
   * Колесо мыши. Обязано звать `preventDefault`, а React вешает `wheel`
   * пассивно — там `preventDefault` молча не сработает. Поэтому слушатель
   * ставится напрямую через `addEventListener` с `{ passive: false }`.
   */
  useEffect(() => {
    const space = spaceRef.current;
    if (!space) return undefined;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const intent = wheelIntent(event);
      if (intent.kind === 'zoom') {
        const rect = space.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        setView((prev) => zoomAt(prev, intent.factor, point));
      } else {
        setView((prev) => panBy(prev, intent.screenDx, intent.screenDy));
      }
    };
    space.addEventListener('wheel', onWheel, { passive: false });
    return () => space.removeEventListener('wheel', onWheel);
  }, []);

  // Езда зажатым средним колёсиком — см. предупреждение о захвате указателя
  // в шапке файла: захват берётся ТОЛЬКО на button === 1.
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }, []);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    pan.x = event.clientX;
    pan.y = event.clientY;
    setView((prev) => panBy(prev, dx, dy));
  }, []);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // Chrome включает свою автопрокрутку по среднему клику, если не отменить
  // `auxclick` явно — иначе она конкурирует с ездой пространства.
  const handleAuxClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  return (
    <section className="ed-branches" data-testid="branches-view" aria-label="Ветки">
      <div className="ed-branches-bar">
        <button type="button" className="ed-branches-fit" data-testid="branches-fit" onClick={handleFit}>
          Показать всё
        </button>
        <span className="ed-branches-zoom" data-testid="branches-zoom">
          {Math.round(view.scale * 100)} %
        </span>

        {/* Вилка, а не одно число (`branches.md` §8): у разных зрителей разное
            время, и единственная длительность была бы враньём. Совпали концы —
            говорим одним числом, потому что вилка «от 4:00 до 4:00» врала бы
            в другую сторону: она обещает разброс, которого нет. */}
        <span className="ed-branches-range" data-testid="branches-range">
          {range.single
            ? `Длительность ${formatDuration(range.minSeconds)}`
            : `от ${formatDuration(range.minSeconds)} до ${formatDuration(range.maxSeconds)}`}
          {range.repeatsIgnored ? ' (без повторов)' : ''}
        </span>

        <button
          type="button"
          className="ed-branches-extract"
          data-testid="branches-extract"
          disabled={!canExtract}
          onClick={handleExtract}
          title={selectionReason ?? 'Выделенные главы станут отдельной веткой'}
        >
          Вынести в ветку{selection.length > 1 ? ` (${selection.length})` : ''}
        </button>

        {/* Причина СТРОКОЙ, а не только в подсказке при наведении: проект
            измерял, что на подсказки не смотрят, и однажды это уже дало
            три зелёных e2e при пустом экране. */}
        {selectionReason !== undefined ? (
          <span className="ed-branches-why" data-testid="branches-extract-why">{selectionReason}</span>
        ) : null}
      </div>

      <div
        className="ed-branches-space"
        data-testid="branches-space"
        ref={spaceRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onAuxClick={handleAuxClick}
      >
        <div
          className="ed-branches-canvas"
          data-testid="branches-canvas"
          style={{
            width: `${layout.bounds.x + layout.bounds.width}px`,
            height: `${layout.bounds.y + layout.bounds.height}px`,
            transform: `scale(${view.scale}) translate(${-view.x}px, ${-view.y}px)`,
          }}
        >
          <svg className="ed-branches-wires" width="100%" height="100%">
            {layout.connectors.map((connector) => (
              <path
                key={`c:${connector.fromLaneId}->${connector.toLaneId}`}
                className="ed-wire"
                d={elbowPath(connector.x, connector.fromY, connector.x, connector.toY)}
              />
            ))}
            {layout.arcs.map((arc) => (
              <path
                key={`a:${arc.fromChapterId}->${arc.toChapterId}`}
                className={arc.repeat ? 'ed-wire ed-wire--repeat' : 'ed-wire'}
                d={
                  arc.repeat
                    ? repeatArcPath(arc.fromX, arc.fromY, arc.toX, arc.toY)
                    : elbowPath(arc.fromX, arc.fromY, arc.toX, arc.toY)
                }
              />
            ))}
          </svg>

          {layout.rows.map((row) => (
            <div
              key={row.laneId}
              className={row.depth > 0 ? 'ed-branch-row ed-branch-row--nested' : 'ed-branch-row'}
              data-testid={`branch-row-${row.laneId}`}
              style={{
                left: `${row.startX}px`,
                top: `${row.y}px`,
                width: `${row.tail.x + TAIL_WIDTH - row.startX}px`,
                height: `${ROW_HEIGHT}px`,
              }}
            >
              <div
                className="ed-branch-name"
                data-testid={`branch-name-${row.laneId}`}
                style={{ left: `${-NAME_WIDTH}px`, width: `${NAME_WIDTH}px` }}
              >
                {row.hasChildren ? (
                  <button
                    type="button"
                    className="ed-branch-collapse"
                    data-testid={`branch-collapse-${row.laneId}`}
                    onClick={() => toggleCollapse(row.laneId)}
                    aria-label={row.collapsed ? 'Развернуть ветку' : 'Свернуть ветку'}
                  >
                    {row.collapsed ? '▸' : '▾'}
                  </button>
                ) : null}
                {/*
                  Имя и метаданные в СВОЁМ столбце (`ed-branch-name-body`), а не
                  прямо в `ed-branch-name` рядом с кнопкой сворачивания и меткой
                  сироты, — по двум причинам разом:

                  1) `title` (задача A, Сессия 48): NAME_WIDTH = 180 обрезает
                     длинные имена (`overflow: hidden` в styles.ts), и без
                     атрибута полное имя нигде не читалось — у плиток глав
                     `title` есть с Сессии 43, а у ярлыка ветки не было. Ветка
                     переименовывается тем же двойным щелчком по плитке первой
                     главы, так что длинное имя — обычная работа автора, а не
                     редкость.

                  2) Условие входа (задача B, долг Сессии 43, `branches.md`
                     §5.1) легло БЫ строкой вправо от длительности в ОДНОЙ
                     строке с именем — но у ряда и так впритык: имя, длительность
                     и метка сироты уже делят 180 px без запаса. Ещё одна строка
                     враспор дала бы горизонтальный переполнение ПОВЕРХ первой
                     плитки ветки, а не аккуратную обрезку — контейнер
                     `ed-branch-name` не обрезает переполнение (`overflow`
                     не задан), обрезает только текст внутри `ed-branch-title`.
                     Поэтому условие — ВТОРОЙ строкой под именем, как длительность
                     нарисована под именем ветки в самом `branches.md` §5.2:
                     «Основная / 8:02» — двумя строками, а не одной.
                */}
                <div className="ed-branch-name-body">
                  <span
                    className="ed-branch-title"
                    data-testid={`branch-title-${row.laneId}`}
                    title={row.name}
                  >
                    {row.name}
                  </span>
                  <span className="ed-branch-meta">
                    <span className="ed-branch-duration">{formatDuration(row.seconds)}</span>
                    {entryConditions.get(row.laneId) != null ? (
                      <span
                        className="ed-branch-condition"
                        data-testid={`branch-condition-${row.laneId}`}
                        title={entryConditions.get(row.laneId)!}
                      >
                        {entryConditions.get(row.laneId)}
                      </span>
                    ) : null}
                  </span>
                </div>
                {orphans.has(row.laneId) ? (
                  <span
                    className="ed-branch-orphan"
                    data-testid={`branch-orphan-${row.laneId}`}
                    title="В эту ветку не ведёт ни одно правило выхода: зритель сюда не попадёт. Подключите её ответом на развилке."
                  >
                    зритель не попадёт
                  </span>
                ) : null}
              </div>

              {row.tiles.map((tile) => (
                <div
                  key={tile.id}
                  className={[
                    'ed-chapter-tile',
                    tile.id === currentId ? 'ed-chapter-tile--current' : '',
                    selection.includes(tile.id) ? 'ed-chapter-tile--picked' : '',
                  ].filter(Boolean).join(' ')}
                  data-testid={`chapter-tile-${tile.id}`}
                  style={{ left: `${tile.x - row.startX}px`, width: `${tile.width}px` }}
                >
                  {editing === tile.id ? (
                    <input
                      className="ed-chapter-rename"
                      data-testid={`chapter-rename-${tile.id}`}
                      value={draft}
                      autoFocus
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="ed-chapter-pick"
                      data-testid={`chapter-pick-${tile.id}`}
                      onClick={(event) => pickTile(row, tile, event.shiftKey)}
                      onDoubleClick={() => startRename(tile)}
                      title={`${tile.title} · ${formatDuration(tile.seconds)} · двойной щелчок — переименовать, Shift-щелчок — выделить диапазон`}
                    >
                      {tile.title}
                    </button>
                  )}
                </div>
              ))}

              <span
                className={row.tail.kind === 'goto' && row.tail.repeat ? 'ed-branch-tail ed-branch-tail--repeat' : 'ed-branch-tail'}
                data-testid={`branch-tail-${row.laneId}`}
                style={{ left: `${row.tail.x - row.startX}px` }}
              >
                {tailText(row)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

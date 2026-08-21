/**
 * Сцена в редакторе и слой взаимодействия над ней.
 *
 * React владеет ТОЛЬКО двумя пустыми контейнерами и оверлеем. Содержимое
 * сцены строит ScenePreview, то есть та же функция рендера, что у плеера
 * (инвариант №5). Своей отрисовки сцены здесь нет ни строчки.
 *
 * Два контейнера, а не один. Внешний задаёт доступную площадь и слушается
 * ResizeObserver. Внутренний отдаётся предпросмотру, и тот ставит ему свою
 * трансформацию — будь это один узел, замер площади зависел бы от
 * собственного масштаба сцены.
 *
 * Сцена не получает событий указателя вовсе: у внутреннего контейнера стоит
 * pointer-events: none. Попадание считается геометрией, а не браузером —
 * во время захвата указателя браузерное определение цели всё равно перестаёт
 * работать, и полагаться на него значило бы иметь два разных ответа на один
 * вопрос (docs/research/prior-art.md, разбор tldraw).
 *
 * **Схема v3.** Геометрия и вид элемента живут в `ElementState` на слайде,
 * а не на самом `Element`. Сцена здесь поэтому показывает не «весь сегмент
 * в момент времени» (как это будет делать плеер, когда морфинг доедет до
 * конца — ADR-015, `player/src/slides.ts`), а ровно ОДИН слайд — тот, который
 * автор сейчас правит (`currentSlide`). Ради этого предпросмотру
 * подсовывается сегмент с единственным слайдом: `ScenePreview`/`SlideEngine`
 * при этом не заводятся заново — используется тот же класс, что и у плеера
 * (инвариант №5), просто список его слайдов сужен до одного. Непрерывная
 * анимация во время воспроизведения — забота другого дня: эта сессия про
 * правку слайда, а не про предпросмотр перехода между ними.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';

import type { Element, ElementState, Slide } from '@player/core';
import { applyTheme, fitStage, ScenePreview, type Segment, type Zoom } from '@player/player';

import {
  boxToScreen,
  childBoxInGroup,
  childBoxInScene,
  intersectsRect,
  stageScale,
  toScene,
  topmostAt,
  unionBox,
  type Box,
  type Point,
} from './geometry.js';
import { Overlay, type Frame, type Grip } from './Overlay.js';
import { ZoomBar } from './ZoomBar.js';
import { activeGroupOf, reflowGroup } from '../state/groupElements.js';
import {
  canZoomIn,
  canZoomOut,
  canvasSize,
  effectiveScale,
  fitHostSize,
  STAGE_GAP_X,
  STAGE_GAP_Y,
  zoomIn as stepIn,
  zoomOut as stepOut,
} from './zoom.js';
import { snap, snapResize, type Guide } from './snapping.js';
// `resizeBox` отсюда больше не зовётся напрямую: его зовёт `snapResize`,
// и звать вторым вызовом здесь значило бы получить бокс, посчитанный
// с другим `minSize`, чем тот, по которому нарисованы направляющие.
import { angleTo, centerOf, moveBox, rotateBox } from './transform.js';

/** Округление координат: столько знаков попадёт в сохранённый проект. */
const PRECISION = 2;

/**
 * Ставит каретку внутри contenteditable-узла в точке экрана (двойной клик).
 *
 * `caretRangeFromPoint` — нестандартный, но давно поддержанный в Chromium API
 * (единственный движок в e2e-матрице проекта, playwright.config.ts); в
 * lib.dom.d.ts его нет, поэтому подпись достраивается локальным приведением
 * типа. Резерв (конец текста) — на случай, если браузер вернёт null (клик
 * пришёлся мимо текста, в пустую часть бокса): грубая позиция каретки лучше,
 * чем брошенное на двойном клике исключение.
 */
function placeCaretAt(node: HTMLElement, clientX: number, clientY: number): void {
  const withCaretApi = document as Document & {
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  const selection = window.getSelection();
  if (!selection) return; // окружения без Selection API — каретку ставить некуда, но и падать незачем
  const range = withCaretApi.caretRangeFromPoint?.(clientX, clientY);
  selection.removeAllRanges();
  if (range && node.contains(range.startContainer)) {
    selection.addRange(range);
    return;
  }
  const fallback = document.createRange();
  fallback.selectNodeContents(node);
  fallback.collapse(false);
  selection.addRange(fallback);
}

/** Императивная ручка StageView — операции, которым нужен мост наружу. */
export interface StageViewHandle {
  /**
   * Закрывает текущую правку текста на холсте, если она идёт. Вызывается из
   * Editor.tsx по намерению `commitText` (Escape в контексте `editingText`,
   * `keyboard.ts`) — единственный путь коммита, которому нужен мост наружу
   * из StageView; клик мимо и потеря фокуса узел обрабатывает сам.
   */
  commitTextEdit: () => void;
  /**
   * Масштаб холста с клавиатуры (Ctrl+=, Ctrl+−, Ctrl+0).
   *
   * Мост нужен по той же причине, что и у правки текста: клавиатура слушается
   * окном в `Editor.tsx`, а масштаб — состояние ВИДА сцены и живёт здесь.
   * Поднять его в `Editor` значило бы отдать наружу число, которое обязано
   * иметь ровно одного потребителя (`fit`), — см. шапку `stage/zoom.ts`.
   */
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
}

export interface StageViewProps {
  /** Все элементы и все слайды сегмента — нужны предпросмотру и списку кандидатов на попадание. */
  segment: Segment;
  /** Слайд, который автор сейчас правит: именно его states рисует и меняет сцена. */
  currentSlide: Slide;
  selectedIds: readonly string[];
  /**
   * `additive` — автор держал Shift: добавить к выделению, а не заменить.
   * Признак снимается с самого события мыши здесь же, а не берётся
   * из общего состояния клавиш: то разъедется с действительностью, стоит
   * окну потерять фокус с зажатым Shift.
   */
  onSelect: (id: string | undefined, additive?: boolean) => void;
  /**
   * Выделить список — итог обведения резиновой рамкой.
   *
   * Отдельно от `onSelect`, потому что «добавить» и «переключить» — разные
   * вещи: `onSelect(id, true)` ПЕРЕКЛЮЧАЕТ, и рамка, накрывшая уже
   * выделенный элемент, сняла бы с него выделение. `additive` здесь значит
   * именно добавить.
   */
  onSelectMany: (ids: readonly string[], additive: boolean) => void;
  /**
   * Правка состояния элемента жестом (перетаскивание, ручка) на ТЕКУЩЕМ
   * слайде. Вызывается МНОГОКРАТНО за один жест — каждое `pointermove` даёт
   * свой вызов, — и это намеренно живое, некоммитящее событие: коммит-точку
   * жеста ставит `onCommitHistory` на `pointerup`, а не этот колбэк (срез 2,
   * `Ctrl+Z` обязан отменять жест целиком, а не один промежуточный кадр).
   */
  onElementStateChange: (elementId: string, patch: Partial<ElementState>) => void;
  /** Правка содержимого элемента (правка текста на холсте) — самостоятельный шаг истории. */
  onElementContentChange: (element: Element) => void;
  /** Жест завершён (`pointerup`/`pointercancel`) — точка коммита истории. */
  onCommitHistory: () => void;
  /**
   * Правая кнопка по элементу сцены: кто под курсором и где нажали.
   *
   * Точка отдаётся в координатах ОКНА (`clientX`/`clientY`), а не сцены:
   * меню — узел страницы с `position: fixed`, ему нужны экранные числа.
   * Переводить их в единицы сцены и обратно значило бы смешать два
   * координатных пространства ради ничего.
   *
   * `elementId === undefined` — автор нажал по ПУСТОМУ месту холста.
   * Раньше меню там не открывалось вовсе (предложить было нечего);
   * с появлением буфера обмена элементов есть «Вставить».
   */
  onContextMenu?: (elementId: string | undefined, at: { x: number; y: number }) => void;
  /** Файл, брошенный на сцену. Что с ним делать (кодировать, вставлять) — забота Editor.tsx. */
  onImageDrop?: (file: File) => void;
  onReady?: (preview: ScenePreview | null) => void;
  /**
   * Левая и средняя группы нижней полосы окна.
   *
   * Полоса под холстом — единственное место в редакторе, где по натуре
   * стоят органы «что показываю · где я во времени · как приближено»
   * (Канва центрует транспорт под холстом, КапКут держит все три группы
   * одной строкой; совпало у двоих — закон). Правая группа, масштаб холста,
   * живёт здесь же и принадлежит StageView по существу.
   *
   * Левая и средняя ему НЕ принадлежат: переключатель вида нижней зоны
   * и транспорт — про дорожку, а не про сцену. Поэтому они приходят
   * готовыми узлами от Editor.tsx, а StageView только даёт им место.
   * Так layering остаётся честным: сцена не начинает знать про транспорт.
   */
  stripLeft?: React.ReactNode;
  stripCenter?: React.ReactNode;
}

interface Gesture {
  readonly pointerId: number;
  readonly grip: Grip | 'body';
  /** За кого взялись. Ручки изменения размера работают только с ним. */
  readonly elementId: string;
  readonly startBox: Box;
  /**
   * Стартовые боксы ВСЕХ, кого двигает этот жест, включая взятого.
   *
   * Нужны именно стартовые: считать смещение от текущего положения на каждом
   * `pointermove` значило бы накапливать ошибку округления — пачка расползлась
   * бы за одно долгое перетаскивание, и тем сильнее, чем дольше тянут.
   */
  readonly startBoxes: ReadonlyMap<string, Box>;
  /**
   * Стартовые ЛОКАЛЬНЫЕ боксы содержимого, если взялись за группу.
   *
   * Отдельным полем, а не через `startBoxes`: там лежат те, кого жест
   * ДВИГАЕТ на общую дельту, а содержимое группы при перетаскивании тела
   * не двигают вовсе — оно едет само, потому что его координаты
   * отсчитываются от группы. Слей эти два списка — и перетаскивание группы
   * сдвинуло бы детей вторым разом поверх родителя.
   *
   * Стартовые по той же причине, что и у `startBoxes`: множитель, взятый
   * от текущего размера, возводился бы в степень на каждом `pointermove`,
   * и содержимое схлопнулось бы или улетело за одно долгое движение.
   */
  readonly startChildren: ReadonlyMap<string, Box>;
  readonly startPoint: Point;
  /** Для вращения: угол, зафиксированный в момент захвата. */
  readonly grabOffset: number;
}

/**
 * Жест резиновой рамки: автор нажал на ПУСТОМ месте холста и тянет.
 *
 * Отдельно от `Gesture`, а не полем в нём: у рамки нет ни взятого элемента,
 * ни стартовых боксов, ни угла захвата, и втискивание её в ту же запись
 * заставило бы каждую ветку `handleMove` спрашивать «а это вообще элемент?».
 */
interface Marquee {
  readonly pointerId: number;
  /** Точка нажатия в координатах СЦЕНЫ: рамка живёт там же, где элементы. */
  readonly startPoint: Point;
  /** Автор держал Shift — рамка добавляет к выделению, а не заменяет его. */
  readonly additive: boolean;
}

/**
 * Ниже этого размера в ЭКРАННЫХ пикселях рамка считается щелчком, а не жестом.
 *
 * Порог экранный, а не сценический, намеренно: дрожание руки — это пиксели
 * на экране, и на масштабе 25 % те же три пикселя означают двенадцать единиц
 * сцены. Сценический порог заставил бы автора на мелком масштабе промахиваться
 * мимо «просто щёлкнуть по пустому месту».
 */
const MARQUEE_MIN_PX = 3;

/**
 * С какого расстояния в ЭКРАННЫХ пикселях элемент прилипает к направляющей.
 *
 * Пиксели экрана, а не единицы сцены, — то же требование ADR-007, что
 * и у порога рамки, но здесь цена ошибки выше. Порог, заданный в сцене,
 * на масштабе 0.198 (сцена 1920 в окне 380 px) означал бы 1.6 экранного
 * пикселя: автор просто не смог бы попасть в прилипание. На масштабе 1
 * тот же порог был бы вчетверо слабее, чем на 0.25, — то есть прилипание
 * вело бы себя по-разному в зависимости от ширины окна, и объяснить это
 * автору было бы нечем.
 */
const SNAP_PX = 8;

/** Прямоугольник между двумя точками — рамку тянут в любую из четырёх сторон. */
const areaBetween = (a: Point, b: Point): { x: number; y: number; width: number; height: number } => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

const boxOf = (state: ElementState): Box => ({
  x: state.x,
  y: state.y,
  width: state.width,
  height: state.height,
  rotation: state.rotation,
});

const round = (value: number): number => Number(value.toFixed(PRECISION));


export const StageView = forwardRef<StageViewHandle, StageViewProps>(function StageView(
  {
    segment,
    currentSlide,
    selectedIds,
    onSelect,
    onSelectMany,
    onElementStateChange,
    onElementContentChange,
    onCommitHistory,
    onContextMenu,
    onImageDrop,
    onReady,
    stripLeft,
    stripCenter,
  }: StageViewProps,
  ref,
): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  /**
   * Полотно — прослойка между окном холста и сценой, размером «сцена ×
   * масштаб». Существует ради прокрутки: сцена масштабируется трансформацией,
   * а трансформация раскладку не занимает (спецификация CSS Transforms
   * прямо это гарантирует, см. `fitStage`), поэтому прокручивать в окне было
   * бы НЕЧЕГО — узел сцены остаётся 1920×1080 при любом масштабе.
   *
   * Здесь же живут направляющие, рамка обведения и оверлей. Их координаты
   * считаются от полотна, а полотно едет вместе с содержимым при прокрутке —
   * поэтому прокрутка не требует никакой отдельной арифметики. Считай мы их
   * от окна, пришлось бы вручную прибавлять `scrollLeft`/`scrollTop`
   * в трёх местах, и забытое четвёртое разошлось бы молча.
   */
  const canvasRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  /* Подложка листа — см. .ed-scene-backdrop в styles.ts. */
  const backdropRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);
  const renderedStatesRef = useRef<Readonly<Record<string, ElementState>>>({});
  const gestureRef = useRef<Gesture | null>(null);
  /**
   * Двинулся ли указатель за текущий жест.
   *
   * Отдельной ссылкой, а не полем `Gesture`: тот readonly и пересоздавать его
   * на каждом `pointermove` значило бы мусорить объектами десятки раз
   * в секунду ровно там, где считается плавность перетаскивания.
   */
  const gestureMovedRef = useRef(false);
  const marqueeRef = useRef<Marquee | null>(null);

  const [frame, setFrame] = useState<Frame | null>(null);
  /**
   * Бледная рамка группы, пока автор внутри неё (Сессия 36). `null` — автор
   * снаружи. Отдельным состоянием, а не производной от `frame`: `frame` —
   * рамка ВЫДЕЛЕННОГО (обычно ребёнка), эта — рамка самой группы, размер
   * почти всегда другой.
   */
  const [groupFrame, setGroupFrame] = useState<Frame | null>(null);
  /** Рамка в пикселях контейнера — то, что рисуется. `null` — жеста нет. */
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  /**
   * Направляющие в пикселях контейнера. Живут только во время жеста
   * и никуда не сохраняются: в проекте их нет как понятия.
   */
  const [guides, setGuides] = useState<
    readonly { left: number; top: number; width: number; height: number }[]
  >([]);

  const elements = segment.elements;

  /**
   * Группа, внутри которой сейчас автор, — ВЫВЕДЕНА из выделения
   * (`activeGroupOf`, Сессия 36), а не отдельное состояние: см. её шапку
   * в `groupElements.ts` за разбором, почему хранить отдельно было бы хуже.
   *
   * `activeGroupState` — состояние этой группы на ТЕКУЩЕМ слайде. Если его
   * нет, приводить содержимое не к чему, и ниже это везде трактуется как
   * «автор снаружи» — приводить не к чему в буквальном смысле.
   */
  const activeGroupId = activeGroupOf(elements, selectedIds);
  const activeGroupState = activeGroupId !== undefined ? currentSlide.states[activeGroupId] : undefined;

  /**
   * Состояние ЛЮБОГО элемента → бокс СЦЕНЫ. У ребёнка группы координаты
   * в состоянии ЛОКАЛЬНЫЕ (§14 журнала Сессии 35), и наивная подстановка
   * `currentSlide.states[id]` в геометрию напрямую дала бы бокс у начала
   * координат сцены — тот же призрак, что был в списке попаданий, только
   * в другом месте. Родитель берётся из `elements`, а не из `activeGroupId`:
   * помощник обязан работать для ЛЮБОГО ребёнка, а не только пока автор
   * «официально внутри» его группы.
   *
   * Один помощник на ВСЕХ читателей геометрии выделенного: рамку
   * (`syncFrame`), захват жеста (`beginGesture`, `handleGripDown`). Второе
   * описание того же перевода разошлось бы с ним молча.
   */
  const sceneBoxOf = useCallback(
    (id: string): Box | undefined => {
      const state = currentSlide.states[id];
      if (!state) return undefined;
      const owner = elements.find((candidate) => candidate.id === id);
      if (owner?.parentId !== undefined) {
        const groupState = currentSlide.states[owner.parentId];
        if (groupState) return childBoxInScene(boxOf(groupState), boxOf(state));
      }
      return boxOf(state);
    },
    [elements, currentSlide],
  );

  /**
   * Обратная пара `sceneBoxOf`: бокс СЦЕНЫ, посчитанный жестом, → то, что
   * обязано попасть в `ElementState`. У ребёнка группы это ЛОКАЛЬНЫЕ
   * координаты (`childBoxInGroup`), у всех остальных — тот же бокс без
   * изменений.
   *
   * Вся арифметика жеста (`moveBox`, `resizeBox`, `rotateBox`, прилипание)
   * всегда считает в координатах сцены — план С36 §3а: перевести не дельту,
   * а состояние целиком, и получить перевод дельты СЛЕДСТВИЕМ формулы,
   * а не второй, независимо написанной. Без этого помощника запись жеста
   * клала бы сценное число прямо в локальное поле — дефект, из-за которого
   * заведена эта сессия: перетаскивание ребёнка внутри группы на N экранных
   * пикселей давало переезд, кратно больший N, потому что запись добавляла
   * жестовую дельту к координате, УЖЕ включающей смещение группы.
   */
  const localBoxFor = useCallback(
    (id: string, box: Box): Box => {
      const owner = elements.find((candidate) => candidate.id === id);
      if (owner?.parentId !== undefined) {
        const groupState = currentSlide.states[owner.parentId];
        if (groupState) return childBoxInGroup(boxOf(groupState), box);
      }
      return box;
    },
    [elements, currentSlide],
  );

  /** Требует контейнеры: их отсутствие означает сломанную разметку, а не штатный случай. */
  const requireNodes = useCallback((): {
    host: HTMLDivElement;
    canvas: HTMLDivElement;
    stage: HTMLDivElement;
  } => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!host || !canvas || !stage) throw new Error('StageView: контейнеры сцены не смонтированы');
    return { host, canvas, stage };
  }, []);

  /**
   * Масштаб холста: вписывание или число, выбранное автором (Сессия 32).
   *
   * Держится в состоянии ради перерисовки панели масштаба и ДУБЛИРУЕТСЯ
   * в ref: `fit` зовут из ResizeObserver, созданного один раз при сборке
   * сцены, и замкнись он на значение состояния — растянутое окно возвращало
   * бы масштаб к тому, что был на момент сборки. Молча.
   */
  const [zoom, setZoom] = useState<Zoom>('fit');
  const zoomRef = useRef<Zoom>(zoom);
  zoomRef.current = zoom;
  /** Фактический масштаб — только чтобы показать его числом на панели. */
  const [shownScale, setShownScale] = useState(1);

  const fit = useCallback((): void => {
    const { host, canvas } = requireNodes();
    const preview = previewRef.current;
    if (!preview) return;
    // Размер берётся у контейнера заново каждый раз. Сохранённому масштабу
    // доверять нельзя — прямое требование ADR-007.
    // Окно, меньшее зазора, рисовать нечем — и это не ошибка, а промежуточное
    // состояние раскладки (панель тянут, окно схлопывают). Раньше здесь стояла
    // проверка на положительность; зазор поднял порог, но не смысл.
    if (!(host.clientWidth > 2 * STAGE_GAP_X && host.clientHeight > 2 * STAGE_GAP_Y)) return;

    // Вписывание считает ПЛЕЕР. Своя формула летербокса здесь была бы второй
    // реализацией вписывания (инвариант №5) и разошлась бы молча: на масштабе
    // 1 обе дают одно и то же.
    //
    // Зазор вокруг сцены (Сессия 36) сделан НЕ правкой этой формулы, а тем,
    // что ей отдаётся уменьшенное окно. Зритель видит сцену во весь экран,
    // поля нужны только автору — значит плеер не трогается вовсе.
    const fitHost = fitHostSize(host.clientWidth, host.clientHeight);
    const fitScale = fitStage(fitHost.width, fitHost.height, segment.stage).scale;
    const scale = effectiveScale(zoomRef.current, fitScale);
    const size = canvasSize(segment.stage, scale, host.clientWidth, host.clientHeight);
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    // Плееру отдаётся размер ПОЛОТНА, а не окна: тогда сцена центрируется
    // внутри полотна той же округляющей формулой, а при увеличении отступы
    // выходят нулевыми и сцена занимает полотно целиком.
    preview.fit(size.width, size.height, scale);

    /*
      ПОДЛОЖКА ЛИСТА повторяет геометрию сцены, а НЕ вычисляет её заново.
      Летербокс считает плеер (инвариант №5) и он же расставляет узел сцены;
      вторая формула здесь разошлась бы с первой молча — на масштабе 1 обе
      дают одно и то же, а расходятся только при вписывании.

      Поэтому источник размера один — сам узел сцены, уже расставленный
      плеером строкой выше. Читаем его коробку, а не повторяем расчёт.

      Почему подложка НЕ на узле сцены: фон сцены принадлежит проекту,
      а не хрому. Отдельный узел-сосед оставляет теме автора право
      закрасить лист поверх, ничего у неё не отбирая.
    */
    const backdrop = backdropRef.current;
    if (backdrop) {
      const sceneBox = stageRef.current?.getBoundingClientRect();
      const canvasBox = canvas.getBoundingClientRect();
      if (sceneBox) {
        backdrop.style.left = `${sceneBox.left - canvasBox.left}px`;
        backdrop.style.top = `${sceneBox.top - canvasBox.top}px`;
        backdrop.style.width = `${sceneBox.width}px`;
        backdrop.style.height = `${sceneBox.height}px`;
      }
    }

    setShownScale(scale);
  }, [requireNodes, segment.stage]);

  /** Пересчитывает рамку выделения в пикселях контейнера. */
  /**
   * Направляющие из координат сцены в пиксели ПОЛОТНА.
   *
   * Толщина задаётся в пикселях полотна, а не сцены: линия обязана
   * остаться волосяной на любом масштабе. Заданная в сцене, она на мелком
   * масштабе исчезла бы, а на крупном превратилась бы в полосу.
   *
   * Начало координат — полотно, а не окно холста: полотно прокручивается
   * вместе с содержимым, поэтому поправка на прокрутку не нужна вовсе
   * (см. комментарий у `canvasRef`).
   */
  const guidesToHost = useCallback(
    (list: readonly Guide[]): readonly { left: number; top: number; width: number; height: number }[] => {
      const { canvas, stage } = requireNodes();
      const stageRect = stage.getBoundingClientRect();
      const hostRect = canvas.getBoundingClientRect();
      const scale = stageScale(stageRect, segment.stage.width);
      const offsetX = stageRect.left - hostRect.left;
      const offsetY = stageRect.top - hostRect.top;
      return list.map((guide) =>
        guide.axis === 'x'
          ? {
              left: offsetX + guide.at * scale,
              top: offsetY + guide.from * scale,
              width: 1,
              height: (guide.to - guide.from) * scale,
            }
          : {
              left: offsetX + guide.from * scale,
              top: offsetY + guide.at * scale,
              width: (guide.to - guide.from) * scale,
              height: 1,
            },
      );
    },
    [requireNodes, segment.stage.width],
  );

  const syncFrame = useCallback((): void => {
    const { canvas, stage } = requireNodes();
    const stageRect = stage.getBoundingClientRect();
    const hostRect = canvas.getBoundingClientRect();

    // Бокс СЦЕНЫ выделенного — общий помощник `sceneBoxOf` (объявлен выше,
    // в области компонента): рамка обязана быть верной для ЛЮБОГО
    // выделенного ребёнка, а не только пока автор «официально внутри» его
    // группы (`activeGroupOf` требует, чтобы ВСЕ выделенные были детьми
    // одной группы, — здесь такое допущение делать не для чего).

    // Рамка строится по тем выделенным, кто ЕСТЬ на этом слайде: элемент
    // может быть выделен и при этом не появляться в текущем кадре.
    const boxes = selectedIds
      .map((id) => sceneBoxOf(id))
      .filter((box): box is Box => box !== undefined);
    const selectedState = boxes.length === 1 ? boxes[0]! : unionBox(boxes);
    if (!selectedState) {
      setFrame(null);
    } else {
      // Прямоугольник берётся у ВНУТРЕННЕГО узла: у внешнего при летербоксе
      // ширина другая, и масштаб вышел бы завышенным — тихо и правдоподобно.
      const screen = boxToScreen(stageRect, segment.stage.width, selectedState);
      setFrame({
        left: screen.left - hostRect.left,
        top: screen.top - hostRect.top,
        width: screen.width,
        height: screen.height,
        rotation: selectedState.rotation,
        // Тем же замером, что и сама рамка: Overlay выбирает по этому числу,
        // помещается ли ручка поворота под рамкой (см. rotateSide).
        canvasHeight: hostRect.height,
      });
    }

    // Бледная рамка группы, пока автор внутри неё. ТЕМ ЖЕ замером
    // (stageRect/hostRect выше), что и основная рамка: второй
    // getBoundingClientRect здесь развёл бы два числа, которые обязаны
    // совпасть в одном кадре.
    if (activeGroupState) {
      const screen = boxToScreen(stageRect, segment.stage.width, boxOf(activeGroupState));
      setGroupFrame({
        left: screen.left - hostRect.left,
        top: screen.top - hostRect.top,
        width: screen.width,
        height: screen.height,
        rotation: activeGroupState.rotation,
        canvasHeight: hostRect.height,
      });
    } else {
      setGroupFrame(null);
    }
  }, [requireNodes, selectedIds, currentSlide, segment.stage.width, sceneBoxOf, activeGroupState]);

  /**
   * Сегмент из ОДНОГО слайда — то, что реально показывает и правит сцена.
   * `elements`/`words`/`stage` берутся у настоящего сегмента без изменений:
   * `SlideEngine` использует их лишь для построения узлов и разрешения
   * TimeRef, а с единственным слайдом в списке `resolveTimeRef` может дать
   * любое число — активным всегда останется он один (см. `SlideEngine`,
   * `player/src/slides.ts`).
   */
  const stageSegment = useMemo<Segment>(
    () => ({ ...segment, slides: [currentSlide] }),
    [segment, currentSlide],
  );
  const stageSegmentRef = useRef(stageSegment);
  stageSegmentRef.current = stageSegment;

  // Сцена пересобирается только при СТРУКТУРНОЙ правке: изменился размер
  // сцены, состав элементов сегмента, сам слайд или НАБОР элементов,
  // имеющих состояние на этом слайде. Точечные правки внутри одного слайда
  // (перетаскивание, набор числа) меняют ЗНАЧЕНИЯ состояний, а не их набор,
  // идут через второй эффект ниже и полной пересборки не вызывают — иначе
  // узел под курсором редактора уничтожался бы на каждый pointermove.
  //
  // Набор ключей попал сюда в Сессии 17 вместе с §12.4. Раньше состояние
  // не могло исчезнуть внутри одного слайда, и второй эффект честно
  // обновлял только те элементы, у которых состояние ЕСТЬ. С появлением
  // действия «убрать со слайда» такое стало возможным, и узел оставался
  // на сцене: данные уже не содержали элемент, а автор его видел. Полная
  // пересборка на смену состава — то самое «дешевле и надёжнее, чем
  // построчно сверять», что здесь и было написано про смену слайда.
  const stateKeys = Object.keys(currentSlide.states).sort().join(',');
  const structureKey = useMemo(
    () => `${segment.stage.width}x${segment.stage.height}|${JSON.stringify(elements.map((e) => e.id))}|${currentSlide.id}|${stateKeys}`,
    [segment.stage.width, segment.stage.height, elements, currentSlide.id, stateKeys],
  );

  useLayoutEffect(() => {
    const { host, stage } = requireNodes();
    const built = stageSegmentRef.current;

    const preview = new ScenePreview(stage, built);
    previewRef.current = preview;
    renderedStatesRef.current = built.slides[0]!.states;
    // Инвариант №3 действует и в редакторе, только по другой причине:
    // здесь сцена не должна перехватывать жесты у слоя взаимодействия.
    stage.style.pointerEvents = 'none';

    // Через `fit`, а не прямым вызовом `preview.fit`: масштаб холста задаёт
    // ещё и размер полотна, и второй путь вписывания разошёлся бы с первым
    // на первом же кадре после пересборки сцены.
    fit();

    const observer = new ResizeObserver(() => {
      fit();
      syncFrame();
    });
    observer.observe(host);
    onReady?.(preview);

    return () => {
      observer.disconnect();
      onReady?.(null);
      // Правка текста на холсте не переживает структурную пересборку: узел,
      // на котором стоит каретка, вот-вот будет уничтожен вместе со всей
      // сценой. В штатной работе editingRef здесь уже пуст — Escape, клик
      // мимо и потеря фокуса (commitTextEdit) успевают закрыть правку РАНЬШЕ,
      // чем структурная правка вообще дойдёт до диспатча: клик по кнопке
      // «Удалить»/«Вставить»/«Отменить» сперва ловится слушателем на
      // document в фазе ЗАХВАТА (commitTextEdit внутри beginTextEdit/
      // handleStageDown), и только потом — обработчиком самой кнопки в фазе
      // всплытия. Строка ниже — второй рубеж на случай, если что-то всё же
      // обошло эти пути: набранное отбрасывается, а не сохраняется, потому
      // что достать отсюда актуальный (не устаревший) элемент, не рискуя
      // записать правку не в тот проект, нечем.
      if (editingRef.current) {
        document.removeEventListener('pointerdown', editingRef.current.outsideDown, true);
        editingRef.current = null;
      }
      previewRef.current = null;
      preview.destroy();
    };
    // fit и syncFrame намеренно не в зависимостях: они меняются вместе
    // с выделением, а пересобирать сцену на смену выделения незачем.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey, requireNodes, onReady]);

  // Точечное обновление изменившихся элементов текущего слайда.
  //
  // Сюда попадают правки, не меняющие структуру: подвинули, растянули,
  // повернули, поменяли цвет. Состав элементов и сам слайд при этом те же,
  // поэтому applyElement по изменившимся узлам достаточно, а пересборка
  // была бы разрушительна. Смена структуры (в том числе переключение
  // слайда) обрабатывается эффектом выше и досюда не доходит: тот
  // пересоздаёт предпросмотр и сам записывает renderedStatesRef.
  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const previous = renderedStatesRef.current;
    const states = currentSlide.states;
    if (previous === states) return;

    for (const element of elements) {
      const state = states[element.id];
      // Пока каретка внутри узла, applyElement его не касается: он
      // безусловно перезаписывает textContent (player/src/render.ts) и убил
      // бы правку, даже не пересоздавая узел («Правка текста на холсте»,
      // препятствие №3). Источник истины остаётся element.content — DOM
      // расходится с ним ровно на время жеста, как и при перетаскивании.
      if (state && state !== previous[element.id] && editingRef.current?.id !== element.id) {
        // «Вернуть как в стиле» (ADR-029, styleLink.ts) СНИМАЕТ ключ из
        // state.style. `applyElement` (player/src/render.ts) только
        // ЗАПИСЫВАЕТ ключи, которые есть в style, — ключ, пропавший между
        // прошлым и новым состоянием, иначе остался бы висеть на узле
        // инлайном и продолжал бы перебивать правило класса вечно (S14:
        // инлайн сильнее правила ПОКОМПОНЕНТНО). Единственный способ снять
        // инлайн-свойство, которого applyElement не пишет, — очистить
        // атрибут style перед повторным применением: applyElement тут же
        // отстраивает его заново из состояния целиком, поэтому потери нет.
        preview.updateElement(element, state);
      }
    }
    renderedStatesRef.current = states;
  }, [elements, currentSlide.states]);

  // Живой отклик темы на холсте (docs/design/theme-panel.md §5 — ГЛАВНАЯ
  // ловушка задачи). Смена роли темы НЕ входит в structureKey намеренно
  // (см. комментарий над ним): полная пересборка сцены на каждое движение
  // пипетки цвета уничтожала бы узел под курсором редактора, тем же
  // способом, каким это уже запрещено для pointermove. Поэтому applyTheme
  // зовётся здесь отдельно, на том же узле stage, которым владеет
  // ScenePreview — повторное применение безопасно: это одна запись
  // переменной на предке (измерено S11), а не проход по потомкам, и она
  // не трогает их собственный инлайн-стиль.
  useLayoutEffect(() => {
    const { stage } = requireNodes();
    applyTheme(stage, segment.theme);
  }, [segment.theme, requireNodes]);

  useLayoutEffect(syncFrame, [syncFrame]);

  /** Точка указателя в координатах сцены. Прямоугольник измеряется заново. */
  const scenePointOf = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const { stage } = requireNodes();
      return toScene(stage.getBoundingClientRect(), segment.stage.width, event.clientX, event.clientY);
    },
    [requireNodes, segment.stage.width],
  );

  /**
   * Виден ли элемент на текущем слайде — по тому, что реально нарисовано.
   *
   * Спрашивать `opacity` было НЕДОСТАТОЧНО, и это стоило трёх красных e2e.
   * Скрытый элемент по ADR-015 выражается видимостью, а не нулевой
   * прозрачностью: миграция переводит кью «opacity 0 → 1» в
   * `{ visible: false, opacity: 1 }`, а рендер печатает это как
   * `visibility: hidden` при `opacity: 1`. То есть у скрытого элемента
   * прозрачность единица, и проверка по ней объявляла его видимым —
   * клик по видимой карточке выделял лежащую поверх невидимую точку.
   *
   * `checkVisibility` без флагов смотрит только на `display`
   * и `content-visibility` — то есть был бы зелёным на сломанном коде
   * и красным на верном. Флаги обязательны.
   *
   * Порог по прозрачности остаётся сверх этого: `checkVisibility` считает
   * невидимым только строгий ноль, а на границе перехода значение бывает
   * вроде 0.002, и такой элемент кликать всё равно не по чему.
   */
  const isVisible = useCallback((id: string): boolean => {
    const node = previewRef.current?.nodes.get(id);
    if (!node) return false;
    if (!node.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    return Number(getComputedStyle(node).opacity) > 0.01;
  }, []);

  /**
   * Верхний по стопке элемент под точкой — то, что видно СЕЙЧАС.
   *
   * Элемент, который на этом слайде ещё не появился, геометрически на сцене
   * есть (states хранит для него ту же запись, что и для видимых) и может
   * лежать выше по zIndex — и тогда клик по видимой карточке выделял бы
   * невидимую точку поверх неё. Прозрачность берётся у отрисованного узла:
   * это ответ самого рендера на вопрос «что сейчас на экране», а не вторая
   * реализация той же логики.
   */
  /**
   * Кандидаты на попадание указателя. У ЧЕТЫРЁХ вызывающих (попадание,
   * прилипание при перетаскивании, прилипание при ресайзе, обведение рамкой)
   * список один и тот же намеренно: отдельное правило для любого из них было
   * бы вторым описанием одного факта, а такие расходятся молча.
   *
   * Снаружи группы (`activeGroupId === undefined`, или у группы нет состояния
   * на этом слайде — приводить не к чему) поведение прежнее: кандидаты —
   * элементы верхнего уровня, группа неделима для указателя, её бокс — охват
   * содержимого.
   *
   * Внутри группы G (автор вошёл двойным щелчком, Сессия 36) кандидаты — дети
   * G, ПРИВЕДЁННЫЕ К СЦЕНЕ через `childBoxInScene`, плюс элементы верхнего
   * уровня, кроме самой G. Приведение обязательно, а не просто снятый фильтр:
   * боксы, взятые из состояний напрямую, — ЛОКАЛЬНЫЕ координаты ребёнка,
   * и без пересчёта содержимое стало бы призраком у начала координат сцены —
   * тем самым дефектом, из-за которого содержимое групп раньше отсеивалось
   * целиком (§14 журнала Сессии 35, разбор — там же).
   */
  const visibleLayers = useCallback(
    (): readonly (Box & { zIndex: number; id: string })[] => {
      const groupBox = activeGroupState ? boxOf(activeGroupState) : undefined;
      const layers: (Box & { zIndex: number; id: string })[] = [];

      for (const element of elements) {
        if (!isVisible(element.id)) continue;
        const state = currentSlide.states[element.id];
        if (!state) continue; // isVisible гарантирует отрисованный узел ⇒ обычно есть, но защититься дёшево

        if (groupBox !== undefined) {
          if (element.id === activeGroupId) continue; // сама группа недоступна, пока автор внутри
          if (element.parentId === activeGroupId) {
            const scene = childBoxInScene(groupBox, boxOf(state));
            layers.push({ ...scene, zIndex: state.zIndex, id: element.id });
            continue;
          }
          if (element.parentId !== undefined) continue; // содержимое ЧУЖОЙ группы недоступно
          layers.push({ ...boxOf(state), zIndex: state.zIndex, id: element.id });
          continue;
        }

        if (element.parentId !== undefined) continue; // снаружи — содержимое любой группы недоступно
        layers.push({ ...boxOf(state), zIndex: state.zIndex, id: element.id });
      }

      return layers;
    },
    [elements, currentSlide, isVisible, activeGroupId, activeGroupState],
  );

  /**
   * Верхний по стопке под точкой. Снаружи группы содержимое сюда не
   * приходит — `visibleLayers` его отсеивает, и попасть указателем можно
   * только в элемент верхнего уровня. Внутри группы попасть можно и в её
   * детей, приведённых к сцене (см. `visibleLayers` выше).
   */
  const hitElementAt = useCallback(
    (point: Point): { id: string; box: Box } | undefined => {
      const hit = topmostAt(visibleLayers(), point);
      return hit
        ? { id: hit.id, box: { x: hit.x, y: hit.y, width: hit.width, height: hit.height, rotation: hit.rotation } }
        : undefined;
    },
    [visibleLayers],
  );

  const beginGesture = useCallback(
    (
      grip: Grip | 'body',
      elementId: string,
      box: Box,
      event: ReactPointerEvent<HTMLElement>,
      /** Кого ещё тянуть вместе со взятым. Для ручек — никого. */
      alsoMove: readonly string[] = [],
    ): void => {
      const { host } = requireNodes();
      const point = scenePointOf(event);
      const startBoxes = new Map<string, Box>([[elementId, box]]);
      for (const id of alsoMove) {
        if (id === elementId) continue;
        // `sceneBoxOf`, а не `boxOf(currentSlide.states[id])` напрямую: среди
        // `alsoMove` может быть ребёнок группы (несколько выделенных детей
        // одной активной группы), а его координаты в состоянии ЛОКАЛЬНЫЕ.
        // `undefined` — выделенный, которого нет на этом слайде: двигать
        // нечего, это не ошибка, элемент просто не появляется в этом кадре.
        const sceneBox = sceneBoxOf(id);
        if (sceneBox) startBoxes.set(id, sceneBox);
      }

      // Содержимое группы снимается ВСЕГДА, а не только под ручку: узнать
      // здесь дешевле, чем на каждом кадре движения, а пустая карта
      // у обычного элемента ничего не стоит.
      const startChildren = new Map<string, Box>();
      for (const element of elements) {
        if (element.parentId !== elementId) continue;
        const state = currentSlide.states[element.id];
        if (state) startChildren.set(element.id, boxOf(state));
      }

      gestureMovedRef.current = false;
      gestureRef.current = {
        pointerId: event.pointerId,
        grip,
        elementId,
        startBox: box,
        startBoxes,
        startChildren,
        startPoint: point,
        // Разница между текущим поворотом и углом захвата. Без неё элемент
        // прыгнул бы в момент, когда его схватили за ручку вращения.
        //
        // Считается ТОЛЬКО для поворота, и это не оптимизация. angleTo намеренно
        // бросает, когда точка совпадает с центром: направления от центра к нему
        // самому не существует. Для перетаскивания и ресайза угол не нужен вовсе
        // (handleMove читает grabOffset лишь в ветке 'rotate'), а схватить элемент
        // ровно за середину — обычное дело, а не ошибка. Ручка вращения лежит вне
        // бокса, поэтому там нулевой вектор недостижим и проверка остаётся живой.
        grabOffset: grip === 'rotate' ? angleTo(centerOf(box), point) - box.rotation : 0,
      };
      host.setPointerCapture(event.pointerId);
    },
    // `elements` и `currentSlide` в списке обязательны: без них замыкание
    // держит состав сцены с первого отрисованного кадра. Сразу после Ctrl+G
    // список элементов только что изменился, и устаревшее замыкание не нашло
    // бы у новой группы ни одного ребёнка — ручка масштабировала бы пустую
    // рамку, молча.
    [requireNodes, scenePointOf, elements, currentSlide, sceneBoxOf],
  );

  /**
   * Правка текста на холсте (двойной клик).
   *
   * Состояние — id редактируемого элемента и слушатель «клик мимо» —
   * намеренно НЕ в React state: всё вокруг императивно по природе
   * (contenteditable, Selection, фокус), и укладывать это в цикл рендера
   * незачем — видеть его обязаны только функции этого раздела.
   *
   * Закрывается любым из независимых путей, и все сходятся в commitTextEdit —
   * идемпотентной функции, безопасной для повторного вызова:
   *  - Escape — приходит из Editor.tsx через ref (см. useImperativeHandle
   *    ниже) по намерению `commitText` by keyboard.ts;
   *  - клик мимо — слушатель на document в фазе ЗАХВАТА гарантированно
   *    исполняется раньше обработчика клика по любой кнопке панели
   *    («Удалить», «Вставить», «Отменить») — тот привязан в фазе всплытия;
   *  - потеря фокуса (blur) узла — подстраховка на случай, которого не
   *    покрывает предыдущий пункт (например, Tab увёл фокус без единого
   *    pointerdown).
   */
  const editingRef = useRef<{ id: string; outsideDown: (event: PointerEvent) => void } | null>(null);

  const commitTextEdit = useCallback((): void => {
    const editing = editingRef.current;
    if (!editing) return;
    // Снимаем раньше, чем трогаем DOM: node.blur() ниже сам может заново
    // вызвать этот же обработчик через слушатель blur узла, и обнулённый
    // editingRef делает повторный вход безопасным no-op, а не рекурсией.
    editingRef.current = null;
    document.removeEventListener('pointerdown', editing.outsideDown, true);

    const node = previewRef.current?.nodes.get(editing.id);
    if (!node) return; // сцена уже пересобрана мимо нас (см. эффект сборки) — сохранять уже некуда

    const content = node.textContent ?? '';
    node.contentEditable = 'false';
    // Возвращается ровно так же, как снималось: точечно, на одном узле.
    node.style.pointerEvents = '';
    node.blur();

    const element = elements.find((candidate) => candidate.id === editing.id);
    // Элемент мог исчезнуть структурной правкой ДРУГОГО элемента, пришедшей
    // сюда мимо обеих подстраховок выше, — тогда сохранять некуда, и это не
    // ошибка: автор уже принял более позднее решение.
    if (!element || element.content === content) return;

    onElementContentChange({ ...element, content });
    onCommitHistory();
  }, [elements, onElementContentChange, onCommitHistory]);

  const beginTextEdit = useCallback(
    (element: Element, point: { clientX: number; clientY: number }): void => {
      if (element.type !== 'text') return; // на месте правится только текст

      if (editingRef.current?.id === element.id) {
        // Уже редактируем этот же элемент: повторный двойной клик внутри
        // текста только переносит каретку — продолжение того же жеста
        // правки, а не новый шаг истории.
        const node = previewRef.current?.nodes.get(element.id);
        if (node) placeCaretAt(node, point.clientX, point.clientY);
        return;
      }

      commitTextEdit(); // правился ДРУГОЙ элемент — закрыть его правку одним шагом

      const node = previewRef.current?.nodes.get(element.id);
      if (!node) throw new Error(`Элемента «${element.id}» нет на сцене: править нечего`);

      node.contentEditable = 'true';
      // Снимается ТОЛЬКО с этого узла и ровно на время правки (препятствие
      // №1 спеки). Инвариант №3 не задет: у контейнера сцены (stageRef)
      // pointerEvents остаётся 'none', остальная сцена по-прежнему решает
      // попадание геометрией, а не браузером.
      node.style.pointerEvents = 'auto';

      const outsideDown = (down: PointerEvent): void => {
        const target = down.target;
        if (target instanceof Node && node.contains(target)) return; // клик внутри — не «мимо»
        commitTextEdit();
      };
      document.addEventListener('pointerdown', outsideDown, true);
      node.addEventListener('blur', commitTextEdit, { once: true });
      editingRef.current = { id: element.id, outsideDown };

      node.focus();
      placeCaretAt(node, point.clientX, point.clientY);
    },
    [commitTextEdit],
  );

  /**
   * Ступень считается от ФАКТИЧЕСКОГО масштаба, а не от начала лестницы:
   * при вписывании 38 % «+» обязан дать 50 %, а не 10 % (иначе кнопка
   * «приблизить» отдаляла бы). Число берётся из `shownScale` — того же,
   * что показано автору, — а не замером DOM: замер в обработчике кнопки
   * и замер в `fit` разошлись бы на кадре пересчёта раскладки.
   */
  const shownScaleRef = useRef(shownScale);
  shownScaleRef.current = shownScale;

  const handleZoomIn = useCallback((): void => {
    setZoom((current) => stepIn(current, shownScaleRef.current));
  }, []);
  const handleZoomOut = useCallback((): void => {
    setZoom((current) => stepOut(current, shownScaleRef.current));
  }, []);
  const handleZoomFit = useCallback((): void => setZoom('fit'), []);

  /**
   * Смена масштаба пересчитывает полотно и рамку выделения.
   *
   * Отдельным эффектом, а не внутри обработчиков: масштаб меняют три разных
   * пути (кнопки, список, клавиатура через ручку), и все три обязаны
   * приводить к одному и тому же. Довесок в одном из обработчиков разошёлся
   * бы с остальными молча.
   */
  useLayoutEffect(() => {
    fit();
    syncFrame();
    // Зависимость ровно одна — сам масштаб. `fit` и `syncFrame` меняют
    // тождество вместе с выделением, и попади они сюда, эффект гонялся бы
    // на каждый клик по элементу без единой причины.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  useImperativeHandle(
    ref,
    () => ({
      commitTextEdit,
      zoomIn: handleZoomIn,
      zoomOut: handleZoomOut,
      zoomFit: handleZoomFit,
    }),
    [commitTextEdit, handleZoomIn, handleZoomOut, handleZoomFit],
  );

  const handleStageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      const point = scenePointOf(event);
      const hit = hitElementAt(point);
      if (!hit) return;
      const element = elements.find((candidate) => candidate.id === hit.id);
      if (!element) throw new Error(`Двойной клик в элемент «${hit.id}», которого нет в сцене`);

      if (element.type === 'group') {
        /**
         * Войти внутрь (Сессия 36, решение владельца): среди детей ЭТОЙ
         * группы, приведённых к сцене, найти верхнего под точкой и выделить
         * его. Под точкой никого (щелчок в просвет между детьми) —
         * выделение остаётся как было, автор просто промахнулся.
         *
         * Считается заново, а не через `visibleLayers`: та отдаёт детей лишь
         * группы, в которой автор уже «официально внутри» (`activeGroupId`),
         * а щелчок, которым он туда попадает, происходит ДО того, как это
         * состояние возникнет.
         */
        const groupState = currentSlide.states[element.id];
        if (!groupState) return; // группы нет на этом слайде — заходить некуда
        const groupBox = boxOf(groupState);
        const children = elements
          .filter((candidate) => candidate.parentId === element.id)
          .filter((candidate) => isVisible(candidate.id))
          .map((candidate) => {
            const state = currentSlide.states[candidate.id]!; // isVisible гарантирует состояние
            const scene = childBoxInScene(groupBox, boxOf(state));
            return { ...scene, zIndex: state.zIndex, id: candidate.id };
          });
        const childHit = topmostAt(children, point);
        if (childHit) onSelect(childHit.id);
        return;
      }

      beginTextEdit(element, event);
    },
    [scenePointOf, hitElementAt, elements, beginTextEdit, currentSlide, isVisible, onSelect],
  );

  const handleStageDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      /**
       * Жесты сцены — только основная кнопка.
       *
       * `pointerdown` приходит и от правой, и от средней кнопки, а `button`
       * здесь не проверялся вовсе. Пока меню браузера открывалось само, оно
       * жест обрывало, и дефект не проявлялся. С появлением своего меню
       * (мы гасим браузерное) жест доживает до движения мыши: ЗАМЕРЕНО —
       * нажатие правой и протяжка увезли элемент с x=160 на x=1120, почти
       * через всю сцену. Автор, промахнувшийся мимо пункта меню, зашвырнул
       * бы объект и не понял бы, отчего тот сдвинулся.
       *
       * Выделение по правой кнопке от этого не теряется: его переносит
       * `onContextMenu` (см. `handleContextMenu` ниже и `Editor.tsx`), и это
       * теперь ЕДИНСТВЕННЫЙ путь — то есть проверяемый тестом, а не
       * случайно работающий побочно.
       */
      if (event.button !== 0) return;

      const editing = editingRef.current;
      if (editing) {
        const editingNode = previewRef.current?.nodes.get(editing.id);
        if (editingNode && event.target instanceof Node && editingNode.contains(event.target)) {
          // Клик внутри редактируемого текста — браузер сам ставит каретку
          // или тянет выделение (node.style.pointerEvents = 'auto' на время
          // правки, см. beginTextEdit). Перехватывать жестом StageView
          // нельзя: setPointerCapture в beginGesture сломал бы нативное
          // выделение текста.
          return;
        }
      }
      const point = scenePointOf(event);
      const hit = hitElementAt(point);
      if (!hit) {
        /**
         * Нажатие на пустом месте начинает резиновую рамку.
         *
         * Выделение снимается ЗДЕСЬ, а не на отпускании, и это сознательно
         * сохраняет прежнее поведение простого щелчка мимо всего: он и был
         * снятием выделения на `pointerdown`. Рамка нулевого размера — тот же
         * щелчок, и на отпускании она ничего не добавит.
         *
         * С зажатым Shift не снимаем: обведение с Shift обязано ДОБАВЛЯТЬ,
         * а не начинать с пустого места.
         */
        if (!event.shiftKey) onSelect(undefined);
        const { host } = requireNodes();
        marqueeRef.current = {
          pointerId: event.pointerId,
          startPoint: point,
          additive: event.shiftKey,
        };
        setMarquee(null);
        host.setPointerCapture(event.pointerId);
        return;
      }

      const additive = event.shiftKey;
      const alreadySelected = selectedIds.includes(hit.id);

      /**
       * Клик по УЖЕ выделенному внутри пачки её не схлопывает.
       *
       * Без этого множественное выделение было бы бесполезно: автор выделил
       * три элемента, взялся за один, чтобы подвинуть все, — и в момент
       * нажатия остались бы двое невыделенных, то есть поехал бы один.
       * Так же ведёт себя Canva.
       */
      if (additive) {
        onSelect(hit.id, true);
        // Shift-клик — жест выделения, а не перетаскивания: начинать
        // перетаскивание тем же нажатием значило бы двигать пачку каждый раз,
        // когда автор просто добавляет к ней элемент.
        return;
      }
      if (!alreadySelected) onSelect(hit.id);

      beginGesture('body', hit.id, hit.box, event, alreadySelected ? selectedIds : []);
    },
    [scenePointOf, hitElementAt, onSelect, beginGesture, selectedIds, requireNodes],
  );

  const handleGripDown = useCallback(
    (grip: Grip, event: ReactPointerEvent<HTMLElement>): void => {
      // Иначе то же нажатие уйдёт в сцену и начнёт перетаскивание элемента.
      event.stopPropagation();
      // Ручки рисуются только при одном выделенном (см. Overlay), поэтому
      // сюда нельзя попасть с пачкой — а если попали, это сломанная разметка.
      const soleId = selectedIds.length === 1 ? selectedIds[0] : undefined;
      if (soleId === undefined) throw new Error('Ручка нажата без единственного выделенного элемента');
      // `sceneBoxOf`, а не `boxOf(currentSlide.states[soleId])` напрямую: ручка
      // может стоять у ребёнка группы, чьи координаты в состоянии ЛОКАЛЬНЫЕ —
      // жест обязан начинаться от бокса СЦЕНЫ, как и вся остальная геометрия.
      const box = sceneBoxOf(soleId);
      if (!box) throw new Error(`У выделенного элемента «${soleId}» нет состояния на текущем слайде`);
      beginGesture(grip, soleId, box, event);
    },
    [selectedIds, sceneBoxOf, beginGesture],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const dragging = marqueeRef.current;
      if (dragging && dragging.pointerId === event.pointerId) {
        // Рамка живёт в координатах сцены и переводится в экранные ровно
        // одним способом — тем же, каким переводится рамка выделения.
        // Считать её сразу в пикселях контейнера значило бы завести второй
        // перевод между пространствами, а он обязан быть один (ADR-007).
        const { canvas, stage } = requireNodes();
        const area = areaBetween(dragging.startPoint, scenePointOf(event));
        const hostRect = canvas.getBoundingClientRect();
        const screen = boxToScreen(stage.getBoundingClientRect(), segment.stage.width, {
          ...area,
          rotation: 0,
        });
        setMarquee({
          left: screen.left - hostRect.left,
          top: screen.top - hostRect.top,
          width: screen.width,
          height: screen.height,
        });
        return;
      }

      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const point = scenePointOf(event);
      gestureMovedRef.current = true;

      if (gesture.grip === 'body') {
        /**
         * Перетаскивание: КАЖДЫЙ взятый едет от СВОЕГО стартового бокса
         * на одну и ту же дельту.
         *
         * Дельта берётся от точки захвата, а не от бокса взятого элемента:
         * иначе пачка съезжалась бы к тому, за кого схватили. Взаимное
         * расположение обязано сохраниться — это и есть смысл жеста.
         */
        const rawDx = point.x - gesture.startPoint.x;
        const rawDy = point.y - gesture.startPoint.y;

        /**
         * Прилипание правит ОДНУ дельту на всю пачку.
         *
         * Считать его для каждого элемента отдельно значило бы разорвать
         * пачку: у каждого своя ближайшая линия, и три выделенных элемента
         * разъехались бы за одно перетаскивание. Поэтому в `snap` уходит
         * охватывающий прямоугольник всех взятых, а поправка применяется
         * ко всем одинаково — тем же доводом, по которому сырая дельта
         * считается от точки захвата, а не от бокса взятого элемента.
         */
        const startUnion = unionBox([...gesture.startBoxes.values()]);
        let dx = rawDx;
        let dy = rawDy;
        if (startUnion) {
          const stageRect = requireNodes().stage.getBoundingClientRect();
          const result = snap(
            { ...startUnion, x: startUnion.x + rawDx, y: startUnion.y + rawDy },
            visibleLayers().filter((layer) => !gesture.startBoxes.has(layer.id)),
            segment.stage,
            // Порог переводится в единицы сцены ЗДЕСЬ и по свежему замеру:
            // сохранённому масштабу доверять нельзя (ADR-007).
            SNAP_PX / stageScale(stageRect, segment.stage.width),
          );
          dx += result.dx;
          dy += result.dy;
          setGuides(guidesToHost(result.guides));
        }

        for (const [id, startBox] of gesture.startBoxes) {
          const moved = moveBox(startBox, dx, dy);
          // `localBoxFor`: `moved` — бокс СЦЕНЫ (дельта жеста и прилипание
          // считают только в ней). У ребёнка группы в `ElementState` обязаны
          // остаться ЛОКАЛЬНЫЕ координаты — без перевода сценное число легло
          // бы прямо в локальное поле, ровно тот дефект, ради которого
          // заведена эта сессия.
          const local = localBoxFor(id, moved);
          onElementStateChange(id, { x: round(local.x), y: round(local.y) });
        }
        return;
      }

      // Ручки работают с одним элементом: множественное изменение размера
      // потребовало бы масштабировать каждого относительно общей рамки,
      // а её у пачки нет как сохраняемой величины (см. `unionBox`).
      let next: Box;
      if (gesture.grip === 'rotate') {
        // Поворот к направляющим не липнет: прилипание поворота к 15° —
        // отдельная работа, и она вне черты готовности.
        next = rotateBox(gesture.startBox, point, gesture.grabOffset);
      } else {
        /**
         * Изменение размера прилипает так же, как перетаскивание, но правит
         * ТОЧКУ УКАЗАТЕЛЯ, а не бокс: поправка, приложенная к боксу, увела бы
         * и противоположный ручке край, то есть потащила бы элемент вместо
         * того, чтобы менять его размер. Разбор — в шапке `snapResize`.
         */
        const stageRect = requireNodes().stage.getBoundingClientRect();
        const result = snapResize(
          gesture.startBox,
          gesture.grip,
          point,
          // Свой бокс из целей исключается: элемент не прилипает сам к себе.
          visibleLayers().filter((layer) => layer.id !== gesture.elementId),
          segment.stage,
          // Порог — тот же и по свежему замеру масштаба, что и у перетаскивания
          // выше: сохранённому значению доверять нельзя (ADR-007).
          SNAP_PX / stageScale(stageRect, segment.stage.width),
        );
        next = result.box;
        setGuides(guidesToHost(result.guides));
      }

      // `localBoxFor`: `next` — бокс СЦЕНЫ (ресайз и поворот тоже считают
      // только в ней, как и перетаскивание выше). У ребёнка группы это
      // приводит результат к ЛОКАЛЬНЫМ координатам перед записью.
      const local = localBoxFor(gesture.elementId, next);
      onElementStateChange(gesture.elementId, {
        x: round(local.x),
        y: round(local.y),
        width: round(local.width),
        height: round(local.height),
        rotation: round(local.rotation),
      });

      /**
       * Ручка размера у группы масштабирует СОДЕРЖИМОЕ, а не только рамку.
       *
       * Без этого автор тянет угол, рамка растёт, а внутри не меняется
       * ничего — орган управления работает наполовину и молча.
       *
       * Множители берутся от СТАРТОВОГО бокса, а не от предыдущего кадра:
       * иначе на каждом `pointermove` они перемножались бы, и содержимое
       * улетело бы степенью за одно движение.
       *
       * **Пространство здесь ЛОКАЛЬНОЕ, и это не упущение** (ADR-007: не
       * смешивать пространства, а не приводить всё к одному). Умножение
       * локальных координат на множитель — и есть весь пересчёт: они
       * отсчитываются от левого верхнего угла ГРУППЫ, значит масштаб
       * относительно этого угла применяется к ним напрямую, каким бы боком
       * ни тянули. `localBoxFor`/`sceneBoxOf` (перевод через центр группы,
       * с поворотом) сюда не подходят и не нужны: у содержимого группы нет
       * своего родителя выше неё, приводить содержимое к сцене и обратно
       * значило бы дважды применить одно и то же преобразование. Поворот
       * сюда тоже не попадает: `rotateBox` размера не меняет, множители
       * вышли бы единичными, а содержимое поворачивается само — узел группы
       * его предок.
       */
      if (gesture.grip !== 'rotate' && gesture.startChildren.size > 0) {
        const sx = gesture.startBox.width === 0 ? 1 : next.width / gesture.startBox.width;
        const sy = gesture.startBox.height === 0 ? 1 : next.height / gesture.startBox.height;
        for (const [id, child] of gesture.startChildren) {
          onElementStateChange(id, {
            x: round(child.x * sx),
            y: round(child.y * sy),
            width: round(child.width * sx),
            height: round(child.height * sy),
          });
        }
      }
    },
    [scenePointOf, onElementStateChange, requireNodes, segment.stage.width, localBoxFor],
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const dragging = marqueeRef.current;
      if (dragging && dragging.pointerId === event.pointerId) {
        marqueeRef.current = null;
        const { host } = requireNodes();
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
        const drawn = marquee;
        setMarquee(null);

        /**
         * Рамка меньше порога — это был щелчок по пустому месту, а не жест.
         *
         * Проверяется по НАРИСОВАННОМУ прямоугольнику, то есть в экранных
         * пикселях: дрожание руки измеряется на экране, а не в единицах сцены.
         * Выделение при таком щелчке уже снято на нажатии — здесь просто
         * нечего добавлять.
         */
        if (!drawn || (drawn.width < MARQUEE_MIN_PX && drawn.height < MARQUEE_MIN_PX)) return;

        const area = areaBetween(dragging.startPoint, scenePointOf(event));
        const caught = visibleLayers()
          .filter((layer) => intersectsRect(layer, area))
          .map((layer) => layer.id);
        // Пустая рамка при обычном обведении ничего не выделяет — выделение
        // уже снято на нажатии. С Shift пустая рамка тоже безвредна:
        // добавить нечего, состояние вернётся то же по ссылке.
        onSelectMany(caught, dragging.additive);
        return;
      }

      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      // Направляющие живут ровно столько, сколько идёт жест. Оставить их
      // после отпускания значило бы завести на холсте линии, которых автор
      // не ставил и убрать не может.
      setGuides([]);
      const moved = gestureMovedRef.current;
      const host = hostRef.current;
      if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);

      /**
       * Клик по элементу пачки БЕЗ перетаскивания схлопывает выделение до него.
       *
       * Решение откладывается до отпускания намеренно, и обе половины нужны:
       * на нажатии пачку надо СОХРАНИТЬ, иначе её нельзя потянуть (поехал бы
       * один элемент); на отпускании без движения её надо СНЯТЬ, иначе
       * уменьшить выделение можно было бы только щелчком по пустому месту.
       * Так же ведёт себя Canva.
       */
      if (!moved && gesture.grip === 'body' && gesture.startBoxes.size > 1) {
        onSelect(gesture.elementId);
      }

      /**
       * Охват группы следует за содержимым (план С36 §8, `reflowGroup`,
       * `state/groupElements.ts`).
       *
       * Зовётся ЗДЕСЬ — на завершении жеста, а не на каждом кадре
       * `handleMove`. Живой пересчёт дал бы обратную связь самому себе: жест
       * держит стартовые боксы в СТАРОЙ системе координат группы (см.
       * `Gesture.startBox`/`startBoxes`), а `reflowGroup` эту систему
       * меняет. Видимая цена — бледная рамка группы догоняет содержимое
       * на отпускании, а не тянется за ним следом; так и задумано.
       *
       * Срабатывает, только если жест реально подвинул взятый элемент,
       * и тот — РЕБЁНОК группы. Перетаскивание/ресайз самой группы сюда
       * не попадает (у нею нет `parentId`) — её содержимое уже держится
       * плотным умножением на множитель (комментарий выше, «Ручка размера
       * у группы…»), и повторный пересчёт там был бы вторым описанием того
       * же результата.
       */
      if (moved) {
        const owner = elements.find((candidate) => candidate.id === gesture.elementId);
        const groupId = owner?.parentId;
        const groupState = groupId !== undefined ? currentSlide.states[groupId] : undefined;
        if (groupId !== undefined && groupState) {
          const children = elements
            .filter((candidate) => candidate.parentId === groupId)
            .map((candidate): { id: string; box: Box } | undefined => {
              const state = currentSlide.states[candidate.id];
              return state ? { id: candidate.id, box: boxOf(state) } : undefined;
            })
            .filter((child): child is { id: string; box: Box } => child !== undefined);

          const reflow = reflowGroup(boxOf(groupState), children);
          if (reflow) {
            onElementStateChange(groupId, {
              x: round(reflow.group.x),
              y: round(reflow.group.y),
              width: round(reflow.group.width),
              height: round(reflow.group.height),
              rotation: round(reflow.group.rotation),
            });
            for (const child of reflow.children) {
              onElementStateChange(child.id, {
                x: round(child.box.x),
                y: round(child.box.y),
                width: round(child.box.width),
                height: round(child.box.height),
                rotation: round(child.box.rotation),
              });
            }
          }
        }
      }

      // Коммит-точка жеста (срез 2): если движение и правда было,
      // `onElementStateChange` уже записал финальное значение (включая
      // пересчёт охвата группы выше) — здесь только закрываем шаг истории,
      // ОДНИМ шагом на весь жест. Если жеста фактически не было (простой
      // клик без движения), это безопасный no-op на стороне историй.
      onCommitHistory();
    },
    [
      onCommitHistory,
      onSelect,
      onSelectMany,
      onElementStateChange,
      marquee,
      requireNodes,
      scenePointOf,
      visibleLayers,
      elements,
      currentSlide,
    ],
  );

  /**
   * Без preventDefault на dragover браузер вообще не даёт сработать drop —
   * таково поведение по умолчанию для большинства элементов страницы.
   */
  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>): void => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      // Один файл: перетаскивание нескольких картинок сразу — за рамками среза.
      const file = event.dataTransfer.files[0];
      if (!file) return;
      onImageDrop?.(file);
    },
    [onImageDrop],
  );

  /**
   * Правая кнопка по сцене.
   *
   * Кто под курсором, решает тот же `hitElementAt`, что и обычный клик,
   * а не отдельный разбор: две трактовки одного попадания разошлись бы
   * молча, и меню открывалось бы над одним элементом, а действовало
   * на другой.
   *
   * Промах по пустому месту НЕ гасится: мы там ничего не предлагаем,
   * значит и отбирать у браузера событие не за что.
   */
  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (!onContextMenu) return;
      const hit = hitElementAt(scenePointOf(event));
      // Промах по пустому месту тоже открывает меню (Сессия 33): там есть
      // что предложить — «Вставить». Событие гасится в обоих случаях,
      // иначе поверх нашего меню встало бы браузерное.
      event.preventDefault();
      onContextMenu(hit?.id, { x: event.clientX, y: event.clientY });
    },
    [onContextMenu, hitElementAt, scenePointOf],
  );

  return (
    <>
    <div
      className="ed-stage-host"
      ref={hostRef}
      onContextMenu={handleContextMenu}
      onPointerDown={handleStageDown}
      onPointerMove={handleMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={handleStageDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/*
        Слой прокрутки — отдельный узел ВНУТРИ холста, а не сам холст.
        Так `host.clientWidth`, от которого считается вписывание, перестаёт
        зависеть от появления полос прокрутки — то есть пересчёт масштаба
        не может гоняться сам за собой.
      */}
      <div className="ed-stage-scroll" data-testid="stage-scroll">
        <div className="ed-stage-canvas" ref={canvasRef}>
          {/*
            Подложка листа. Стоит ПЕРЕД сценой, чтобы рисоваться под ней:
            оба узла позиционированы, значит порядок рисования решает порядок
            в DOM. Размер ей выставляет fit() по коробке самой сцены.
          */}
          <div className="ed-scene-backdrop" ref={backdropRef} aria-hidden="true" />
          {/*
            Узел сцены. Опознаётся тестами по этой метке, а НЕ по положению
            в дереве: прежде они брали его как `.ed-stage-host > div`, и
            появление слоя прокрутки увело сцену на уровень глубже — три
            проверки разом стали мерить не тот узел. Позиционный селектор
            ломается от любой правки разметки и врёт правдоподобно: узел
            находится, числа приходят, только чужие.
          */}
          <div ref={stageRef} className="ed-scene" data-testid="stage-scene" />
          {/*
            Рамка обведения — соседка сцены, а не её потомок: служебных узлов
            внутри сцены быть не должно, иначе они попадут в скриншотный паритет
            рендера (инвариант №5) и в сохранённый проект.
          */}
          {guides.map((guide, index) => (
            <div
              // Ключом может быть только положение в списке: линии — величина
              // без имени, и своего устойчивого признака у них нет.
              key={index}
              className="ed-guide"
              data-testid="guide"
              style={{
                left: `${guide.left}px`,
                top: `${guide.top}px`,
                width: `${guide.width}px`,
                height: `${guide.height}px`,
              }}
            />
          ))}
          {marquee ? (
            <div
              className="ed-marquee"
              data-testid="marquee"
              style={{
                left: `${marquee.left}px`,
                top: `${marquee.top}px`,
                width: `${marquee.width}px`,
                height: `${marquee.height}px`,
              }}
            />
          ) : null}
          <Overlay
            frame={frame}
            groupFrame={groupFrame}
            showHandles={selectedIds.length === 1}
            onGripDown={handleGripDown}
          />
        </div>
      </div>
    </div>

    {/*
      Панель масштаба — СТРОКОЙ ПОД холстом, а не плавающей поверх него.

      Сначала она плавала в правом нижнем углу холста, и это было неверно
      скопированной натурой: у Canva управление масштабом стоит в нижней
      строке ОКНА, ниже холста, и дизайн собой не накрывает. Плавающая
      панель отнимала у автора угол его же сцены, а поймал это тест паритета
      рендера (инвариант №5): снимок узла сцены захватывает всё, что
      нарисовано поверх её области, и панель попала в кадр.

      Строка постоянна — она не появляется и не исчезает вместе с чем-либо,
      поэтому площадь холста при работе не меняется и сцена не уезжает
      из-под курсора (та же физика, что у полосы свойств, см. `PropBar.tsx`).
    */}
    {/*
      Три группы, каждая отвечает на свой вопрос автора:
      слева «что я показываю», по центру «где я во времени», справа
      «как это приближено». Членение снято с натуры: у КапКута ровно эти
      три группы одной строкой, у Канвы транспорт центрован под холстом,
      а масштаб — в нижней строке окна. Совпало у двоих — берём.

      Пустой левый узел остаётся В РАЗМЕТКЕ и когда групп нет: раскладка
      строки — грид из трёх колонок, и центральная группа обязана стоять
      по центру ХОЛСТА, а не по центру остатка. Пропади левый узел —
      транспорт уехал бы влево, и это было бы видно на каждом переключении.
    */}
    <div className="ed-zoom-strip">
      <span className="ed-strip-group ed-strip-group--left">{stripLeft}</span>
      <span className="ed-strip-group ed-strip-group--center">{stripCenter}</span>
      <span className="ed-strip-group ed-strip-group--right">
        <ZoomBar
          zoom={zoom}
          scale={shownScale}
          canZoomIn={canZoomIn(zoom, shownScale)}
          canZoomOut={canZoomOut(zoom, shownScale)}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onPick={setZoom}
        />
      </span>
    </div>
    </>
  );
});

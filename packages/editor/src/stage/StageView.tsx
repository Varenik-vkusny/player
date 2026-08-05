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
import { applyTheme, ScenePreview, type Segment } from '@player/player';

import { boxToScreen, toScene, topmostAt, type Box, type Point } from './geometry.js';
import { Overlay, type Frame, type Grip } from './Overlay.js';
import { angleTo, centerOf, moveBox, resizeBox, rotateBox } from './transform.js';

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

/** Императивная ручка StageView — сегодня ровно одна операция. */
export interface StageViewHandle {
  /**
   * Закрывает текущую правку текста на холсте, если она идёт. Вызывается из
   * Editor.tsx по намерению `commitText` (Escape в контексте `editingText`,
   * `keyboard.ts`) — единственный путь коммита, которому нужен мост наружу
   * из StageView; клик мимо и потеря фокуса узел обрабатывает сам.
   */
  commitTextEdit: () => void;
}

export interface StageViewProps {
  /** Все элементы и все слайды сегмента — нужны предпросмотру и списку кандидатов на попадание. */
  segment: Segment;
  /** Слайд, который автор сейчас правит: именно его states рисует и меняет сцена. */
  currentSlide: Slide;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
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
  /** Файл, брошенный на сцену. Что с ним делать (кодировать, вставлять) — забота Editor.tsx. */
  onImageDrop?: (file: File) => void;
  onReady?: (preview: ScenePreview | null) => void;
}

interface Gesture {
  readonly pointerId: number;
  readonly grip: Grip | 'body';
  readonly elementId: string;
  readonly startBox: Box;
  readonly startPoint: Point;
  /** Для вращения: угол, зафиксированный в момент захвата. */
  readonly grabOffset: number;
}

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
    selectedId,
    onSelect,
    onElementStateChange,
    onElementContentChange,
    onCommitHistory,
    onImageDrop,
    onReady,
  }: StageViewProps,
  ref,
): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);
  const renderedStatesRef = useRef<Readonly<Record<string, ElementState>>>({});
  const gestureRef = useRef<Gesture | null>(null);

  const [frame, setFrame] = useState<Frame | null>(null);

  const elements = segment.elements;

  /** Требует контейнеры: их отсутствие означает сломанную разметку, а не штатный случай. */
  const requireNodes = useCallback((): { host: HTMLDivElement; stage: HTMLDivElement } => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) throw new Error('StageView: контейнеры сцены не смонтированы');
    return { host, stage };
  }, []);

  const fit = useCallback((): void => {
    const { host } = requireNodes();
    const preview = previewRef.current;
    if (!preview) return;
    // Размер берётся у контейнера заново каждый раз. Сохранённому масштабу
    // доверять нельзя — прямое требование ADR-007.
    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }
  }, [requireNodes]);

  /** Пересчитывает рамку выделения в пикселях контейнера. */
  const syncFrame = useCallback((): void => {
    const { host, stage } = requireNodes();
    const selectedState = selectedId === undefined ? undefined : currentSlide.states[selectedId];
    if (!selectedState) {
      setFrame(null);
      return;
    }
    // Прямоугольник берётся у ВНУТРЕННЕГО узла: у внешнего при летербоксе
    // ширина другая, и масштаб вышел бы завышенным — тихо и правдоподобно.
    const stageRect = stage.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const screen = boxToScreen(stageRect, segment.stage.width, selectedState);
    setFrame({
      left: screen.left - hostRect.left,
      top: screen.top - hostRect.top,
      width: screen.width,
      height: screen.height,
      rotation: selectedState.rotation,
    });
  }, [requireNodes, selectedId, currentSlide, segment.stage.width]);

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

    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }

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
  const hitElementAt = useCallback(
    (point: Point): { id: string; box: Box } | undefined => {
      const states = currentSlide.states;
      const layers = elements
        .filter((element) => isVisible(element.id))
        .map((element) => {
          const state = states[element.id]!; // isVisible гарантирует отрисованный узел ⇒ состояние есть
          return { ...boxOf(state), zIndex: state.zIndex, id: element.id };
        });
      const hit = topmostAt(layers, point);
      return hit ? { id: hit.id, box: { x: hit.x, y: hit.y, width: hit.width, height: hit.height, rotation: hit.rotation } } : undefined;
    },
    [elements, currentSlide, isVisible],
  );

  const beginGesture = useCallback(
    (grip: Grip | 'body', elementId: string, box: Box, event: ReactPointerEvent<HTMLElement>): void => {
      const { host } = requireNodes();
      const point = scenePointOf(event);
      gestureRef.current = {
        pointerId: event.pointerId,
        grip,
        elementId,
        startBox: box,
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
    [requireNodes, scenePointOf],
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

  useImperativeHandle(ref, () => ({ commitTextEdit }), [commitTextEdit]);

  const handleStageDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      const point = scenePointOf(event);
      const hit = hitElementAt(point);
      if (!hit) return;
      const element = elements.find((candidate) => candidate.id === hit.id);
      if (!element) throw new Error(`Двойной клик в элемент «${hit.id}», которого нет в сцене`);
      beginTextEdit(element, event);
    },
    [scenePointOf, hitElementAt, elements, beginTextEdit],
  );

  const handleStageDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
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
        onSelect(undefined);
        return;
      }
      onSelect(hit.id);
      beginGesture('body', hit.id, hit.box, event);
    },
    [scenePointOf, hitElementAt, onSelect, beginGesture],
  );

  const handleGripDown = useCallback(
    (grip: Grip, event: ReactPointerEvent<HTMLElement>): void => {
      // Иначе то же нажатие уйдёт в сцену и начнёт перетаскивание элемента.
      event.stopPropagation();
      if (selectedId === undefined) throw new Error('Ручка нажата без выделенного элемента');
      const state = currentSlide.states[selectedId];
      if (!state) throw new Error(`У выделенного элемента «${selectedId}» нет состояния на текущем слайде`);
      beginGesture(grip, selectedId, boxOf(state), event);
    },
    [selectedId, currentSlide, beginGesture],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const point = scenePointOf(event);
      let next: Box;
      if (gesture.grip === 'body') {
        next = moveBox(gesture.startBox, point.x - gesture.startPoint.x, point.y - gesture.startPoint.y);
      } else if (gesture.grip === 'rotate') {
        next = rotateBox(gesture.startBox, point, gesture.grabOffset);
      } else {
        next = resizeBox(gesture.startBox, gesture.grip, point);
      }

      onElementStateChange(gesture.elementId, {
        x: round(next.x),
        y: round(next.y),
        width: round(next.width),
        height: round(next.height),
        rotation: round(next.rotation),
      });
    },
    [scenePointOf, onElementStateChange],
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      const host = hostRef.current;
      if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      // Коммит-точка жеста (срез 2): если движение и правда было,
      // `onElementStateChange` уже записал финальное значение — здесь только
      // закрываем шаг истории. Если жеста фактически не было (простой клик
      // без движения), это безопасный no-op на стороне историй.
      onCommitHistory();
    },
    [onCommitHistory],
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

  return (
    <div
      className="ed-stage-host"
      ref={hostRef}
      onPointerDown={handleStageDown}
      onPointerMove={handleMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onDoubleClick={handleStageDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={stageRef} />
      <Overlay frame={frame} onGripDown={handleGripDown} />
    </div>
  );
});

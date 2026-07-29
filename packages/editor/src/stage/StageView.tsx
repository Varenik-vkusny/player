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

import type { Element } from '@player/core';
import { ScenePreview, type Segment } from '@player/player';

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
  segment: Segment;
  positionSeconds: number;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  /**
   * Правка геометрии элемента жестом (перетаскивание, ручка). Вызывается
   * МНОГОКРАТНО за один жест — каждое `pointermove` даёт свой вызов, — и это
   * намеренно живое, некоммитящее событие: коммит-точку жеста ставит
   * `onCommitHistory` на `pointerup`, а не этот колбэк (срез 2, `Ctrl+Z`
   * обязан отменять жест целиком, а не один промежуточный кадр).
   */
  onElementChange: (element: Element) => void;
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

const boxOf = (element: Element): Box => ({
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  rotation: element.rotation,
});

const round = (value: number): number => Number(value.toFixed(PRECISION));

export const StageView = forwardRef<StageViewHandle, StageViewProps>(function StageView(
  {
    segment,
    positionSeconds,
    selectedId,
    onSelect,
    onElementChange,
    onCommitHistory,
    onImageDrop,
    onReady,
  }: StageViewProps,
  ref,
): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<ScenePreview | null>(null);
  const renderedRef = useRef<readonly Element[]>([]);
  const gestureRef = useRef<Gesture | null>(null);

  const [frame, setFrame] = useState<Frame | null>(null);

  const elements = segment.scene.elements;

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
    const selected = selectedId === undefined
      ? undefined
      : elements.find((element) => element.id === selectedId);
    if (!selected) {
      setFrame(null);
      return;
    }
    // Прямоугольник берётся у ВНУТРЕННЕГО узла: у внешнего при летербоксе
    // ширина другая, и масштаб вышел бы завышенным — тихо и правдоподобно.
    const stageRect = stage.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const screen = boxToScreen(stageRect, segment.stage.width, boxOf(selected));
    setFrame({
      left: screen.left - hostRect.left,
      top: screen.top - hostRect.top,
      width: screen.width,
      height: screen.height,
      rotation: selected.rotation,
    });
  }, [requireNodes, elements, selectedId, segment.stage.width]);

  // Сцена пересобирается только при СТРУКТУРНОЙ правке.
  //
  // Зависеть от самого segment нельзя: segmentOf отдаёт новый объект при
  // любом изменении проекта, а значит и при каждом движении мыши. Эффект
  // на нём уничтожал бы и строил сцену заново шестьдесят раз в секунду —
  // вместе с узлом под курсором и таймлайном, который на него ссылается.
  // Ключ описывает именно то, из-за чего сцену действительно надо собирать
  // заново: состав элементов и размер сцены. Изменения cues, gates и слов
  // ловятся ссылками — эти массивы пересоздаются только при правке.
  const structureKey = useMemo(
    () => `${segment.stage.width}x${segment.stage.height}|${JSON.stringify(elements.map((e) => e.id))}`,
    [segment.stage.width, segment.stage.height, elements],
  );

  // Внутри эффекта нужны АКТУАЛЬНЫЕ сегмент и момент, а не те, что были
  // на момент последней смены структуры.
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  const positionRef = useRef(positionSeconds);
  positionRef.current = positionSeconds;

  useLayoutEffect(() => {
    const { host, stage } = requireNodes();
    const segment = segmentRef.current;

    const preview = new ScenePreview(stage, segment);
    previewRef.current = preview;
    renderedRef.current = segment.scene.elements;
    // Инвариант №3 действует и в редакторе, только по другой причине:
    // здесь сцена не должна перехватывать жесты у слоя взаимодействия.
    stage.style.pointerEvents = 'none';

    if (host.clientWidth > 0 && host.clientHeight > 0) {
      preview.fit(host.clientWidth, host.clientHeight);
    }
    // Свежий предпросмотр стоит на нуле, а головка — там, где её оставил
    // автор. Без этой строки любая структурная правка (добавили метку,
    // добавили элемент) молча отматывала сцену в начало: эффект перемотки
    // не срабатывает, потому что момент не менялся, и React справедливо
    // считает, что делать нечего.
    preview.seek(positionRef.current);

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
  }, [
    structureKey,
    segment.scene.cues,
    segment.scene.gates,
    segment.words,
    segment.duration,
    requireNodes,
    onReady,
  ]);

  // Точечное обновление изменившихся элементов.
  //
  // Сюда попадают правки, не меняющие структуру: подвинули, растянули,
  // повернули. Состав элементов при этом тот же, поэтому applyElement
  // по изменившимся узлам достаточно, а renderScene была бы разрушительна.
  // Смена состава обрабатывается эффектом выше и досюда не доходит:
  // он пересоздаёт предпросмотр и сам записывает renderedRef.
  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;

    const previous = renderedRef.current;
    if (previous === elements) return;

    const sameShape =
      previous.length === elements.length &&
      previous.every((element, index) => element.id === elements[index]?.id);
    // Структура изменилась — значит эффект сборки уже отработал или вот-вот
    // отработает. Трогать сцену отсюда нельзя: получилось бы два хозяина.
    if (!sameShape) return;

    for (const [index, element] of elements.entries()) {
      // Пока каретка внутри узла, applyElement его не касается: он
      // безусловно перезаписывает textContent (player/src/render.ts) и убил
      // бы правку, даже не пересоздавая узел («Правка текста на холсте»,
      // препятствие №3). Источник истины остаётся element.content — DOM
      // расходится с ним ровно на время жеста, как и при перетаскивании.
      if (previous[index] !== element && editingRef.current?.id !== element.id) {
        preview.updateElement(element);
      }
    }
    renderedRef.current = elements;
  }, [elements]);

  useLayoutEffect(() => {
    previewRef.current?.seek(positionSeconds);
  }, [positionSeconds]);

  useLayoutEffect(syncFrame, [syncFrame]);

  /** Точка указателя в координатах сцены. Прямоугольник измеряется заново. */
  const scenePointOf = useCallback(
    (event: { clientX: number; clientY: number }): Point => {
      const { stage } = requireNodes();
      return toScene(stage.getBoundingClientRect(), segment.stage.width, event.clientX, event.clientY);
    },
    [requireNodes, segment.stage.width],
  );

  const beginGesture = useCallback(
    (grip: Grip | 'body', element: Element, event: ReactPointerEvent<HTMLElement>): void => {
      const { host } = requireNodes();
      const point = scenePointOf(event);
      const box = boxOf(element);
      gestureRef.current = {
        pointerId: event.pointerId,
        grip,
        elementId: element.id,
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

  /** Виден ли элемент на текущем моменте — по тому, что реально нарисовано. */
  const isVisible = useCallback((id: string): boolean => {
    const node = previewRef.current?.nodes.get(id);
    if (!node) return false;
    // Порог, а не строгий ноль: на границе анимации значение бывает
    // вроде 0.002, и такой элемент кликать всё равно не по чему.
    return Number(getComputedStyle(node).opacity) > 0.01;
  }, []);

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
   *    покрывает предыдущий пункт (например, Tab увёл фокus без единого
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

    onElementChange({ ...element, content });
    onCommitHistory();
  }, [elements, onElementChange, onCommitHistory]);

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
      const hit = topmostAt(
        elements
          .filter((element) => isVisible(element.id))
          .map((element) => ({ ...boxOf(element), zIndex: element.zIndex, id: element.id })),
        point,
      );
      if (!hit) return;
      const element = elements.find((candidate) => candidate.id === hit.id);
      if (!element) throw new Error(`Двойной клик в элемент «${hit.id}», которого нет в сцене`);
      beginTextEdit(element, event);
    },
    [scenePointOf, elements, isVisible, beginTextEdit],
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
      // Выделяется то, что видно СЕЙЧАС. Элемент, который на этой секунде
      // ещё не появился, геометрически на сцене есть и может лежать выше
      // по zIndex — и тогда клик по видимой карточке выделял бы невидимую
      // точку поверх неё. Прозрачность берётся у отрисованного узла:
      // это ответ самого рендера на вопрос «что сейчас на экране»,
      // а не вторая реализация той же логики.
      const hit = topmostAt(
        elements
          .filter((element) => isVisible(element.id))
          .map((element) => ({ ...boxOf(element), zIndex: element.zIndex, id: element.id })),
        point,
      );
      if (!hit) {
        onSelect(undefined);
        return;
      }
      const element = elements.find((candidate) => candidate.id === hit.id);
      if (!element) throw new Error(`Попадание в элемент «${hit.id}», которого нет в сцене`);
      onSelect(element.id);
      beginGesture('body', element, event);
    },
    [scenePointOf, elements, onSelect, beginGesture, isVisible],
  );

  const handleGripDown = useCallback(
    (grip: Grip, event: ReactPointerEvent<HTMLElement>): void => {
      // Иначе тот же нажатие уйдёт в сцену и начнёт перетаскивание элемента.
      event.stopPropagation();
      const element = elements.find((candidate) => candidate.id === selectedId);
      if (!element) throw new Error('Ручка нажата без выделенного элемента');
      beginGesture(grip, element, event);
    },
    [elements, selectedId, beginGesture],
  );

  const handleMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      const element = elements.find((candidate) => candidate.id === gesture.elementId);
      if (!element) throw new Error(`Жест по элементу «${gesture.elementId}», которого нет в сцене`);

      const point = scenePointOf(event);
      let next: Box;
      if (gesture.grip === 'body') {
        next = moveBox(gesture.startBox, point.x - gesture.startPoint.x, point.y - gesture.startPoint.y);
      } else if (gesture.grip === 'rotate') {
        next = rotateBox(gesture.startBox, point, gesture.grabOffset);
      } else {
        next = resizeBox(gesture.startBox, gesture.grip, point);
      }

      onElementChange({
        ...element,
        x: round(next.x),
        y: round(next.y),
        width: round(next.width),
        height: round(next.height),
        rotation: round(next.rotation),
      });
    },
    [elements, scenePointOf, onElementChange],
  );

  const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>): void => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      const host = hostRef.current;
      if (host?.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
      // Коммит-точка жеста (срез 2): если движение и правда было,
      // `onElementChange` уже записал финальное значение — здесь только
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

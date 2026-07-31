/**
 * Корень редактора: раскладка и состояние.
 *
 * Держит редактируемый проект (обёрнутый историей отмены/повтора,
 * `state/editorHistory.ts`) и выделение. Всё остальное — производное:
 * момент на дорожке приходит от транспорта, геометрия элементов — от
 * состояния текущего слайда, картинка — от предпросмотра из плеера.
 *
 * Компоненты ниже — только вид. Логика живёт в модулях, которые про React
 * не знают: state/project (редьюсер), state/editorHistory (отмена/повтор),
 * state/slides (слайды), state/exits (сегменты и выход), state/gates
 * (правила панели метки), keyboard (раскладка клавиатуры), stage/geometry
 * и stage/transform (координаты и жесты), track/transport (звук), track/peaks
 * (волна). Каждый из них покрыт юнитами. Переписать интерфейс — значит
 * заменить компоненты и styles.ts, не трогая ни одной проверенной строчки.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type { Condition, Element, ElementState, Gate, Project, Slide, TimeRef } from '@player/core';
import { findSegment } from '@player/core';
import { segmentOf, type ScenePreview } from '@player/player';

import { keyToIntent, type KeyContext } from './keyboard.js';
import { ELEMENTS, GATES, plural } from './plural.js';
import { ElementList } from './panels/ElementList.js';
import { toRows } from './panels/elementRows.js';
import { SegmentPanel } from './panels/SegmentPanel.js';
import { Inspector } from './panels/Inspector.js';
import { InsertPanel } from './panels/InsertPanel.js';
import { MarkPanel, type SelectedMarkData } from './panels/MarkPanel.js';
import { formatRemovalMessage, statesOnSlides } from './panels/removalMessage.js';
import { SlidePanel } from './panels/SlidePanel.js';
import { TemplatesPanel } from './panels/TemplatesPanel.js';
import { canRedoState, canUndoState, historyReducer, initialHistoryState } from './state/editorHistory.js';
import { createElement } from './state/elements.js';
import { variableRenameProblem } from './state/exits.js';
import { createGate, gateInsideTransition } from './state/gates.js';
import { splitBlockedReason } from './state/split.js';
import { createImageElement, encodeImageFile } from './state/image.js';
import { libraryItem } from './state/library.js';
import { freeId, segmentSlide, type MarkKind } from './state/project.js';
import { sceneTemplate } from './state/templates.js';
import { downloadProject, openInPlayer } from './state/save.js';
import { StageView, type StageViewHandle } from './stage/StageView.js';
import { markSeconds, timeRefAt } from './track/marks.js';
import type { Mark } from './track/MarksLane.js';
import { TrackView } from './track/TrackView.js';
import { useTransport } from './track/useTransport.js';

export interface EditorProps {
  project: Project;
  /** Сообщает хосту, что сцена построена. Вызывается с null при снятии. */
  onReady?: (preview: ScenePreview | null) => void;
}

/**
 * `INPUT`/`TEXTAREA`/`SELECT` — поля, в которых клавиши принадлежат вводу,
 * а не командам редактора (в том числе стрелки внутри `<select>`).
 *
 * Параметр типизирован через `globalThis.Element`, а не голым `Element`:
 * это имя в файле уже занято типом элемента сцены из `@player/core`.
 */
function isTextFieldNode(node: globalThis.Element | null): boolean {
  if (!node) return false;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT';
}

export function Editor({ project, onReady }: EditorProps): ReactElement {
  const [state, dispatch] = useReducer(historyReducer, project, initialHistoryState);
  const currentProject = state.history.present;

  // Мост к правке текста на холсте (см. StageView.beginTextEdit): Escape
  // в контексте editingText даёт намерение commitText (keyboard.ts), а
  // закрывать правку умеет только StageView — он один держит ссылку на
  // редактируемый DOM-узел. Клик мимо и потеря фокуса StageView коммитит
  // сам, без участия Editor.tsx; этот мост нужен ровно для Escape.
  const stageRef = useRef<StageViewHandle>(null);

  // Сегмент, который сейчас правит автор, — настоящий объект хребта, а не
  // видовое представление segmentOf: он нужен там, где правка обращается
  // к сегменту напрямую (вставка элемента, добавление слайда). findSegment —
  // узкая дверца ядра для чтения сегмента по id (та же, которой пользуется
  // segmentOf и nextSegment), а не второй самодельный обход project.segments.
  const currentSegment = useMemo(
    () => findSegment(currentProject, state.currentSegmentId),
    [currentProject, state.currentSegmentId],
  );

  // Слайд, который автор сейчас правит. Узкая дверца — segmentSlide
  // (state/project.ts): она уже проверяет, что слайд существует.
  const currentSlide = useMemo(
    () => segmentSlide(currentProject, state.currentSegmentId, state.currentSlideId),
    [currentProject, state.currentSegmentId, state.currentSlideId],
  );

  // Единственная точка, через которую редактор видит дорожку и элементы —
  // видовое представление плеера. Когда проект стал графом сегментов,
  // поменялась segmentOf, а не это место и не всё, что ниже.
  const segment = useMemo(
    () => segmentOf(currentProject, state.currentSegmentId),
    [currentProject, state.currentSegmentId],
  );

  /**
   * Секунды гейтов текущего сегмента — предпросмотр обязан на них встать.
   *
   * Без этого дорожка редактора проезжала гейт молча: на линейке стоял
   * квадратик, автор жал «играть», звук шёл дальше, и редактор показывал
   * поведение, которого у зрителя не будет. Инвариант №4 — про плеер, но
   * автор судит о своей работе по редактору.
   *
   * Считается тем же `markSeconds`, что и метки на дорожке (см. `marks`
   * ниже): два разных способа разрешить один TimeRef разошлись бы, и
   * остановка случилась бы не там, где нарисован квадратик.
   */
  const gateSeconds = useMemo(
    () => segment.gates.map((gate) => markSeconds(gate.at, segment.words)),
    [segment],
  );

  const transport = useTransport(segment.src, segment.duration, gateSeconds, segment.offset);

  const selected =
    state.selectedId === undefined
      ? undefined
      : segment.elements.find((element) => element.id === state.selectedId);

  /**
   * Состояние выделенного элемента на ТЕКУЩЕМ слайде.
   *
   * undefined — законный случай, а не рассинхрон: список элементов
   * (ElementList) специально показывает элементы, ещё не появившиеся
   * на этом слайде, и автор вправе выделить такой элемент — просто
   * геометрию и вид у него на этом слайде взять неоткуда.
   */
  const selectedState = selected === undefined ? undefined : currentSlide.states[selected.id];

  const selectionReadout =
    selected === undefined
      ? 'ничего не выделено'
      : selectedState === undefined
        ? `${selected.id}: нет на этом слайде`
        : `${selected.id}: ${selectedState.x} × ${selectedState.y}, `
          + `${selectedState.width}×${selectedState.height}, ${selectedState.rotation}°`;

  // Выделение метки на дорожке — состояние вида, а не проекта: в файл оно
  // не попадает и переписку интерфейса переживать не обязано (как и раньше).
  // Выделение элемента и выделение метки исключают друг друга: панель справа
  // показывает ровно одно из двух, и клавиатурные команды (Delete, стрелки)
  // обязаны однозначно понимать, что выделено.
  const [selectedMark, setSelectedMark] = useState<{ kind: MarkKind; id: string } | undefined>(
    undefined,
  );

  const markData: SelectedMarkData | undefined = useMemo(() => {
    if (!selectedMark) return undefined;
    if (selectedMark.kind === 'gate') {
      const gate = segment.gates.find((candidate) => candidate.id === selectedMark.id);
      return gate ? { kind: 'gate', gate } : undefined;
    }
    const slide = segment.slides.find((candidate) => candidate.id === selectedMark.id);
    return slide ? { kind: 'slide', slide } : undefined;
  }, [selectedMark, segment.gates, segment.slides]);

  // Метка могла исчезнуть не только через кнопку удаления, но и через Ctrl+Z
  // (отмена её добавления) — тот же случай, что и «выделенного элемента нет
  // в восстановленном проекте» для state.selectedId, только selectedMark
  // здесь не часть history и сама себя не проверяет.
  useEffect(() => {
    if (selectedMark && !markData) setSelectedMark(undefined);
  }, [selectedMark, markData]);

  const handleSelect = useCallback((id: string | undefined) => {
    // Выделение элемента и метки взаимоисключающи (см. комментарий выше).
    setSelectedMark(undefined);
    dispatch({ type: 'select', id });
  }, []);

  const handleSelectMark = useCallback((kind: MarkKind, id: string) => {
    setSelectedMark({ kind, id });
    dispatch({ type: 'select', id: undefined });
  }, []);

  const handleRemoveMark = useCallback(() => {
    if (!selectedMark) return;
    // Гейт снимается действием removeMark, слайд — своим отдельным
    // removeSlide (у него своя проверка «нельзя остаться без слайдов»
    // и «нельзя убрать первый слайд») — то же разделение, что и в редьюсере.
    if (selectedMark.kind === 'gate') {
      dispatch({ type: 'removeMark', kind: 'gate', id: selectedMark.id });
    } else {
      dispatch({ type: 'removeSlide', slideId: selectedMark.id });
    }
    setSelectedMark(undefined);
  }, [selectedMark]);

  const handleUpdateGate = useCallback((gate: Gate) => dispatch({ type: 'updateGate', gate }), []);

  const handleRenameVariable = useCallback(
    (name: string) => {
      if (!selectedMark || selectedMark.kind !== 'gate') return;
      dispatch({ type: 'renameVariable', gateId: selectedMark.id, name });
    },
    [selectedMark],
  );

  // Причину отказа считает тот же модуль, что и сама правка (state/exits.ts),
  // — иначе поле показывало бы «всё хорошо» там, где запись отвергается.
  const variableProblemOf = useCallback(
    (name: string): string | undefined => {
      if (!selectedMark || selectedMark.kind !== 'gate') return undefined;
      return variableRenameProblem(currentProject, selectedMark.id, name);
    },
    [selectedMark, currentProject],
  );

  // Перепривязка — тот же `moveMark`, что и перетаскивание: метка меняет
  // способ ссылки на время, а не сущность. Отдельного действия не нужно.
  const handleRetargetMark = useCallback(
    (at: TimeRef) => {
      if (!selectedMark) return;
      dispatch({ type: 'moveMark', kind: selectedMark.kind, id: selectedMark.id, at });
    },
    [selectedMark],
  );

  const handleSetSlideTransition = useCallback(
    (transition: Slide['transition']) => {
      if (!selectedMark || selectedMark.kind !== 'slide') return;
      dispatch({ type: 'setSlideTransition', slideId: selectedMark.id, transition });
    },
    [selectedMark],
  );

  const handleSplitAtGate = useCallback(
    (gateId: string) => dispatch({ type: 'splitAtGate', gateId }),
    [],
  );

  const handleAddSegment = useCallback(() => dispatch({ type: 'addSegment' }), []);
  const handleRemoveSegment = useCallback((id: string) => dispatch({ type: 'removeSegment', id }), []);
  const handleConnect = useCallback(
    (when: readonly Condition[], goto: string) => dispatch({ type: 'connect', when, goto }),
    [],
  );
  const handleDisconnect = useCallback((ruleId: string) => dispatch({ type: 'disconnect', ruleId }), []);
  const handleAddCondition = useCallback(
    (ruleId: string, condition: Condition) => dispatch({ type: 'addCondition', ruleId, condition }),
    [],
  );
  const handleRemoveCondition = useCallback(
    (ruleId: string, index: number) => dispatch({ type: 'removeCondition', ruleId, index }),
    [],
  );

  const handleSelectSegment = useCallback((id: string) => {
    // Выделенная метка принадлежала дорожке прежнего сегмента — тот же
    // довод, что и в handleSelect для выделения элемента.
    setSelectedMark(undefined);
    dispatch({ type: 'selectSegment', id });
  }, []);

  const handleSelectSlide = useCallback((id: string) => dispatch({ type: 'selectSlide', id }), []);

  const handleRemoveSlide = useCallback((slideId: string) => dispatch({ type: 'removeSlide', slideId }), []);

  /**
   * Добавляет слайд после текущего выделенного — копией его состояний
   * (это уже делает `slidesApi.addSlide`, здесь только вычисляется момент
   * вставки). Момент — середина между текущим слайдом и следующим, либо,
   * если текущий последний, середина оставшегося хвоста дорожки: оба случая
   * гарантированно проходят проверку `addSlide` («позже предыдущего, раньше
   * следующего»), не полагаясь на положение головки плеера.
   */
  const handleAddSlide = useCallback(() => {
    const slides = currentSegment.slides;
    const index = slides.findIndex((slide) => slide.id === state.currentSlideId);
    const anchor = slides[index]!;
    const next = slides[index + 1];
    const words = segment.words;
    const anchorSeconds = markSeconds(anchor.at, words);
    const target = next
      ? (anchorSeconds + markSeconds(next.at, words)) / 2
      : anchorSeconds + Math.max(0.1, (segment.duration - anchorSeconds) / 2);
    dispatch({ type: 'addSlide', afterSlideId: anchor.id, at: timeRefAt(words, target) });
  }, [currentSegment.slides, state.currentSlideId, segment.words, segment.duration]);

  /**
   * Одношаговая правка содержимого элемента (текст, путь к картинке) —
   * самостоятельный шаг истории. Геометрия и вид сюда не входят: они живут
   * в состоянии слайда и правятся через setElementState (см. ниже).
   */
  const handleElementContentChange = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element });
  }, []);

  /** Одношаговая правка состояния элемента на текущем слайде (цвет, чекбокс). */
  const handleElementStateChange = useCallback((elementId: string, patch: Partial<ElementState>) => {
    dispatch({ type: 'setElementState', elementId, patch });
  }, []);

  /**
   * Живое событие уже идущего жеста — перетаскивание на сцене, набор числа
   * в панели свойств. НЕ создаёт шаг истории само по себе: коммит-точку
   * ставит `handleCommitHistory` (см. `state/editorHistory.ts`).
   */
  const handleElementStateChangeLive = useCallback((elementId: string, patch: Partial<ElementState>) => {
    dispatch({ type: 'setElementState', elementId, patch, commit: false });
  }, []);

  /** Завершает жест, открытый `handleElementStateChangeLive`/`handleMoveMark`. */
  const handleCommitHistory = useCallback(() => dispatch({ type: 'commit' }), []);

  const handleInsert = useCallback(
    (itemId: string) => {
      const { element, state: elementState } = createElement(
        libraryItem(itemId),
        currentSegment,
        currentSlide.states,
        segment.stage,
      );
      dispatch({ type: 'addElement', element, state: elementState });
    },
    [currentSegment, currentSlide.states, segment.stage],
  );

  /**
   * Шаблон правит elements, слайды и gates разом — ОДИН шаг истории на кнопку
   * (действие `applyTemplate`, а не отдельные addElement/addSlide/addGate по
   * очереди, которые historyReducer положил бы в историю по одному).
   */
  const handleApplyTemplate = useCallback((templateId: string) => {
    dispatch({ type: 'applyTemplate', template: sceneTemplate(templateId) });
  }, []);

  /**
   * Сообщение о каскаде после удаления элемента.
   *
   * Удаление снимает состояние элемента со ВСЕХ слайдов, где оно было.
   * Без сообщения автор видит, что с дорожки исчезло сразу несколько
   * вещей, и это выглядит как баг редактора, а не как его собственное
   * действие. Считается ДО удаления: после него считать уже не по чему.
   */
  const [removalMessage, setRemovalMessage] = useState<string | undefined>(undefined);

  const handleDeleteSelected = useCallback(() => {
    const id = state.selectedId;
    if (id === undefined) return;
    setRemovalMessage(formatRemovalMessage(id, statesOnSlides(segment.slides, id)));
    dispatch({ type: 'removeElement', id });
  }, [state.selectedId, segment.slides]);

  // Ошибка вставки картинки: файл не картинка, либо кодирование не удалось.
  // Падает громко (CLAUDE.md), но громко — это видимое сообщение автору,
  // а не только исключение в консоли.
  const [imageDropError, setImageDropError] = useState<string | undefined>(undefined);

  const handleImageDrop = useCallback(
    (file: File) => {
      setImageDropError(undefined);
      encodeImageFile(file, segment.stage)
        .then((encoded) => {
          const { element, state: elementState } = createImageElement(
            currentSegment,
            currentSlide.states,
            segment.stage,
            encoded,
          );
          dispatch({ type: 'addElement', element, state: elementState });
        })
        .catch((error: unknown) => {
          setImageDropError(error instanceof Error ? error.message : String(error));
        });
    },
    [currentSegment, currentSlide.states, segment.stage],
  );

  const elementRows = useMemo(
    () => toRows(segment.elements, currentSlide.states),
    [segment.elements, currentSlide.states],
  );

  /**
   * Метки на дорожке: гейты и слайды (кроме первого — он обязан стоять
   * на нуле и не может быть сдвинут, `state/project.ts`, `moveMark`).
   * Показывать его как перетаскиваемую метку значило бы предлагать жест,
   * который редьюсер тут же отвергнет броском посреди перетаскивания.
   *
   * Секунды считаются из TimeRef здесь, а не хранятся: инвариант №10 требует,
   * чтобы в проекте лежала ссылка на слово, а не результат её разрешения.
   */
  const marks = useMemo((): Mark[] => {
    const words = segment.words;
    const fromGates = segment.gates.map((gate): Mark => ({
      kind: 'gate',
      id: gate.id,
      seconds: markSeconds(gate.at, words),
      onWord: gate.at.kind === 'word',
      // Подсказка автору при наведении: словами продукта, а не схемы.
      // Развилка от вопроса отличается отсутствием верного ответа.
      title: `${gate.config.kind === 'choice' && gate.config.correctId === null ? 'Развилка' : 'Остановка'} «${gate.id}»`,
    }));
    const fromSlides = segment.slides.slice(1).map((slide): Mark => ({
      kind: 'slide',
      id: slide.id,
      seconds: markSeconds(slide.at, words),
      onWord: slide.at.kind === 'word',
      title: `Слайд «${slide.id}»: переход ${slide.transition === 'morph' ? 'плавный' : 'разрез'}`,
    }));
    return [...fromGates, ...fromSlides];
  }, [segment]);

  const handleMoveMark = useCallback(
    (kind: MarkKind, id: string, seconds: number) => {
      // Перетаскивание метки — жест, как и перетаскивание элемента: событие
      // приходит на каждый pointermove и обязано остаться «живым», иначе
      // Ctrl+Z будет отменять один кадр протаскивания, а не жест целиком.
      // Коммит-точку ставит handleCommitHistory на pointerup (см. TrackView).
      dispatch({
        type: 'moveMark',
        kind,
        id,
        at: timeRefAt(segment.words, seconds),
        commit: false,
      });
    },
    [segment.words],
  );

  const handleAddGate = useCallback(() => {
    const id = freeId('gate', currentSegment.gates);
    const gate = createGate(id, timeRefAt(segment.words, transport.positionSeconds));
    dispatch({ type: 'addGate', gate });
    dispatch({ type: 'select', id: undefined });
    setSelectedMark({ kind: 'gate', id: gate.id });
  }, [currentSegment.gates, segment.words, transport.positionSeconds]);

  // Ссылка стабильна: иначе эффект в StageView считал бы её изменившейся
  // на каждый рендер и пересобирал сцену по десять раз в секунду.
  const handleReady = useCallback(
    (preview: ScenePreview | null) => {
      // Для проверок в браузере и e2e: доступ к предпросмотру без раскопок по DOM.
      (window as unknown as { __preview: ScenePreview | null }).__preview = preview;
      onReady?.(preview);
    },
    [onReady],
  );

  // Тоже для тестов: сохранённый проект должен сверяться с тем, что на экране,
  // а лезть за ним в React иначе неоткуда. В эффекте, а не в теле рендера:
  // рендер React вправе выбросить, и тогда снаружи оказалось бы состояние,
  // которого на экране никогда не было.
  useLayoutEffect(() => {
    (window as unknown as { __project: Project }).__project = currentProject;
  }, [currentProject]);

  /**
   * Клавиатура (срез 6). `keyToIntent` — чистая таблица без React и DOM
   * (`keyboard.ts`); этот эффект только собирает контекст из фактического
   * состояния и вызывает её, как и требует ADR-010.
   *
   * Слушатель на `window`, а не React-обработчик на корневом `<div>`: фокус
   * в момент нажатия может стоять на `document.body` (например, сразу после
   * загрузки страницы, до первого клика), а `body` — предок этого `<div>`,
   * а не потомок, и событие до него по всплытию не дошло бы вовсе.
   *
   * `inTextField` читается из `document.activeElement` В МОМЕНТ события,
   * а не из состояния редактора: состояние легко рассинхронизировать
   * (забыть сбросить флаг на blur), а активный элемент — источник истины,
   * который никогда не соврёт.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement;
      const context: KeyContext = {
        hasSelection: state.selectedId !== undefined,
        // Правка текста на холсте (двойной клик по элементу, StageView.
        // beginTextEdit) ставит узлу contentEditable и фокусирует его —
        // проверка честная (реальное свойство DOM активного элемента),
        // а не флаг, который можно забыть сбросить.
        editingText: active instanceof HTMLElement && active.isContentEditable,
        inTextField: isTextFieldNode(active),
      };
      const intent = keyToIntent(event, context);
      if (!intent) return; // не наша клавиша — Tab и всё остальное продолжает жить своей жизнью

      event.preventDefault();

      switch (intent.kind) {
        case 'delete':
          handleDeleteSelected();
          return;
        case 'nudge': {
          const id = state.selectedId;
          if (id === undefined) return; // keyToIntent уже проверил hasSelection — здесь просто защита типов
          const currentState = currentSlide.states[id];
          if (!currentState) return; // элемент не появляется на этом слайде — двигать нечего
          dispatch({
            type: 'setElementState',
            elementId: id,
            patch: { x: currentState.x + intent.dx, y: currentState.y + intent.dy },
          });
          return;
        }
        case 'undo':
          dispatch({ type: 'undo' });
          return;
        case 'redo':
          dispatch({ type: 'redo' });
          return;
        case 'deselect':
          handleSelect(undefined);
          return;
        case 'commitText':
          // Escape во время правки текста на холсте. StageView сам знает,
          // какой узел сейчас редактируется, и сам решает, коммитить ли
          // (содержимое могло не измениться) — здесь только мост к нему.
          stageRef.current?.commitTextEdit();
          return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedId, currentSlide, handleDeleteSelected, handleSelect]);

  return (
    <div className="ed-root">
      <header className="ed-header">
        <strong className="ed-title">{currentProject.meta.title}</strong>
        <span className="ed-muted">
          {plural(segment.elements.length, ELEMENTS)} · {plural(segment.gates.length, GATES)}
        </span>
        <span className="ed-actions">
          <button
            type="button"
            className="ed-action"
            onClick={() => dispatch({ type: 'undo' })}
            disabled={!canUndoState(state)}
          >
            Отменить
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={() => dispatch({ type: 'redo' })}
            disabled={!canRedoState(state)}
          >
            Повторить
          </button>
          <button
            type="button"
            className="ed-action"
            onClick={() => downloadProject(currentProject)}
          >
            Сохранить
          </button>
          <button type="button" className="ed-action" onClick={() => openInPlayer(currentProject)}>
            Открыть в плеере
          </button>
        </span>
        <span className="ed-selection" data-testid="selection-readout">
          {selectionReadout}
        </span>
      </header>

      <div className="ed-main">
        <StageView
          ref={stageRef}
          segment={segment}
          currentSlide={currentSlide}
          selectedId={state.selectedId}
          onSelect={handleSelect}
          onElementStateChange={handleElementStateChangeLive}
          onElementContentChange={handleElementContentChange}
          onCommitHistory={handleCommitHistory}
          onImageDrop={handleImageDrop}
          onReady={handleReady}
        />
        <aside className="ed-elements-panel" aria-label="Элементы сцены">
          <InsertPanel onInsert={handleInsert} />
          <TemplatesPanel onApply={handleApplyTemplate} />
          <div className="ed-delete-row">
            <button
              type="button"
              className="ed-action"
              onClick={handleDeleteSelected}
              disabled={state.selectedId === undefined}
            >
              Удалить
            </button>
          </div>
          {removalMessage ? (
            <span className="ed-notice" role="status" data-testid="removal-message">
              {removalMessage}
            </span>
          ) : null}
          {imageDropError ? (
            <span className="ed-failure" role="alert" data-testid="image-drop-error">
              {imageDropError}
            </span>
          ) : null}
          <ElementList rows={elementRows} selectedId={state.selectedId} onSelect={handleSelect} />
          <SlidePanel
            slides={segment.slides}
            words={segment.words}
            currentSlideId={state.currentSlideId}
            onSelect={handleSelectSlide}
            onAdd={handleAddSlide}
            onRemove={handleRemoveSlide}
          />
          <SegmentPanel
            project={currentProject}
            currentSegmentId={state.currentSegmentId}
            onSelectSegment={handleSelectSegment}
            onAddSegment={handleAddSegment}
            onRemoveSegment={handleRemoveSegment}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onAddCondition={handleAddCondition}
            onRemoveCondition={handleRemoveCondition}
          />
        </aside>
        {markData ? (
          <MarkPanel
            mark={markData}
            elements={segment.elements}
            words={segment.words}
            onRetargetMark={handleRetargetMark}
            gateInsideTransition={markData.kind === 'gate'
              && gateInsideTransition(markData.gate, segment.slides, segment.words)}
            onUpdateGate={handleUpdateGate}
            onSetSlideTransition={handleSetSlideTransition}
            onRenameVariable={handleRenameVariable}
            variableProblemOf={variableProblemOf}
            onRemove={handleRemoveMark}
            onSplitAtGate={markData.kind === 'gate'
              ? () => handleSplitAtGate(markData.gate.id)
              : undefined}
            splitBlockedReason={markData.kind === 'gate'
              ? splitBlockedReason(markData.gate, segment.words)
              : undefined}
          />
        ) : (
          <Inspector
            element={selected}
            state={selectedState}
            onContentChange={(content) => {
              if (selected) handleElementContentChange({ ...selected, content });
            }}
            onStateChange={(patch) => {
              if (selected) handleElementStateChange(selected.id, patch);
            }}
            onStateChangeLive={(patch) => {
              if (selected) handleElementStateChangeLive(selected.id, patch);
            }}
            onCommitHistory={handleCommitHistory}
          />
        )}
      </div>

      <TrackView
        transport={transport}
        words={segment.words}
        marks={marks}
        selectedMark={selectedMark}
        onSelectMark={handleSelectMark}
        onMoveMark={handleMoveMark}
        onMoveMarkEnd={handleCommitHistory}
        onAddGate={handleAddGate}
      />
    </div>
  );
}

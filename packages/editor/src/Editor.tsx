/**
 * Корень редактора: раскладка и состояние.
 *
 * Держит редактируемый проект (обёрнутый историей отмены/повтора,
 * `state/editorHistory.ts`) и выделение. Всё остальное — производное:
 * момент на дорожке приходит от транспорта, геометрия элементов от жестов,
 * картинка от предпросмотра из плеера.
 *
 * Компоненты ниже — только вид. Логика живёт в модулях, которые про React
 * не знают: state/project (редьюсер), state/editorHistory (отмена/повтор),
 * state/gates и state/animation (правила панели метки), keyboard (раскладка
 * клавиатуры), stage/geometry и stage/transform (координаты и жесты),
 * track/transport (звук), track/peaks (волна). Каждый из них покрыт юнитами.
 * Переписать интерфейс — значит заменить компоненты и styles.ts, не трогая
 * ни одной проверенной строчки.
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

import type { Cue, Element, Gate, Project } from '@player/core';
import { segmentOf, type ScenePreview } from '@player/player';

import { keyToIntent, type KeyContext } from './keyboard.js';
import { ElementList } from './panels/ElementList.js';
import { toRows } from './panels/elementRows.js';
import { Inspector } from './panels/Inspector.js';
import { InsertPanel } from './panels/InsertPanel.js';
import { MarkPanel, type SelectedMarkData } from './panels/MarkPanel.js';
import { formatRemovalMessage } from './panels/removalMessage.js';
import { canRedoState, canUndoState, historyReducer, initialHistoryState } from './state/editorHistory.js';
import { createElement, type ElementType } from './state/elements.js';
import { createImageElement, encodeImageFile } from './state/image.js';
import { freeId, type MarkKind } from './state/project.js';
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

  // Единственная точка, через которую редактор видит дорожку и сцену.
  // Когда проект станет графом сегментов, поменяется segmentOf, а не это
  // место и не всё, что ниже (docs/planning.md §5а).
  const segment = useMemo(() => segmentOf(currentProject), [currentProject]);

  const transport = useTransport(segment.src, segment.duration);

  const selected =
    state.selectedId === undefined
      ? undefined
      : segment.scene.elements.find((element) => element.id === state.selectedId);

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
      const gate = segment.scene.gates.find((candidate) => candidate.id === selectedMark.id);
      return gate ? { kind: 'gate', gate } : undefined;
    }
    const cue = segment.scene.cues.find((candidate) => candidate.id === selectedMark.id);
    return cue ? { kind: 'cue', cue } : undefined;
  }, [selectedMark, segment.scene.gates, segment.scene.cues]);

  // Метка могла исчезнуть не только через кнопку удаления, но и через Ctrl+Z
  // (отмена её добавления) — тот же случай, что и «выделенного элемента нет
  // в восстановленном проекте» для state.selectedId, только selectedMark
  // здесь не часть history и сама себя не проверяет.
  useEffect(() => {
    if (selectedMark && !markData) setSelectedMark(undefined);
  }, [selectedMark, markData]);

  const handleSelect = useCallback((id: string | undefined) => {
    // Новое выделение — старое сообщение об удалении больше не относится
    // к делу и не обязано висеть на экране до следующего удаления.
    setRemovalMessage(undefined);
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
    dispatch({ type: 'removeMark', kind: selectedMark.kind, id: selectedMark.id });
    setSelectedMark(undefined);
  }, [selectedMark]);

  const handleUpdateGate = useCallback((gate: Gate) => dispatch({ type: 'updateGate', gate }), []);
  const handleUpdateCue = useCallback((cue: Cue) => dispatch({ type: 'updateCue', cue }), []);

  /**
   * Одношаговая правка элемента — например, смена цвета в системном пикере
   * или текста в поле панели. Каждый вызов становится САМОСТОЯТЕЛЬНЫМ шагом
   * истории (срез 2).
   */
  const handleElementChange = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element });
  }, []);

  /**
   * Живое событие уже идущего жеста — перетаскивание на сцене, набор числа
   * в панели свойств. НЕ создаёт шаг истории само по себе: коммит-точку
   * ставит `handleCommitHistory` (см. `state/editorHistory.ts`).
   */
  const handleElementChangeLive = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element, commit: false });
  }, []);

  /** Завершает жест, открытый `handleElementChangeLive`/`handleMoveMark`. */
  const handleCommitHistory = useCallback(() => dispatch({ type: 'commit' }), []);

  const handleInsert = useCallback(
    (type: ElementType) => {
      const element = createElement(type, segment.scene, segment.stage);
      dispatch({ type: 'addElement', element });
    },
    [segment.scene, segment.stage],
  );

  // Сообщение о каскадном удалении — состояние вида, а не проекта: сколько
  // анимаций пропало вместе с последним удалённым элементом, интересно
  // прямо сейчас и не обязано переживать переписку интерфейса.
  const [removalMessage, setRemovalMessage] = useState<string | undefined>(undefined);

  const handleDeleteSelected = useCallback(() => {
    const id = state.selectedId;
    if (id === undefined) return;
    // Считаем каскад ДО диспатча: после удаления элемента cues уже вырезаны,
    // и узнать, сколько их было, будет неоткуда.
    const removedCueCount = segment.scene.cues.filter((cue) => cue.targetId === id).length;
    dispatch({ type: 'removeElement', id });
    setRemovalMessage(formatRemovalMessage(id, removedCueCount));
  }, [state.selectedId, segment.scene.cues]);

  // Ошибка вставки картинки: файл не картинка, либо кодирование не удалось.
  // Падает громко (CLAUDE.md), но громко — это видимое сообщение автору,
  // а не только исключение в консоли.
  const [imageDropError, setImageDropError] = useState<string | undefined>(undefined);

  const handleImageDrop = useCallback(
    (file: File) => {
      setImageDropError(undefined);
      encodeImageFile(file, segment.stage)
        .then((encoded) => {
          const element = createImageElement(segment.scene, segment.stage, encoded);
          dispatch({ type: 'addElement', element });
        })
        .catch((error: unknown) => {
          setImageDropError(error instanceof Error ? error.message : String(error));
        });
    },
    [segment.scene, segment.stage],
  );

  const elementRows = useMemo(() => toRows(segment.scene.elements), [segment.scene.elements]);

  /**
   * Метки на дорожке.
   *
   * Секунды считаются из TimeRef здесь, а не хранятся: инвариант №10 требует,
   * чтобы в проекте лежала ссылка на слово, а не результат её разрешения.
   * Разрешение падает громко, если якорь разошёлся со словом, — и это
   * правильно: тихо показать метку не там, где она сработает, хуже.
   */
  const marks = useMemo((): Mark[] => {
    const words = segment.words;
    const fromCues = segment.scene.cues.map((cue): Mark => ({
      kind: 'cue',
      id: cue.id,
      seconds: markSeconds(cue.at, words),
      onWord: cue.at.kind === 'word',
      title: `Анимация «${cue.id}»: ${cue.animation.property} у «${cue.targetId}»`,
    }));
    const fromGates = segment.scene.gates.map((gate): Mark => ({
      kind: 'gate',
      id: gate.id,
      seconds: markSeconds(gate.at, words),
      onWord: gate.at.kind === 'word',
      title: `Гейт «${gate.id}»: ${gate.config.kind}`,
    }));
    return [...fromCues, ...fromGates];
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

  const handleAddCue = useCallback(() => {
    if (!selected) throw new Error('Анимацию некуда вешать: элемент не выделен');
    const cue: Cue = {
      id: freeId('cue', segment.scene.cues),
      at: timeRefAt(segment.words, transport.positionSeconds),
      targetId: selected.id,
      // Проявление — самая частая анимация и самая понятная по умолчанию.
      // Автор поменяет свойство в панели; выдумывать выбор в момент
      // создания значит спрашивать до того, как есть что спрашивать.
      animation: { property: 'opacity', from: 0, to: 1, duration: 400, ease: 'outQuad' },
    };
    dispatch({ type: 'addCue', cue });
    // Автор тут же попадает в панель настройки только что созданной анимации.
    dispatch({ type: 'select', id: undefined });
    setSelectedMark({ kind: 'cue', id: cue.id });
  }, [selected, segment.scene.cues, segment.words, transport.positionSeconds]);

  const handleAddGate = useCallback(() => {
    const gate: Gate = {
      id: freeId('gate', segment.scene.gates),
      at: timeRefAt(segment.words, transport.positionSeconds),
      // «Дальше» — гейт без вопроса. Он останавливает и ждёт, и это
      // единственный вид, который осмыслен без дополнительной настройки.
      config: { kind: 'continue', label: 'Дальше' },
      onWrong: 'retry',
      maxAttempts: null,
    };
    dispatch({ type: 'addGate', gate });
    dispatch({ type: 'select', id: undefined });
    setSelectedMark({ kind: 'gate', id: gate.id });
  }, [segment.scene.gates, segment.words, transport.positionSeconds]);

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
          const target = segment.scene.elements.find((element) => element.id === id);
          if (!target) return;
          dispatch({
            type: 'replaceElement',
            element: { ...target, x: target.x + intent.dx, y: target.y + intent.dy },
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
  }, [state.selectedId, segment.scene.elements, handleDeleteSelected, handleSelect]);

  return (
    <div className="ed-root">
      <header className="ed-header">
        <strong className="ed-title">{currentProject.meta.title}</strong>
        <span className="ed-muted">
          {segment.scene.elements.length} элементов · {segment.scene.cues.length} анимаций ·{' '}
          {segment.scene.gates.length} гейтов
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
          {selected
            ? `${selected.id}: ${selected.x} × ${selected.y}, ${selected.width}×${selected.height}, ${selected.rotation}°`
            : 'ничего не выделено'}
        </span>
      </header>

      <div className="ed-main">
        <StageView
          ref={stageRef}
          segment={segment}
          positionSeconds={transport.positionSeconds}
          selectedId={state.selectedId}
          onSelect={handleSelect}
          onElementChange={handleElementChangeLive}
          onCommitHistory={handleCommitHistory}
          onImageDrop={handleImageDrop}
          onReady={handleReady}
        />
        <aside className="ed-elements-panel" aria-label="Элементы сцены">
          <InsertPanel onInsert={handleInsert} />
          <div className="ed-delete-row">
            <button
              type="button"
              className="ed-action"
              onClick={handleDeleteSelected}
              disabled={state.selectedId === undefined}
            >
              Удалить
            </button>
            {removalMessage ? (
              <span className="ed-delete-msg" role="status" data-testid="removal-message">
                {removalMessage}
              </span>
            ) : null}
          </div>
          {imageDropError ? (
            <span className="ed-failure" role="alert" data-testid="image-drop-error">
              {imageDropError}
            </span>
          ) : null}
          <ElementList rows={elementRows} selectedId={state.selectedId} onSelect={handleSelect} />
        </aside>
        {markData ? (
          <MarkPanel
            mark={markData}
            elements={segment.scene.elements}
            onUpdateGate={handleUpdateGate}
            onUpdateCue={handleUpdateCue}
            onRemove={handleRemoveMark}
          />
        ) : (
          <Inspector
            element={selected}
            onChange={handleElementChange}
            onLiveChange={handleElementChangeLive}
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
        onAddCue={handleAddCue}
        onAddGate={handleAddGate}
        canAddCue={selected !== undefined}
      />
    </div>
  );
}

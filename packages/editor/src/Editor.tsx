/**
 * Корень редактора: раскладка и состояние.
 *
 * Держит редактируемый проект и выделение. Всё остальное — производное:
 * момент на дорожке приходит от транспорта, геометрия элементов от жестов,
 * картинка от предпросмотра из плеера.
 *
 * Компоненты ниже — только вид. Логика живёт в модулях, которые про React
 * не знают: state/project (редьюсер), stage/geometry и stage/transform
 * (координаты и жесты), track/transport (звук), track/peaks (волна).
 * Каждый из них покрыт юнитами. Переписать интерфейс — значит заменить
 * компоненты и styles.ts, не трогая ни одной проверенной строчки.
 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  type ReactElement,
} from 'react';

import type { Cue, Element, Gate, Project } from '@player/core';
import { segmentOf, type ScenePreview } from '@player/player';

import { Inspector } from './panels/Inspector.js';
import { editorReducer, freeId, initialState, type MarkKind } from './state/project.js';
import { downloadProject, openInPlayer } from './state/save.js';
import { StageView } from './stage/StageView.js';
import { markSeconds, timeRefAt } from './track/marks.js';
import type { Mark } from './track/MarksLane.js';
import { TrackView } from './track/TrackView.js';
import { useTransport } from './track/useTransport.js';

export interface EditorProps {
  project: Project;
  /** Сообщает хосту, что сцена построена. Вызывается с null при снятии. */
  onReady?: (preview: ScenePreview | null) => void;
}

export function Editor({ project, onReady }: EditorProps): ReactElement {
  const [state, dispatch] = useReducer(editorReducer, project, initialState);

  // Единственная точка, через которую редактор видит дорожку и сцену.
  // Когда проект станет графом сегментов, поменяется segmentOf, а не это
  // место и не всё, что ниже (docs/planning.md §5а).
  const segment = useMemo(() => segmentOf(state.project), [state.project]);

  const transport = useTransport(segment.src, segment.duration);

  const selected =
    state.selectedId === undefined
      ? undefined
      : segment.scene.elements.find((element) => element.id === state.selectedId);

  const handleSelect = useCallback((id: string | undefined) => {
    dispatch({ type: 'select', id });
  }, []);

  const handleElementChange = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element });
  }, []);

  // Выделение метки — состояние вида, а не проекта: в файл оно не попадает
  // и переписку интерфейса переживать не обязано.
  const [selectedMark, setSelectedMark] = useState<{ kind: MarkKind; id: string } | undefined>(
    undefined,
  );

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
      // Привязка к слову решается здесь, в чистой функции, а не в компоненте:
      // это правило продукта, а не свойство интерфейса.
      dispatch({ type: 'moveMark', kind, id, at: timeRefAt(segment.words, seconds) });
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
    (window as unknown as { __project: Project }).__project = state.project;
  }, [state.project]);

  return (
    <div className="ed-root">
      <header className="ed-header">
        <strong className="ed-title">{state.project.meta.title}</strong>
        <span className="ed-muted">
          {segment.scene.elements.length} элементов · {segment.scene.cues.length} анимаций ·{' '}
          {segment.scene.gates.length} гейтов
        </span>
        <span className="ed-actions">
          <button
            type="button"
            className="ed-action"
            onClick={() => downloadProject(state.project)}
          >
            Сохранить
          </button>
          <button type="button" className="ed-action" onClick={() => openInPlayer(state.project)}>
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
          segment={segment}
          positionSeconds={transport.positionSeconds}
          selectedId={state.selectedId}
          onSelect={handleSelect}
          onElementChange={handleElementChange}
          onReady={handleReady}
        />
        <aside className="ed-inspector" aria-label="Свойства элемента">
          <Inspector element={selected} onChange={handleElementChange} />
        </aside>
      </div>

      <TrackView
        transport={transport}
        words={segment.words}
        marks={marks}
        selectedMark={selectedMark}
        onSelectMark={(kind, id) => setSelectedMark({ kind, id })}
        onMoveMark={handleMoveMark}
        onAddCue={handleAddCue}
        onAddGate={handleAddGate}
        canAddCue={selected !== undefined}
      />
    </div>
  );
}

/**
 * Корень редактора.
 *
 * Держит редактируемый проект, выделение и момент, на котором показана сцена.
 * Всё остальное — производное от этих трёх величин.
 */
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
  type ReactElement,
} from 'react';

import type { Element, Project } from '@player/core';
import { segmentOf, type ScenePreview } from '@player/player';

import { editorReducer, initialState } from './state/project.js';
import { StageView } from './stage/StageView.js';

export interface EditorProps {
  project: Project;
  /** Сообщает хосту, что сцена построена. Вызывается с null при снятии. */
  onReady?: (preview: ScenePreview | null) => void;
}

export function Editor({ project, onReady }: EditorProps): ReactElement {
  const [state, dispatch] = useReducer(editorReducer, project, initialState);
  const [positionSeconds, setPositionSeconds] = useState(0);

  // Единственная точка, через которую редактор видит дорожку и сцену.
  // Когда проект станет графом сегментов, поменяется segmentOf, а не это
  // место и не всё, что ниже (docs/planning.md §5а).
  const segment = useMemo(() => segmentOf(state.project), [state.project]);

  const selected = state.selectedId === undefined
    ? undefined
    : segment.scene.elements.find((element) => element.id === state.selectedId);

  const handleSelect = useCallback((id: string | undefined) => {
    dispatch({ type: 'select', id });
  }, []);

  const handleElementChange = useCallback((element: Element) => {
    dispatch({ type: 'replaceElement', element });
  }, []);

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
        <strong>{state.project.meta.title}</strong>
        <span className="ed-muted">
          {segment.scene.elements.length} элементов · {segment.scene.cues.length} анимаций ·{' '}
          {segment.scene.gates.length} гейтов
        </span>
        <span className="ed-selection" data-testid="selection-readout">
          {selected
            ? `${selected.id}: ${selected.x} × ${selected.y}, ${selected.width}×${selected.height}, ${selected.rotation}°`
            : 'ничего не выделено'}
        </span>
      </header>

      <StageView
        segment={segment}
        positionSeconds={positionSeconds}
        selectedId={state.selectedId}
        onSelect={handleSelect}
        onElementChange={handleElementChange}
        onReady={handleReady}
      />

      {/*
        Временная перемотка на время слоя взаимодействия. Настоящая дорожка
        со звуком и волной приходит следующим срезом и заменит этот ввод.
      */}
      <footer className="ed-footer">
        <input
          className="ed-seek"
          type="range"
          min={0}
          max={segment.duration}
          step={0.01}
          value={positionSeconds}
          aria-label="Момент на дорожке"
          onChange={(event) => setPositionSeconds(Number(event.target.value))}
        />
        <code className="ed-time">{positionSeconds.toFixed(2)}</code>
      </footer>
    </div>
  );
}

/**
 * @player/player — рантайм плеера.
 *
 * Инвариант №6: этот пакет импортирует core и не знает про editor.
 * Инвариант №9: собирается в самостоятельный ESM-бандл без фреймворка.
 */
// Загрузка с валидацией переэкспортируется наружу намеренно: плеер —
// публичная поверхность для встраивания, и принимать непроверенный проект
// он не должен ни в одном сценарии, включая голый HTML без сборщика.
export { loadProject, ProjectLoadError, type Project } from '@player/core';

export { AudioClock, loadTrack, type ClockDiagnostics, type TrackLoad } from './clock.js';
export {
  applyElement,
  applyFit,
  fitStage,
  renderScene,
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  type Fit,
  type StageSize,
} from './render.js';
export { ScenePreview, segmentOf, type Segment } from './preview.js';
export {
  buildTimeline,
  disableEngineMainLoop,
  type BuildTimelineOptions,
  type DrivenTimeline,
} from './timeline.js';
export {
  isCorrect,
  Player,
  type GateAnswer,
  type GateAttempt,
  type PlayerEvents,
  type PlayerState,
  type UnboundOption,
} from './player.js';

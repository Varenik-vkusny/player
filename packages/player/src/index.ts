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

export {
  getAudio,
  putAudio,
  releaseAudioUrl,
  resolveAudioUrl,
  type AudioSource,
  type StoredAudio,
} from './assets.js';
export {
  AudioClock,
  AudioClocks,
  loadTrack,
  type Clock,
  type ClockDiagnostics,
  type ClockSource,
  type ClockStartOptions,
  type TrackLoad,
} from './clock.js';
export {
  buildMorph,
  indexAt,
  layoutStatesFor,
  morphSecondsFor,
  phaseAt,
  planMorph,
  MORPH_DURATION_S,
  type MorphPart,
  type MorphRole,
  type MorphTimeline,
  type Phase,
  type SlideSchedule,
} from './morph.js';
export {
  applyElement,
  applyFit,
  fitStage,
  renderScene,
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  type Fit,
  type SlideStates,
  type StageSize,
} from './render.js';
export { allSegments, entrySegmentOf, ScenePreview, segmentOf, type Segment } from './preview.js';
export { answersToClear, openableGates } from './repeat.js';
export { SlideEngine, type SlideEngineOptions } from './slides.js';
export {
  isCorrect,
  Player,
  type GateAnswer,
  type GateAttempt,
  type PlayerEvents,
  type PlayerState,
  type Reveal,
  type UnboundOption,
} from './player.js';

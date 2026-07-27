/**
 * @player/player — рантайм плеера.
 *
 * Инвариант №6: этот пакет импортирует core и не знает про editor.
 * Инвариант №9: собирается в самостоятельный ESM-бандл без фреймворка.
 */
export { AudioClock, loadTrack, type ClockDiagnostics, type TrackLoad } from './clock.js';
export {
  applyFit,
  fitStage,
  renderScene,
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  type Fit,
  type StageSize,
} from './render.js';
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
} from './player.js';

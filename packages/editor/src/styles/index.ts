/**
 * Оформление редактора.
 *
 * Строкой, а не отдельным .css: пакет отдаётся хосту исходниками, и импорт
 * стилей заставил бы всякого, кто его встраивает, настраивать обработку CSS
 * у себя. Тут ровно та же логика, по которой плеер собирается без внешних
 * зависимостей — встраивание не должно требовать обвязки.
 *
 * Сцену это почти не касается: правила отсюда не адресуют .scene-el и не
 * задают внешний вид — его задаёт только проект, иначе редактор показывал бы
 * не то, что увидит зритель. Единственное исключение — .ed-stage-host
 * [contenteditable] ниже: это не про внешний вид, а про то же самое
 * исключение из user-select: none, что и у .ed-words-body и полей инспектора,
 * и действует оно только пока StageView сам включил contenteditable на время
 * правки текста (см. «Правка текста на холсте» в docs/specs).
 */
import { TOKENS_CSS } from './tokens.js';
import { CHROME_CSS } from './chrome.js';
import { STAGE_CSS } from './stage.js';
import { PROPBAR_CSS } from './propbar.js';
import { CONTROLS_CSS } from './controls.js';
import { CATALOG_CSS } from './catalog.js';
import { CANVAS_CSS } from './canvas.js';
import { SLIDES_CSS } from './slides.js';
import { BRANCHES_CSS } from './branches.js';
import { CHAPTER_CSS } from './chapter.js';
import { TRACK_CSS } from './track.js';
import { FIELDS_CSS } from './fields.js';
import { MARKS_CSS } from './marks.js';
import { PANELS_CSS } from './panels.js';

/**
 * Порядок склейки НЕСУЩИЙ, а не косметический.
 *
 * В проекте измерено, что тот же селектор, поставленный РАНЬШЕ базовых
 * правил, проигрывает, а поставленный позже — выигрывает. Значит перестановка
 * двух кусков местами меняет то, что видно на экране, не вызвав ни одной
 * ошибки. Порядок ниже — тот же, в котором эти правила лежали одним файлом
 * до разреза 28.08.2026, и менять его можно только сознательно.
 *
 * Проверено: собранная строка совпадает с дореза́нной ПОБАЙТОВО
 * (224 186 знаков, sha256 58258c84…) — тест styles-parts.test.ts.
 */
export const EDITOR_STYLES = [
  TOKENS_CSS,
  CHROME_CSS,
  STAGE_CSS,
  PROPBAR_CSS,
  CONTROLS_CSS,
  CATALOG_CSS,
  CANVAS_CSS,
  SLIDES_CSS,
  BRANCHES_CSS,
  CHAPTER_CSS,
  TRACK_CSS,
  FIELDS_CSS,
  MARKS_CSS,
  PANELS_CSS,
].join('');

import { describe, it, expect } from 'vitest';
import { EDITOR_STYLES } from '../src/styles/index.js';
import { TOKENS_CSS } from '../src/styles/tokens.js';
import { CHROME_CSS } from '../src/styles/chrome.js';
import { STAGE_CSS } from '../src/styles/stage.js';
import { PROPBAR_CSS } from '../src/styles/propbar.js';
import { CONTROLS_CSS } from '../src/styles/controls.js';
import { CATALOG_CSS } from '../src/styles/catalog.js';
import { CANVAS_CSS } from '../src/styles/canvas.js';
import { SLIDES_CSS } from '../src/styles/slides.js';
import { BRANCHES_CSS } from '../src/styles/branches.js';
import { CHAPTER_CSS } from '../src/styles/chapter.js';
import { TRACK_CSS } from '../src/styles/track.js';
import { FIELDS_CSS } from '../src/styles/fields.js';
import { MARKS_CSS } from '../src/styles/marks.js';
import { PANELS_CSS } from '../src/styles/panels.js';

/**
 * Лист стилей редактора разрезан на части 28.08.2026. Разрез был проверен
 * побайтовой сверкой с дореза́нной строкой (224 186 знаков) — та сверка
 * одноразовая и снята.
 *
 * Здесь остаётся то, что имеет смысл стеречь ДАЛЬШЕ: порядок склейки.
 * В проекте измерено, что тот же селектор раньше базовых правил проигрывает,
 * а позже — выигрывает. Значит перестановка двух частей местами меняет
 * картинку на экране, НЕ вызвав ни одной ошибки: ни типы, ни сборка этого
 * не заметят. Стеречь порядок больше некому.
 */
const PARTS_IN_ORDER: ReadonlyArray<readonly [string, string]> = [
  ['tokens', TOKENS_CSS], ['chrome', CHROME_CSS], ['stage', STAGE_CSS],
  ['propbar', PROPBAR_CSS], ['controls', CONTROLS_CSS], ['catalog', CATALOG_CSS],
  ['canvas', CANVAS_CSS], ['slides', SLIDES_CSS], ['branches', BRANCHES_CSS],
  ['chapter', CHAPTER_CSS], ['track', TRACK_CSS], ['fields', FIELDS_CSS],
  ['marks', MARKS_CSS], ['panels', PANELS_CSS],
];

describe('лист стилей редактора собран из частей', () => {
  it('в общий лист попала КАЖДАЯ часть и ровно один раз', () => {
    for (const [name, css] of PARTS_IN_ORDER) {
      expect(EDITOR_STYLES.includes(css), `часть ${name} не попала в лист`).toBe(true);
      expect(EDITOR_STYLES.indexOf(css), `часть ${name} попала дважды`).toBe(
        EDITOR_STYLES.lastIndexOf(css),
      );
    }
  });

  it('части идут в объявленном порядке, а не как попало', () => {
    const positions = PARTS_IN_ORDER.map(([name, css]) => [name, EDITOR_STYLES.indexOf(css)] as const);
    const sorted = [...positions].sort((a, b) => a[1] - b[1]);
    expect(sorted.map(([n]) => n)).toEqual(PARTS_IN_ORDER.map(([n]) => n));
  });

  it('склейка не добавила и не потеряла ни знака', () => {
    const sum = PARTS_IN_ORDER.reduce((n, [, css]) => n + css.length, 0);
    expect(EDITOR_STYLES.length).toBe(sum);
  });
});

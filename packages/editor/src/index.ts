/**
 * @player/editor — редактор объяснений.
 *
 * Инвариант №6: пакет импортирует player и core и не знает ни про стенд,
 * ни про что-либо выше. Обратных импортов нет и быть не может — в tsconfig
 * нет пути наверх.
 *
 * Инвариант №5: сцену рисует ScenePreview из плеера. Своего рендера
 * у редактора нет ни строчки.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import type { Project } from '@player/core';
import type { ScenePreview } from '@player/player';

import { Editor, type EditorProps } from './Editor.js';
import { EDITOR_STYLES } from './styles/index.js';

const STYLE_ID = 'player-editor-styles';

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = EDITOR_STYLES;
  doc.head.appendChild(style);
}

export interface MountOptions {
  /**
   * Вызывается, когда сцена построена, и ещё раз с null, когда снята.
   *
   * Событием, а не опросом. Хост обязан как-то узнать о готовности —
   * и первая версия стенда опрашивала глобальную переменную через
   * requestAnimationFrame. В фоновой вкладке rAF не срабатывает вовсе,
   * поэтому страница зависала навсегда, не показывая никакой ошибки.
   */
  onReady?: (preview: ScenePreview | null) => void;
  /**
   * Принадлежит ли слот работы этой вкладке. `false` — только смотреть.
   * Умолчание `true`: хост, который про слот не знает, работает как раньше.
   */
  canWrite?: boolean;
  /** Откуда пришла работа: имя фикстуры или имя открытого файла. */
  origin?: string;
}

/**
 * Монтирует редактор в контейнер. Возвращает функцию, которая его снимает.
 *
 * Проект принимается уже проверенным: валидация — дело того, кто его
 * загрузил, и она обязана падать громко там, а не здесь.
 */
export function mountEditor(
  host: HTMLElement,
  project: Project,
  options: MountOptions = {},
): () => void {
  ensureStyles(host.ownerDocument);
  const root = createRoot(host);

  // Поля добавляются по одному, а не спредом с undefined: при
  // `exactOptionalPropertyTypes` присутствие ключа со значением undefined
  // и его отсутствие — разные вещи, и первое не подходит под `?:`.
  const props: EditorProps = { project };
  if (options.onReady !== undefined) props.onReady = options.onReady;
  if (options.canWrite !== undefined) props.canWrite = options.canWrite;
  if (options.origin !== undefined) props.origin = options.origin;

  root.render(createElement(Editor, props));
  return () => root.unmount();
}

export { Editor, type EditorProps } from './Editor.js';

/**
 * Слот работы автора. Нужен стенду: он решает, откуда взять проект при
 * открытии вкладки, и он же объявляет слот своим до монтирования редактора.
 */
export {
  saveWork,
  readWork,
  clearWork,
  claimWorkSlot,
  WORK_KEY,
  WORK_LOCK,
  type StoredWork,
} from './state/workspace.js';
export { openProjectFile } from './state/save.js';

/**
 * Второе окно: дерево веток во весь экран (`docs/design/tracks.md` §4).
 *
 * Экспорт через баррель, а не прямой путь к файлу из стенда: пакет обязан
 * иметь ровно одну дверь наружу, иначе «инвариант №6: обратных импортов
 * нет» держится только на честном слове. Кроме того, прямой путь к
 * `src/BranchesWindow.js` открывал бы стенду и все внутренности пакета.
 */
export { BranchesWindow } from './BranchesWindow.js';

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

import { Editor } from './Editor.js';
import { EDITOR_STYLES } from './styles.js';

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
  root.render(
    createElement(Editor, options.onReady ? { project, onReady: options.onReady } : { project }),
  );
  return () => root.unmount();
}

export { Editor, type EditorProps } from './Editor.js';

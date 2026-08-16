/**
 * Стенд второго окна: дерево веток во весь экран (`docs/design/tracks.md` §4).
 *
 * Точка входа не решает НИЧЕГО про проект — второе окно само ничего
 * не хранит и получает состояние от главного окна через `BroadcastChannel`
 * (`secondWindow.ts`). Здесь только монтирование, как в `editor.ts`.
 *
 * `BranchesWindow` берётся ЧЕРЕЗ БАРРЕЛЬ `@player/editor`, а не прямым
 * путём к исходнику. У пакета ровно одна дверь наружу: прямой путь открыл
 * бы стенду все его внутренности и оставил бы инвариант №6 («обратных
 * импортов нет») держаться на честном слове.
 */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { BranchesWindow } from '@player/editor';

async function main(): Promise<void> {
  const host = document.getElementById('branches-host');
  if (!(host instanceof HTMLElement)) throw new Error('В разметке нет #branches-host');

  const root = createRoot(host);
  root.render(createElement(BranchesWindow));

  await document.fonts.ready;
  document.documentElement.dataset['ready'] = '1';
}

void main();

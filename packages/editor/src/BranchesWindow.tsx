/**
 * Второе окно: дерево веток объяснения во весь экран (`docs/design/tracks.md`
 * §4, решение владельца 16.08.2026).
 *
 * ТОЛЬКО ВИД. Окно ничего не хранит (`tracks.md` §6, прямой запрет):
 * состояние проекта приходит от главного окна ТЕКСТОМ на каждое изменение
 * и разбирается заново здесь же, дерево считается заново здесь же. То,
 * что держит `useState`, — не состояние объяснения, а последнее полученное
 * сообщение и мелочи самого вида (сворачивание веток, масштаб) — они уже
 * живут внутри `BranchesView`.
 *
 * Рендер не свой: рисует ту же `BranchesView`, что стоит в виде «Ветки»
 * редактора (`track/BranchesView.tsx`) — один рендер на оба места, как
 * инвариант №5 требует одного рендера на редактор и плеер. Стили — тот же
 * `EDITOR_STYLES`, потому что классы `.ed-branches-*` определены только там;
 * второй набор правил здесь был бы второй реализацией отрисовки.
 *
 * Щелчок по главе и переименование не применяются на месте — это жесты,
 * они уходят обратно в главное окно (`createBranchesClient`), а новое
 * дерево придёт следующим сообщением `state`. Так решает и остальной
 * редактор: панель не решает, решает редьюсер.
 */
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { loadProject, type Project } from '@player/core';

import { branchTree } from './state/branchTree.js';
import { durationRange } from './state/durationRange.js';
import { extractBlockedReason } from './state/extractBranch.js';
import {
  createBranchesClient,
  holdSecondWindowLock,
  type BranchesClient,
  type MainMessage,
} from './state/secondWindow.js';
import { EDITOR_STYLES } from './styles.js';
import { BranchesView } from './track/BranchesView.js';

const STYLE_ID = 'player-editor-styles';

/** Тот же приём, что у `ensureStyles` в `index.ts`: один тег стиля на документ. */
function ensureEditorStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = EDITOR_STYLES;
  doc.head.appendChild(style);
}

/**
 * Правки высоты `.ed-branches-space` под полный экран. Не второй набор
 * значений тех же ролей — `styles.ts` не тронут ни строкой, это только
 * переопределение layout-свойств бОльшей специфичностью (два класса против
 * одного), потому что в редакторе `.ed-branches-space` — 55vh нижней зоны
 * (`styles.ts`, там же и замер, почему это `height`, а не `flex: 1`), а тут
 * дереву отдан весь экран.
 */
const FULLSCREEN_STYLE_ID = 'player-branches-window-styles';
const FULLSCREEN_STYLES = `
.branches-window {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
.branches-window .ed-branches {
  flex: 1 1 auto;
  min-height: 0;
}
.branches-window .ed-branches-space {
  flex: 1 1 auto;
  height: auto;
  min-height: 0;
}
`;

function ensureFullscreenStyles(doc: Document): void {
  if (doc.getElementById(FULLSCREEN_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = FULLSCREEN_STYLE_ID;
  style.textContent = FULLSCREEN_STYLES;
  doc.head.appendChild(style);
}

/** Разобранное состояние проекта, годное к рисованию дерева. */
interface ParsedState {
  readonly project: Project;
  readonly currentSegmentId: string;
}

/**
 * Разбирает текст проекта тем же способом, что и остальной редактор
 * (`loadProject`). Ошибка не глушится: битый текст от главного окна — это
 * поломка транспорта или схемы, а не повод показать пустое дерево вместо
 * настоящей причины.
 */
function parseState(message: { text: string; currentSegmentId: string }): ParsedState {
  const project = loadProject(JSON.parse(message.text));
  return { project, currentSegmentId: message.currentSegmentId };
}

export function BranchesWindow(): ReactElement {
  useEffect(() => {
    ensureEditorStyles(document);
    ensureFullscreenStyles(document);
  }, []);

  // Второе окно объявляет себя живым на весь срок жизни компонента — так
  // главное окно узнаёт, что оно открыто (`isSecondWindowOpen`, замер S10:
  // блокировка снимается за 2 мс даже при крахе рендерера).
  useEffect(() => holdSecondWindowLock(), []);

  const [message, setMessage] = useState<MainMessage | undefined>(undefined);

  // Один клиент на весь срок жизни окна: он и получает состояние (`setMessage`
  // как обработчик), и шлёт жесты обратно. Держим в ref, а не в состоянии —
  // сам клиент не влияет на то, что рисуется, только сообщение влияет.
  const clientRef = useRef<BranchesClient | null>(null);
  useEffect(() => {
    const client = createBranchesClient(setMessage);
    clientRef.current = client;
    return () => {
      clientRef.current = null;
      client.close();
    };
  }, []);

  // Пересчитывается на каждое новое сообщение — окно не хранит дерево между
  // сообщениями, оно каждый раз строит его заново из присланного текста.
  const parsed = useMemo<ParsedState | { readonly error: string } | undefined>(() => {
    if (message === undefined || message.kind !== 'state') return undefined;
    try {
      return parseState(message);
    } catch (error: unknown) {
      // ProjectLoadError.message уже несёт список проблем построчно
      // (load.ts) — второй раз перечислять issues незачем.
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [message]);

  if (message === undefined) {
    return (
      <div className="ed-root branches-window" data-testid="branches-window-waiting">
        <p style={{ margin: 'auto', color: 'var(--ui-content-fg-secondary, #5b6472)' }}>
          Ждём главное окно…
        </p>
      </div>
    );
  }

  if (message.kind === 'closing') {
    return (
      <div className="ed-root branches-window" data-testid="branches-window-closing">
        <p style={{ margin: 'auto', color: 'var(--ui-content-fg-secondary, #5b6472)' }}>
          Главное окно закрылось. Дерево веток больше не обновляется —
          откройте главное окно заново и это окно снова начнёт получать
          состояние.
        </p>
      </div>
    );
  }

  if (parsed !== undefined && 'error' in parsed) {
    return (
      <div className="ed-root branches-window" data-testid="branches-window-error">
        <pre
          style={{ margin: '16px', color: '#d32f2f', whiteSpace: 'pre-wrap', font: '13px/1.5 monospace' }}
        >
          {`Проект, присланный главным окном, не открылся: ${parsed.error}`}
        </pre>
      </div>
    );
  }

  if (parsed === undefined) {
    // Недостижимо при message.kind === 'state': parsed заведомо посчитан
    // выше. Разбирается только затем, чтобы сузить тип для TypeScript.
    return (
      <div className="ed-root branches-window" data-testid="branches-window-waiting">
        <p style={{ margin: 'auto' }}>Ждём главное окно…</p>
      </div>
    );
  }

  const lanes = branchTree(parsed.project);

  /*
   * Вилка и причина отказа считаются ЗДЕСЬ, а не присылаются главным окном,
   * и это не нарушает «второе окно ничего не хранит»: обе — чистые функции
   * от проекта, который у окна и так на руках. Слать их сообщением значило
   * бы завести второй источник правды и разъехаться с главным окном молча.
   *
   * А вот сама ПРАВКА уходит жестом: применяет её редьюсер главного окна,
   * как и переименование. Второе окно просит, но не решает.
   */
  return (
    <div className="ed-root branches-window" data-testid="branches-window-tree">
      <BranchesView
        lanes={lanes}
        currentId={parsed.currentSegmentId}
        onPick={(id) => clientRef.current?.pick(id)}
        onRename={(id, title) => clientRef.current?.rename(id, title)}
        onBadge={(id, badge) => clientRef.current?.badge(id, badge)}
        range={durationRange(parsed.project)}
        extractReason={(ids) => extractBlockedReason(parsed.project, ids)}
        /* Во втором окне панели глав нет: каталог живёт в главном окне,
           на другом мониторе. Дверь ведёт туда же, куда смотрит автор, —
           то есть никуда, и говорит об этом вслух, а не молчит. */
        onOpenChapters={() => {
          throw new Error('Панель глав открывается в главном окне редактора');
        }}
        onExtract={(ids) => clientRef.current?.extract(ids)}
      />
    </div>
  );
}

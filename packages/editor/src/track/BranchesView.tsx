/**
 * Вид «Ветки»: устройство рассказа целиком (`branches.md` §5).
 *
 * Слева — столбик имён веток с длительностями, справа — плитки глав,
 * и ШИРИНА ПЛИТКИ РАВНА ДЛИТЕЛЬНОСТИ ГЛАВЫ. В этом весь смысл вида: автор
 * видит, что одна глава вчетверо длиннее другой, не читая ни одной цифры.
 *
 * Холст сверху при этом НЕ ГАСНЕТ — несущее свойство решения владельца
 * 13.08.2026, а не удобство. Полноэкранный режим карты отвергнут именно
 * потому, что не давал обратной связи картинкой (`branches.md` §10,
 * `map.md` отменён целиком).
 *
 * ЧТО СЮДА НЕ ВОШЛО И ПОЧЕМУ. Показывается ТОЛЬКО основная ветка. Ветки
 * от развилок требуют ответов на пять открытых вопросов `branches.md` §11
 * (наползание десяти веток, предел вложенности, вертикальная прокрутка,
 * пустая ветка, «вынести в ветку»), и угадывать их нельзя — они помечены
 * «требуют ответа владельца ДО того, как их коснётся код». Глава, за которой
 * стоит развилка, помечена хвостом: лента не обрывается молча.
 *
 * Имя ветки не хранится нигде: ветка — вычисляемая цепочка, объекта у неё
 * нет (`branches.md` §1), а схема в этой сессии не трогается. Поэтому имя
 * показано словом «Основная» и автором пока не правится.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';

import { MIN_TILE_PX, tileWidths } from './chapters.js';
import type { ChapterTile } from '../state/exits.js';

export interface BranchesViewProps {
  readonly chapters: readonly ChapterTile[];
  /** Глава, открытая на холсте: её плитка выделена. */
  readonly currentId: string;
  /** Щелчок по плитке — холст показывает эту главу (`branches.md` §5.5). */
  readonly onPick: (id: string) => void;
  /** Двойной щелчок и правка имени. Пустое имя не принимается. */
  readonly onRename: (id: string, title: string) => void;
}

/** Длительность словами автора: «8:02», а не «482 с». */
function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function BranchesView({
  chapters, currentId, onPick, onRename,
}: BranchesViewProps): ReactElement {
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  /**
   * Ширина полосы меряется у КОНТЕЙНЕРА, а не у полотна плиток: полотно само
   * раздувается от их суммарной ширины, и наблюдатель на нём мерил бы то,
   * что сам же раздувает. Тот же приём и по той же причине, что у дорожки
   * (`TrackView`, замер ширины окна прокрутки).
   *
   * Наблюдателем, а не по событию окна: полоса меняет ширину и когда окно
   * не трогали — например, если рядом свернут панель.
   */
  useLayoutEffect(() => {
    const lane = laneRef.current;
    if (!lane) return undefined;
    const observer = new ResizeObserver(() => setLaneWidth(lane.clientWidth));
    observer.observe(lane);
    setLaneWidth(lane.clientWidth);
    return () => observer.disconnect();
  }, []);

  // Правка имени начинается с текущего — автор чаще уточняет, чем пишет заново.
  const startRename = useCallback((tile: ChapterTile) => {
    setEditing(tile.id);
    setDraft(tile.title);
  }, []);

  const commitRename = useCallback(() => {
    if (editing === null) return;
    const title = draft.trim();
    // Пустое имя не принимается: плитка без подписи ничего не говорит автору,
    // а `branchChapters` подставила бы вместо него идентификатор — то есть
    // автор получил бы «seg-3» вместо своего названия и не понял бы почему.
    if (title.length > 0) onRename(editing, title);
    setEditing(null);
  }, [editing, draft, onRename]);

  // Esc отменяет правку, не записывая. Без этого выхода единственный способ
  // отказаться — стереть и напечатать прежнее имя по памяти.
  useEffect(() => {
    if (editing === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setEditing(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  const widths = tileWidths(chapters, laneWidth);
  const totalSeconds = chapters.reduce((sum, tile) => sum + tile.seconds, 0);
  const forks = chapters.length > 0 && chapters[chapters.length - 1]!.forksAfter;

  return (
    <section className="ed-branches" data-testid="branches-view" aria-label="Ветки">
      <div className="ed-branches-names">
        <div className="ed-branch-name">
          <span className="ed-branch-title">Основная</span>
          <span className="ed-branch-duration" data-testid="branch-duration">
            {formatDuration(totalSeconds)}
          </span>
        </div>
      </div>

      <div className="ed-branches-lane" ref={laneRef} data-testid="branch-lane">
        <div className="ed-branch-row">
          {chapters.map((tile, index) => (
            <div
              key={tile.id}
              className={tile.id === currentId ? 'ed-chapter-tile ed-chapter-tile--current' : 'ed-chapter-tile'}
              style={{ width: `${widths[index] ?? MIN_TILE_PX}px` }}
              data-testid={`chapter-tile-${tile.id}`}
            >
              {editing === tile.id ? (
                <input
                  className="ed-chapter-rename"
                  data-testid={`chapter-rename-${tile.id}`}
                  value={draft}
                  autoFocus
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => { if (event.key === 'Enter') commitRename(); }}
                />
              ) : (
                <button
                  type="button"
                  className="ed-chapter-pick"
                  data-testid={`chapter-pick-${tile.id}`}
                  onClick={() => onPick(tile.id)}
                  onDoubleClick={() => startRename(tile)}
                  title={`${tile.title} · ${formatDuration(tile.seconds)} · двойной щелчок — переименовать`}
                >
                  {tile.title}
                </button>
              )}
            </div>
          ))}
          {forks ? (
            // Лента не обрывается молча: за последней главой стоит развилка,
            // и ветки от неё — работа Сессии 43. Сказать об этом дешевле,
            // чем оставить автора гадать, почему рассказ кончился здесь.
            <span className="ed-branch-tail" data-testid="branch-tail">развилка →</span>
          ) : null}
        </div>
      </div>

      {/* Подсказка строкой, а не только в `title`: проект уже измерял, что
          на подсказки при наведении никто не смотрит. */}
      <p className="ed-branches-hint">
        Щелчок по главе показывает её на холсте, двойной — переименовывает.
        Ветки от развилок появятся позже.
      </p>
    </section>
  );
}

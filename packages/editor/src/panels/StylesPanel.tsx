/**
 * Панель стилей проекта (схема v12, ADR-029).
 *
 * Три дела: собрать новый стиль из вида выделенного элемента, применить
 * существующий стиль к выделенному, удалить стиль из проекта. Логика — чужая:
 * какие ключи попадают в новый стиль решает `styleFieldsFor` (`state/style.ts`,
 * ADR-012), сколько состояний заденет удаление — `styleUsage` (`state/styleLink.ts`).
 * Здесь только разметка и то, что нельзя выразить чистой функцией без React —
 * незавершённый ввод имени и открытый диалог подтверждения.
 *
 * Диалог удаления — СВОЯ разметка, не `window.confirm`: системный диалог
 * блокирует расширение Chrome и Playwright (CLAUDE.md, «ЧЕГО НЕЛЬЗЯ»).
 *
 * Четвёртое дело, добавленное этой сессией: склад наборов стилей
 * (`state/styleStore.ts`, ADR-029 §6) — «Сохранить набор»/«Взять». Панель
 * читает и пишет IndexedDB САМА, тем же приёмом, что `track/AudioSourcePanel.tsx`
 * читает имя звука (`getAudio`): асинхронный запрос внутри эффекта, ошибка —
 * в текст на экране, а не в проглоченный catch (падать громко, как и везде
 * в проекте). `Editor.tsx` знает только про итог — готовый список стилей
 * для `dispatch({ type: 'addStyles', styles })` — а не про склад как таковой.
 */
import { useEffect, useId, useState, type ReactElement } from 'react';

import type { Element, ElementState, Segment, Style } from '@player/core';

import { freeId } from '../state/elements.js';
import { styleUsage } from '../state/styleLink.js';
import { listStyleSets, mergeStyleSet, saveStyleSet, type StyleSet } from '../state/styleStore.js';
import { plural, STYLES } from '../plural.js';

export interface StylesPanelProps {
  /** Стили проекта, в порядке `project.styles`. */
  styles: readonly Style[];
  /** Все сегменты проекта — нужны только `styleUsage`, чтобы посчитать удаление. */
  segments: readonly Segment[];
  /** Выделенный элемент — undefined, если выделения нет или их несколько. */
  selectedElement: Element | undefined;
  /** Состояние выделенного элемента на ТЕКУЩЕМ слайде. undefined — его здесь нет. */
  selectedElementState: ElementState | undefined;
  /** «Сохранить вид как стиль»: имя вводит автор, остальное решает Editor.tsx. */
  onSave: (name: string) => void;
  /** Применить стиль к выделенному элементу. */
  onApply: (styleId: string) => void;
  /** Удалить стиль (уже подтверждено диалогом внутри панели). */
  onDelete: (styleId: string) => void;
  /**
   * «Взять» набор со склада: панель уже слила его через `mergeStyleSet`
   * (own = `styles` пропа выше) — сюда приходит готовый к вставке список,
   * `Editor.tsx` лишь диспетчит `addStyles`.
   */
  onTake: (styles: readonly Style[]) => void;
}

/** «heading → heading-2» построчно — то же самое переименование, что видно в id. */
function renamedMessage(renamed: ReadonlyMap<string, string>): string {
  const pairs = [...renamed.entries()].map(([from, to]) => `${from} → ${to}`);
  return `${plural(pairs.length, STYLES)} пришли под новыми именами: ${pairs.join(', ')}`;
}

export function StylesPanel({
  styles,
  segments,
  selectedElement,
  selectedElementState,
  onSave,
  onApply,
  onDelete,
  onTake,
}: StylesPanelProps): ReactElement {
  const nameId = useId();
  const [name, setName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);

  const canSave = selectedElement !== undefined && selectedElementState !== undefined && name.trim() !== '';

  const handleSave = (): void => {
    const trimmed = name.trim();
    if (trimmed === '' || selectedElement === undefined || selectedElementState === undefined) return;
    onSave(trimmed);
    setName('');
  };

  // ------------------------------------------------------------------
  // Склад наборов стилей (ADR-029 §6).
  // ------------------------------------------------------------------
  const setNameId = useId();
  const [setName_, setSetName] = useState('');
  const [sets, setSets] = useState<readonly StyleSet[] | undefined>(undefined); // undefined — ещё грузится
  const [setsError, setSetsError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [renamed, setRenamed] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listStyleSets()
      .then((result) => {
        if (!cancelled) {
          setSets(result);
          setSetsError(undefined);
        }
      })
      .catch((error: unknown) => {
        // Падает громко в интерфейс, а не в необработанное отклонение промиса —
        // тот же приём, что у AudioSourcePanel: автор обязан УВИДЕТЬ причину,
        // а не догадываться, почему склад выглядит пустым.
        if (!cancelled) setSetsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const handleSaveSet = (): void => {
    const trimmed = setName_.trim();
    if (trimmed === '' || sets === undefined) return;
    const id = freeId('set', sets);
    saveStyleSet({ id, name: trimmed, savedAt: Date.now(), styles })
      .then(() => {
        setSetName('');
        setSaveError(undefined);
        setReloadToken((token) => token + 1);
      })
      .catch((error: unknown) => {
        setSaveError(error instanceof Error ? error.message : String(error));
      });
  };

  const handleTake = (set: StyleSet): void => {
    const merged = mergeStyleSet(styles, set.styles);
    // Переименование обязано быть сказано вслух — молча автор применил бы
    // «Заголовок» и получил не тот стиль (задание сессии).
    setRenamed(merged.renamed.size > 0 ? renamedMessage(merged.renamed) : undefined);
    if (merged.styles.length > 0) onTake(merged.styles);
  };

  const pendingStyle = pendingDeleteId === undefined
    ? undefined
    : styles.find((style) => style.id === pendingDeleteId);
  const pendingUsage = pendingStyle === undefined ? undefined : styleUsage(segments, pendingStyle.id);

  return (
    <div className="ed-styles-panel" data-testid="styles-panel">
      <h2 className="ed-insp-title">Стили</h2>

      <div className="ed-insp-block">
        <div className="ed-insp-field">
          <label className="ed-insp-label" htmlFor={nameId}>
            Имя нового стиля
          </label>
          <input
            id={nameId}
            className="ed-insp-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={name}
            disabled={selectedElement === undefined || selectedElementState === undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="ed-action"
          data-testid="style-save"
          disabled={!canSave}
          onClick={handleSave}
        >
          Сохранить вид как стиль
        </button>
        {selectedElement === undefined || selectedElementState === undefined ? (
          <p className="ed-insp-note">
            Выделите элемент, у которого есть вид на текущем слайде, чтобы сохранить его как стиль.
          </p>
        ) : null}
      </div>

      <div className="ed-insp-block">
        {styles.length === 0 ? (
          <p className="ed-insp-note">Стилей в проекте пока нет.</p>
        ) : (
          <div role="list" aria-label="Стили проекта">
            {styles.map((style) => {
              // Стиль чужого типа применять нельзя: схема отвергнет ссылку
              // (ProjectSchema.superRefine, «Наборы свойств не пересекаются»),
              // и проект перестал бы загружаться, попади она в файл.
              const applicable = selectedElement !== undefined && selectedElement.type === style.type;
              return (
                <div
                  key={style.id}
                  role="listitem"
                  data-testid={`style-item-${style.id}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.4em' }}
                >
                  <button
                    type="button"
                    className="ed-action"
                    style={{ flex: 1, textAlign: 'left' }}
                    disabled={!applicable}
                    title={
                      applicable
                        ? undefined
                        : `Стиль «${style.name}» для типа «${style.type}» — выделенный элемент другого типа`
                    }
                    onClick={() => onApply(style.id)}
                  >
                    {style.name} <span className="ed-insp-note">({style.type})</span>
                  </button>
                  <button
                    type="button"
                    className="ed-action"
                    data-testid={`style-remove-${style.id}`}
                    onClick={() => setPendingDeleteId(style.id)}
                  >
                    Удалить
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ed-insp-block">
        <h3 className="ed-insp-title">Склад наборов</h3>
        <div className="ed-insp-field">
          <label className="ed-insp-label" htmlFor={setNameId}>
            Имя набора
          </label>
          <input
            id={setNameId}
            className="ed-insp-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={setName_}
            onChange={(event) => setSetName(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="ed-action"
          data-testid="styleset-save"
          disabled={sets === undefined || setName_.trim() === ''}
          onClick={handleSaveSet}
        >
          Сохранить набор
        </button>
        {saveError !== undefined ? (
          <p className="ed-insp-note" role="alert">Не удалось сохранить набор: {saveError}</p>
        ) : null}

        {setsError !== undefined ? (
          <p className="ed-insp-note" role="alert">Склад наборов недоступен: {setsError}</p>
        ) : sets === undefined ? (
          <p className="ed-insp-note">Загрузка склада…</p>
        ) : sets.length === 0 ? (
          <p className="ed-insp-note">На складе пока нет наборов.</p>
        ) : (
          <div role="list" aria-label="Наборы стилей на складе">
            {sets.map((set) => (
              <div
                key={set.id}
                role="listitem"
                data-testid={`styleset-${set.id}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.4em' }}
              >
                <span style={{ flex: 1 }}>
                  {set.name} <span className="ed-insp-note">({plural(set.styles.length, STYLES)})</span>
                </span>
                <button
                  type="button"
                  className="ed-action"
                  data-testid={`styleset-take-${set.id}`}
                  onClick={() => handleTake(set)}
                >
                  Взять
                </button>
              </div>
            ))}
          </div>
        )}

        {renamed !== undefined ? (
          <p className="ed-insp-note" data-testid="styleset-renamed">{renamed}</p>
        ) : null}
      </div>

      {pendingStyle !== undefined && pendingUsage !== undefined ? (
        <div className="ed-insp-block" role="alertdialog" aria-label="Подтверждение удаления стиля">
          <p className="ed-insp-note" data-testid="style-delete-usage">
            Удалить стиль «{pendingStyle.name}»? Его используют {pendingUsage.states} состояний
            на {pendingUsage.elements} элементах — они останутся тем же видом, каким были
            на момент удаления, связь со стилем просто пропадёт.
          </p>
          <div style={{ display: 'flex', gap: '0.5em' }}>
            <button
              type="button"
              className="ed-action"
              data-testid="style-delete-confirm"
              onClick={() => {
                onDelete(pendingStyle.id);
                setPendingDeleteId(undefined);
              }}
            >
              Удалить
            </button>
            <button
              type="button"
              className="ed-action"
              data-testid="style-delete-cancel"
              onClick={() => setPendingDeleteId(undefined)}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

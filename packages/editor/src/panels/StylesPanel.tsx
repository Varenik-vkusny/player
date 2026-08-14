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
 */
import { useId, useState, type ReactElement } from 'react';

import type { Element, ElementState, Segment, Style } from '@player/core';

import { styleUsage } from '../state/styleLink.js';

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
}

export function StylesPanel({
  styles,
  segments,
  selectedElement,
  selectedElementState,
  onSave,
  onApply,
  onDelete,
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

      {pendingStyle !== undefined && pendingUsage !== undefined ? (
        <div className="ed-insp-block" role="alertdialog" aria-label="Подтверждение удаления стиля">
          <p className="ed-insp-note">
            Удалить стиль «{pendingStyle.name}»? Его используют {pendingUsage.states}{' '}
            {pendingUsage.states === 1 ? 'состояние' : 'состояний'} ({pendingUsage.elements}{' '}
            {pendingUsage.elements === 1 ? 'элемент' : 'элементов'}) — они останутся тем же видом,
            каким были на момент удаления, связь со стилем просто пропадёт.
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

/**
 * Панель темы сцены — десять ролей схемы v9 (`ThemeSchema`), которые красят
 * элементы, сославшиеся на них строкой стиля (`var(--role, fallback)`,
 * Сессия 22).
 *
 * Тема — свойство ПРОЕКТА, а не выделенного элемента, поэтому панель стоит
 * шестым блоком рядом с `InsertPanel`/`TemplatesPanel`/`ElementList`/
 * `SlidePanel`/`SegmentPanel` в общей правой колонке (`Editor.tsx`,
 * `aside.ed-elements-panel`), а не в `Inspector`/`MarkPanel` — те исключают
 * друг друга по выделению (`docs/design/theme-panel.md` §1).
 *
 * Список полей и их порядок — `theme.ts` (`THEME_ROLES`), взятые прогоном
 * из `ThemeSchema.shape`, а не переписаны здесь руками.
 *
 * Вид поля решает ЗНАЧЕНИЕ, а не роль (спецификация §3): `<input
 * type="color">` принимает только `#RRGGBB` и молча чернит всё остальное,
 * а тема законно может прийти как `rgb(...)` из чужого файла или чужой
 * палитры. Разбор — существующий `tryColor` (`state/style.ts`), та же
 * функция, что читает цвет стиля элемента: своей проверки формата здесь
 * нет намеренно — два описания одного формата разошлись бы тихо.
 *
 * Правка — живое событие (как перетаскивание элемента, набор числа):
 * каждое движение пипетки/нажатие клавиши шлёт `onChangeRole` некоммитящим
 * событием, потеря фокуса поля закрывает жест через `onCommitHistory`
 * (`docs/design/theme-panel.md` §4, `state/editorHistory.ts: isLiveEvent`).
 */
import { useId, type ReactElement } from 'react';

import type { Theme } from '@player/core';

import { tryColor } from '../state/style.js';
import { PALETTES } from '../state/palettes.js';
import { THEME_FIELDS, THEME_ROLES } from '../theme.js';

export interface ThemePanelProps {
  theme: Theme;
  /** Живое событие: `commit: false` ставит вызывающий код (Editor.tsx). */
  onChangeRole: (role: keyof Theme, value: string) => void;
  /** Потеря фокуса поля — точка коммита жеста (см. комментарий модуля). */
  onCommitHistory: () => void;
  /**
   * Щелчок по образцу палитры (`PALETTES`, `state/palettes.ts`) — заменяет
   * ВСЕ десять ролей темы разом, одной записью в историю (Editor.tsx собирает
   * её тем же приёмом, что и `applyArrange`: `commit: false` на каждую роль,
   * один `commit` в конце). Отмена обязана вернуть прежнюю тему целиком.
   */
  onApplyPalette: (paletteId: string) => void;
}

interface ThemeRoleFieldProps {
  role: keyof Theme;
  value: string;
  onChangeRole: (role: keyof Theme, value: string) => void;
  onCommitHistory: () => void;
}

/**
 * Одна роль темы. Не `ColorField`/`StringField` из `fields.tsx`: тем двум
 * неоткуда взять решение «показать цветом или строкой» — оно здесь зависит
 * от значения конкретной роли, а не фиксировано на уровне поля, и оба
 * готовых поля к тому же не закрывают живой жест по потере фокуса.
 * Разметка и классы (`ed-insp-field`/`ed-insp-label`/`ed-insp-input`) —
 * те же, что у `fields.tsx`, ради одного вида по всему редактору.
 */
function ThemeRoleField({ role, value, onChangeRole, onCommitHistory }: ThemeRoleFieldProps): ReactElement {
  const id = useId();
  const spec = THEME_FIELDS[role];
  const hex = spec.kind === 'color' ? tryColor(value) : undefined;

  if (hex !== undefined) {
    return (
      <div className="ed-insp-field">
        <label className="ed-insp-label" htmlFor={id}>
          {spec.label}
        </label>
        <input
          id={id}
          className="ed-insp-input"
          type="color"
          value={hex}
          onChange={(event) => onChangeRole(role, event.target.value)}
          onBlur={onCommitHistory}
        />
      </div>
    );
  }

  // Роль вида «цвет», но значение не разобралось в #RRGGBB (например,
  // rgb(...) из чужого файла) — показываем строкой и называем причину,
  // а не подсовываем ColorField, который безусловно почернил бы значение
  // на первое же касание (спецификация §3).
  const label = spec.kind === 'color' ? `${spec.label} (не #RRGGBB — показано строкой)` : spec.label;

  return (
    <div className="ed-insp-field">
      <label className="ed-insp-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ed-insp-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChangeRole(role, event.target.value)}
        onBlur={onCommitHistory}
      />
    </div>
  );
}

export function ThemePanel({
  theme,
  onChangeRole,
  onCommitHistory,
  onApplyPalette,
}: ThemePanelProps): ReactElement {
  return (
    <section className="ed-theme-panel" aria-label="Тема">
      <h2 className="ed-insp-title">Тема</h2>

      {/* Палитры — над списком ролей: выбор готовой темы одним щелчком,
          раньше, чем автор доберётся до правки отдельной роли. «Ночь» стоит
          первой в PALETTES (умолчания схемы) — возврат к сегодняшнему виду
          не дороже одного щелчка в один конец. */}
      <div className="ed-theme-palettes" role="list" aria-label="Палитры">
        {PALETTES.map((palette) => (
          <button
            key={palette.id}
            type="button"
            className="ed-palette-swatch"
            data-testid={`palette-${palette.id}`}
            role="listitem"
            title={palette.name}
            onClick={() => onApplyPalette(palette.id)}
          >
            <span className="ed-palette-chips" aria-hidden="true">
              <span className="ed-palette-chip" style={{ background: palette.theme['--scene-bg'] }} />
              <span className="ed-palette-chip" style={{ background: palette.theme['--scene-accent'] }} />
              <span className="ed-palette-chip" style={{ background: palette.theme['--scene-ink'] }} />
            </span>
            <span className="ed-palette-name">{palette.name}</span>
          </button>
        ))}
      </div>

      <div className="ed-insp-body">
        {THEME_ROLES.map((role) => (
          <ThemeRoleField
            key={role}
            role={role}
            value={theme[role]}
            onChangeRole={onChangeRole}
            onCommitHistory={onCommitHistory}
          />
        ))}
      </div>
    </section>
  );
}

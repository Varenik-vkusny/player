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
import type { ReactElement } from 'react';

import type { Theme } from '@player/core';

import { tryColor } from '../state/style.js';
import { PALETTES } from '../state/palettes.js';
import { THEME_FIELDS, THEME_ROLES } from '../theme.js';
import { ColorField, StringField } from '../ui/fields.js';

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
 * Одна роль темы — рисуют её готовые `ColorField`/`StringField` из
 * `fields.tsx` (у обоих есть `onBlurCommit`, закрывающий живой жест
 * потерей фокуса, Сессия 51). Сама функция — только решение «показать
 * цветом или строкой», зависящее от ЗНАЧЕНИЯ конкретной роли, а не
 * фиксированное на уровне поля: этого решения в библиотечных полях
 * нет и не может быть, оно принадлежит вызывающему коду.
 */
function ThemeRoleField({ role, value, onChangeRole, onCommitHistory }: ThemeRoleFieldProps): ReactElement {
  const spec = THEME_FIELDS[role];
  const hex = spec.kind === 'color' ? tryColor(value) : undefined;

  if (hex !== undefined) {
    return (
      <ColorField
        label={spec.label}
        value={hex}
        onCommit={(next) => onChangeRole(role, next)}
        onBlurCommit={onCommitHistory}
      />
    );
  }

  // Роль вида «цвет», но значение не разобралось в #RRGGBB (например,
  // rgb(...) из чужого файла) — показываем строкой и называем причину,
  // а не подсовываем ColorField, который безусловно почернил бы значение
  // на первое же касание (спецификация §3).
  const label = spec.kind === 'color' ? `${spec.label} (не #RRGGBB — показано строкой)` : spec.label;

  return (
    <StringField
      label={label}
      value={value}
      onCommit={(next) => onChangeRole(role, next)}
      onBlurCommit={onCommitHistory}
    />
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

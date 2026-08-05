/**
 * Роли темы сцены (схема v9, `ThemeSchema` из `@player/core`) → как их
 * показывает панель (`panels/ThemePanel.tsx`).
 *
 * Состав и ПОРЯДОК ролей — `Object.keys(ThemeSchema.shape)`, а не переписаны
 * руками. `ThemeSchema` объявлена ГОЛОЙ ровно затем, чтобы `.shape` остался
 * доступен: обёртка `.prefault({})` висит на месте использования
 * (`schema.ts:596`), а не на самой схеме, потому что обёрнутая схема —
 * уже не `ZodObject`, `.shape` у неё нет (причина расписана в
 * `schema.ts:581-587`). Список ролей, переписанный здесь руками, разошёлся
 * бы со схемой молча.
 *
 * Подписи для панели схема дать не может — их придумывает человек, а не код.
 * Полноту `THEME_FIELDS` проверяет TypeScript сам: тип ниже —
 * `Record<keyof Theme, ...>`, и роль, добавленная или снятая в схеме, тут же
 * даёт ошибку компиляции. `test/theme.test.ts` проверяет то же самое
 * в рантайме и в обе стороны (ни лишних, ни недостающих ключей).
 *
 * Подписи — `docs/design/system.md` §2 / `docs/design/theme-panel.md` §2.
 */
import { ThemeSchema, type Theme } from '@player/core';

/**
 * Вид поля панели. Только НАМЕРЕНИЕ роли — цвет она или строка по схеме.
 * Настоящий виджет (`ThemePanel.tsx`) решает по ЗНАЧЕНИЮ, а не по этому полю:
 * роль вида «цвет» может нести строку, `<input type="color">` не умеющую
 * показать (`rgb(...)`, а не `#RRGGBB`) — тогда панель всё равно покажет
 * текстовое поле, называя причину (`docs/design/theme-panel.md` §3).
 */
export type ThemeFieldKind = 'color' | 'text';

export interface ThemeFieldSpec {
  readonly label: string;
  readonly kind: ThemeFieldKind;
}

/** Ключи объекта — литералами, поэтому TypeScript сверяет их со схемой сам. */
export const THEME_FIELDS: Readonly<Record<keyof Theme, ThemeFieldSpec>> = {
  // «Фон сцены», а не «Фон»: у поля стиля ЭЛЕМЕНТА подпись ровно «Фон»
  // (STYLE_FIELDS), и обе панели видны на экране ОДНОВРЕМЕННО — тема стоит
  // шестым блоком рядом со свойствами выделенного. Два поля с одинаковой
  // подписью и разным смыслом автор различить не может. Охраняется тестом
  // «подписи ролей темы не совпадают с подписями полей стиля».
  '--scene-bg': { label: 'Фон сцены', kind: 'color' },
  '--scene-ink': { label: 'Текст', kind: 'color' },
  '--scene-ink-muted': { label: 'Текст приглушён', kind: 'color' },
  '--scene-accent': { label: 'Акцент', kind: 'color' },
  '--scene-accent-ink': { label: 'Текст на акценте', kind: 'color' },
  '--scene-surface': { label: 'Плашка', kind: 'color' },
  '--scene-line': { label: 'Линия', kind: 'color' },
  '--scene-font': { label: 'Шрифт основной', kind: 'text' },
  '--scene-font-display': { label: 'Шрифт заголовков', kind: 'text' },
  // «Скругление плашек» по той же причине, что «Фон сцены» выше: у поля
  // стиля элемента подпись ровно «Скругление». Роль красит плашки и рамки
  // сцены (docs/design/system.md §2), поэтому уточнение не выдумано, а взято
  // из того, что роль на самом деле делает.
  '--scene-radius': { label: 'Скругление плашек', kind: 'text' },
};

/** Порядок и состав ролей — прогоном из схемы, не переписаны руками. */
export const THEME_ROLES: readonly (keyof Theme)[] = Object.keys(ThemeSchema.shape) as (keyof Theme)[];

/**
 * Каталог палитр: готовые темы, которые автор выбирает щелчком.
 *
 * ДАННЫМИ, а не разметкой, по тому же правилу, что и каталог заготовок
 * (`library.ts`): пополнять набор нужно уметь, не трогая React. Это прямое
 * требование владельца к каталогам вообще.
 *
 * **Каждая палитра заполняет ВСЕ десять ролей, и это не аккуратность.**
 * `schema.ts` (комментарий к `ThemeSchema`) объясняет, почему список ролей
 * закрыт: палитра, оставившая роль пустой, покрасила бы сославшиеся на неё
 * элементы в «унаследованное» — молча, без единой строки в консоли (S11,
 * S14). Неполная палитра — это не «палитра поскромнее», это ловушка.
 *
 * Названия ролей и их смысл: `--scene-bg` фон сцены, `--scene-ink` основной
 * текст, `--scene-ink-muted` второстепенный, `--scene-accent` акцент,
 * `--scene-accent-ink` текст НА акценте, `--scene-surface` плашка,
 * `--scene-line` линии и границы.
 */
import { ThemeSchema } from '@player/core';
import type { Theme } from '@player/core';

export interface Palette {
  /** Машинный идентификатор. Ни в какой селектор не попадает, но пусть будет узким. */
  readonly id: string;
  /** То, что видит автор. */
  readonly name: string;
  /** Светлая палитра или тёмная — по ней панель раскладывает образцы. */
  readonly tone: 'dark' | 'light';
  readonly theme: Theme;
}

/** Шрифты и скругление у палитр общие: они про цвет, а не про типографику. */
const SHAPE = {
  '--scene-font': 'system-ui, sans-serif',
  '--scene-font-display': 'Georgia, serif',
  '--scene-radius': '28px',
} as const;

export const PALETTES: readonly Palette[] = [
  {
    id: 'night',
    name: 'Ночь',
    tone: 'dark',
    // Умолчания схемы. Стоит первой намеренно: это сегодняшний вид сцены,
    // и автор обязан иметь возможность вернуться к нему одним щелчком.
    theme: ThemeSchema.parse({}),
  },
  {
    id: 'graphite',
    name: 'Графит',
    tone: 'dark',
    theme: {
      '--scene-bg': '#141414',
      '--scene-ink': '#f2f2f2',
      '--scene-ink-muted': '#9e9e9e',
      '--scene-accent': '#ff8a3d',
      '--scene-accent-ink': '#1a1005',
      '--scene-surface': '#212121',
      '--scene-line': '#333333',
      ...SHAPE,
    },
  },
  {
    id: 'forest',
    name: 'Хвоя',
    tone: 'dark',
    theme: {
      '--scene-bg': '#0d1a15',
      '--scene-ink': '#e8f2ec',
      '--scene-ink-muted': '#8fae9f',
      '--scene-accent': '#3ecf8e',
      '--scene-accent-ink': '#04150d',
      '--scene-surface': '#16261f',
      '--scene-line': '#263a31',
      ...SHAPE,
    },
  },
  {
    id: 'plum',
    name: 'Слива',
    tone: 'dark',
    theme: {
      '--scene-bg': '#171122',
      '--scene-ink': '#efe9f8',
      '--scene-ink-muted': '#a294bd',
      '--scene-accent': '#b07cff',
      '--scene-accent-ink': '#140a24',
      '--scene-surface': '#221a33',
      '--scene-line': '#342a4a',
      ...SHAPE,
    },
  },
  {
    id: 'paper',
    name: 'Бумага',
    tone: 'light',
    theme: {
      '--scene-bg': '#f7f5f0',
      '--scene-ink': '#1c1a17',
      '--scene-ink-muted': '#6b6459',
      '--scene-accent': '#1f6feb',
      '--scene-accent-ink': '#ffffff',
      '--scene-surface': '#ffffff',
      '--scene-line': '#ddd8ce',
      ...SHAPE,
    },
  },
  {
    id: 'chalk',
    name: 'Мел',
    tone: 'light',
    theme: {
      '--scene-bg': '#eef1f5',
      '--scene-ink': '#12202e',
      '--scene-ink-muted': '#5c7186',
      '--scene-accent': '#e0245e',
      '--scene-accent-ink': '#ffffff',
      '--scene-surface': '#ffffff',
      '--scene-line': '#cfd8e3',
      ...SHAPE,
    },
  },
  {
    id: 'sand',
    name: 'Песок',
    tone: 'light',
    theme: {
      '--scene-bg': '#f4ece1',
      '--scene-ink': '#2a1f14',
      '--scene-ink-muted': '#7d6a55',
      '--scene-accent': '#c2410c',
      '--scene-accent-ink': '#fff7ed',
      '--scene-surface': '#fffaf3',
      '--scene-line': '#e2d3bf',
      ...SHAPE,
    },
  },
  {
    id: 'ink',
    name: 'Тушь',
    tone: 'dark',
    theme: {
      '--scene-bg': '#000000',
      '--scene-ink': '#ffffff',
      '--scene-ink-muted': '#8a8a8a',
      '--scene-accent': '#ffd400',
      '--scene-accent-ink': '#000000',
      '--scene-surface': '#111111',
      '--scene-line': '#2b2b2b',
      ...SHAPE,
    },
  },
];

/** Палитра по идентификатору. Отсутствие — ошибка вызывающего, а не данных. */
export function paletteById(id: string): Palette {
  const found = PALETTES.find((palette) => palette.id === id);
  if (!found) throw new Error(`Палитры «${id}» нет в каталоге`);
  return found;
}

/**
 * Состояние хрома редактора — свёрнутость и ширины боковых зон (Сессия 30,
 * задача владельца «сворачивать/сжимать контролеры»).
 *
 * Настройка ВИДА, а не данные проекта: живёт в `localStorage` под одним
 * отдельным ключом, в схему проекта (ADR-004, инвариант №7) не попадает
 * и версию проекта не бампает.
 *
 * Чтение ПРОВЕРЯЕТ значение, а не доверяет ему. Молча подставлять умолчание
 * при порче нельзя (CLAUDE.md: квота `localStorage` уже показала, что порча
 * канала хранения выглядит для автора не как ошибка, а как прошлая версия
 * работы) — поэтому при любом отклонении от ожидаемой формы читаются
 * умолчания И печатается `console.warn` с именем ключа, чтобы порча была
 * видна хоть где-то, а не проглочена целиком.
 *
 * Валидность — ОДНА проверка на всю запись, а не поле за полем: смешанная
 * запись (одно поле верное, другое испорченное) уже не та запись, которую
 * написал этот же код, и её происхождение под вопросом целиком.
 */

export const CHROME_LAYOUT_STORAGE_KEY = 'player.editor.chrome';

export interface ChromeLayout {
  readonly catalogCollapsed: boolean;
  readonly catalogWidth: number;
  readonly sideCollapsed: boolean;
  readonly sideWidth: number;
}

/** Пределы ширины панели каталога, px (задание Сессии 30). */
export const CATALOG_WIDTH_MIN = 260;
export const CATALOG_WIDTH_MAX = 560;

/** Пределы ширины правой колонки, px (задание Сессии 30). */
export const SIDE_WIDTH_MIN = 200;
export const SIDE_WIDTH_MAX = 420;

/**
 * Ширина корешка свёрнутой правой колонки, px. Не хранится в `ChromeLayout`
 * и не настраивается автором — это размер ОДНОЙ кнопки развернуть
 * (обратный путь для правой колонки, задание Сессии 30), а не панели.
 */
export const SIDE_SPINE_WIDTH_PX = 40;

/** Ширины взяты с натуры текущей раскладки (`.ed-main` в styles.ts). */
export const DEFAULT_CHROME_LAYOUT: ChromeLayout = {
  catalogCollapsed: false,
  // 361 — ширина панели каталога живой Канвы (замер 20.08.2026).
  // Было 350, снятое с нашего прототипа design/shell.css.
  catalogWidth: 361,
  sideCollapsed: false,
  sideWidth: 260,
};

function isWidthInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Запись — объект с ровно этими четырьмя полями правильных типов и в пределах. */
function isValidChromeLayout(value: unknown): value is ChromeLayout {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.catalogCollapsed === 'boolean'
    && typeof candidate.sideCollapsed === 'boolean'
    && isWidthInRange(candidate.catalogWidth, CATALOG_WIDTH_MIN, CATALOG_WIDTH_MAX)
    && isWidthInRange(candidate.sideWidth, SIDE_WIDTH_MIN, SIDE_WIDTH_MAX)
  );
}

/**
 * Разбор сохранённой строки в состояние хрома. Чистая функция — без React
 * и без настоящего `localStorage`, поэтому тестируется напрямую.
 *
 * `raw === null` — законный случай (ключ ещё не писали, первый запуск),
 * молчаливый откат на умолчание здесь ничего не портит: порчи нет, есть
 * просто отсутствие записи.
 */
export function parseChromeLayout(raw: string | null): ChromeLayout {
  if (raw === null) return DEFAULT_CHROME_LAYOUT;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`${CHROME_LAYOUT_STORAGE_KEY}: испорченный JSON, взяты значения по умолчанию`);
    return DEFAULT_CHROME_LAYOUT;
  }

  if (!isValidChromeLayout(parsed)) {
    console.warn(`${CHROME_LAYOUT_STORAGE_KEY}: значение не прошло проверку, взяты значения по умолчанию`);
    return DEFAULT_CHROME_LAYOUT;
  }

  return {
    catalogCollapsed: parsed.catalogCollapsed,
    catalogWidth: parsed.catalogWidth,
    sideCollapsed: parsed.sideCollapsed,
    sideWidth: parsed.sideWidth,
  };
}

export function serializeChromeLayout(layout: ChromeLayout): string {
  return JSON.stringify(layout);
}

/** Тонкая обёртка над настоящим `localStorage` — не тестируется напрямую (см. тест). */
export function readChromeLayout(): ChromeLayout {
  return parseChromeLayout(localStorage.getItem(CHROME_LAYOUT_STORAGE_KEY));
}

/**
 * Запись при КАЖДОМ изменении, без задержек и очередей — данных на сотню
 * байт, откладывать нечего (задание Сессии 30).
 */
export function writeChromeLayout(layout: ChromeLayout): void {
  localStorage.setItem(CHROME_LAYOUT_STORAGE_KEY, serializeChromeLayout(layout));
}

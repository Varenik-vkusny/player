/**
 * Состояние хрома редактора — свёрнутость и ширина панели каталога (Сессия 30,
 * задача владельца «сворачивать/сжимать контролеры»; правая колонка,
 * которая тут тоже жила, удалена в Сессии 55).
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
}

/** Пределы ширины панели каталога, px (задание Сессии 30). */
export const CATALOG_WIDTH_MIN = 260;
export const CATALOG_WIDTH_MAX = 560;

/* Пределов правой колонки здесь больше нет: сама колонка удалена в Сессии 55
   (у Канвы и КапКута справа от полотна нет ничего, всё открывается слева
   от рейки). Её свёрнутость и ширина были состоянием того, чего нет.

   СТАРЫЕ ЗАПИСИ ОТ ЭТОГО НЕ ПОРТЯТСЯ: проверка ниже смотрит на нужные поля,
   а не запрещает лишние, — у автора, открывшего редактор после обновления,
   раскладка каталога останется его, а не откатится на умолчание. */

/** Ширины взяты с натуры текущей раскладки (`.ed-main` в styles.ts). */
export const DEFAULT_CHROME_LAYOUT: ChromeLayout = {
  catalogCollapsed: false,
  // 361 — ширина панели каталога живой Канвы (замер 20.08.2026).
  // Было 350, снятое с нашего прототипа design/shell.css.
  catalogWidth: 361,
};

function isWidthInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Запись — объект с нужными полями правильных типов и в пределах. */
function isValidChromeLayout(value: unknown): value is ChromeLayout {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.catalogCollapsed === 'boolean'
    && isWidthInRange(candidate.catalogWidth, CATALOG_WIDTH_MIN, CATALOG_WIDTH_MAX)
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

  // Поля перечислены поимённо, а не `return parsed`: у записи, написанной
  // прошлой версией, есть ещё sideCollapsed и sideWidth, и они не должны
  // просочиться обратно в состояние — колонки, которой они принадлежали,
  // больше нет.
  return {
    catalogCollapsed: parsed.catalogCollapsed,
    catalogWidth: parsed.catalogWidth,
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

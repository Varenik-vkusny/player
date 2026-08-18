/**
 * Чип слайда в правой колонке: видно ли на нём то, что на нём написано,
 * и видно ли, какой слайд сейчас выбран (Сессия 47).
 *
 * ЧТО ИЗМЕРЕНО 18.08.2026 в живом браузере, фикстура demo, окно 1280x800.
 *
 * Подпись вида перехода («Срез» / «Морфинг») — 11 px, цвет
 * rgb(91,100,114) на фоне rgb(107,107,107). Отношение яркостей 1.12:1
 * при пороге 4.5:1. Это не «бледновато»: на экране слова нет.
 *
 * ОТКУДА ВЗЯЛСЯ ТАКОЙ ФОН — корень, а не следствие. Правила
 * `.ed-slide-button` в проекте НЕТ НИ ОДНОГО. Кнопка чипа осталась голой
 * кнопкой браузера, а `apps/playground/editor.html` объявляет
 * `:root { color-scheme: dark }` — значит её лицо это тёмный системный
 * ButtonFace, rgb(107,107,107), с квадратными углами и кеглем UA. Поверх
 * него роль --ui-content-fg-secondary, рассчитанная на светлую панель:
 * на своём фоне (--ui-surface-raised) та же пара даёт 5.39:1.
 *
 * Оформление чипа при этом НАПИСАНО и цело — `.ed-slide-row`
 * с --ui-surface-raised, скруглением и рамкой, — но висит на `<li>`,
 * а класс `ed-slide-button` на кнопке внутри не значит ничего.
 *
 * ТОТ ЖЕ ПРОМАХ УБИВАЕТ ЦЕЛУЮ ВОЗМОЖНОСТЬ. Правило
 * `.ed-slide-row[aria-pressed='true']` красит текущий слайд ролью
 * --ui-action-selected-bg, а разметка ставит `aria-current="true"`,
 * и не на `<li>`, а на кнопку. Замерено: у всех 15 строк фон одинаков,
 * rgb(242,243,245), включая текущую. Автор не видит, какой слайд выбран,
 * и ни один тест этого не проверял — проверки `aria-current` в наборе
 * относятся к сегментам, а не к слайдам.
 *
 * ПОРОГ 4.5:1 — не моё мнение. WCAG 2.2, Success Criterion 1.4.3
 * Contrast (Minimum), уровень AA: обычный текст (меньше 18.66px жирного
 * или 24px обычного) обязан давать не меньше 4.5:1.
 * https://www.w3.org/TR/WCAG22/#contrast-minimum
 * Формула отношения — оттуда же (Relative luminance, WCAG 2.2).
 *
 * ПРО КЕГЛЬ теста нет намеренно: общепринятого нижнего предела кегля
 * не существует ни в WCAG, ни в других источниках — там нормируется
 * контраст и масштабируемость, а не число пикселей. Придумать порог
 * самому значило бы выдать своё мнение за источник. Кегль подписи (11 px)
 * назван в отчёте числом и оставлен решению владельца.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

/** Относительная яркость по WCAG 2.2. */
function luminance([r, g, b]: readonly number[]): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** Отношение контраста по WCAG 2.2. */
function contrast(fg: readonly number[], bg: readonly number[]): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function parse(color: string): readonly number[] {
  const parts = (color.match(/[\d.]+/g) ?? []).map(Number);
  if (parts.length < 3) throw new Error(`не цвет: ${color}`);
  // Полупрозрачный цвет сюда попадать не должен: собственный фон ищется
  // подъёмом по предкам до первого НЕПРОЗРАЧНОГО (см. paintedOn ниже).
  // Придёт rgba с альфой — значит подъём сломан, и молчать об этом нельзя.
  if (parts.length > 3 && parts[3] !== 1) throw new Error(`полупрозрачный цвет: ${color}`);
  return parts.slice(0, 3);
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * Цвет текста и цвет того, на чём он ЛЕЖИТ. Фон берётся подъёмом по
 * предкам до первого непрозрачного — иначе у прозрачного узла получилось
 * бы сравнение цвета с самим собой, то есть зелёное при любой реализации.
 */
async function painted(
  page: Page,
  selector: string,
): Promise<{ color: string; background: string; fontSize: string; from: string }> {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`нет узла ${sel}`);
    const own = getComputedStyle(node);
    let walker: Element | null = node;
    while (walker) {
      const background = getComputedStyle(walker).backgroundColor;
      const parts = (background.match(/[\d.]+/g) ?? []).map(Number);
      const opaque = parts.length >= 3 && (parts.length < 4 || parts[3] === 1);
      if (opaque) {
        return {
          color: own.color,
          background,
          fontSize: own.fontSize,
          from: (walker.className || '').toString().split(' ')[0] || walker.tagName,
        };
      }
      walker = walker.parentElement;
    }
    throw new Error(`у ${sel} нет непрозрачного фона ни у одного предка`);
  }, selector);
}

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: чип слайда
 * снова остаётся голой кнопкой браузера, либо подпись перекрашивают
 * в роль, не подходящую к её фону. На коде до починки — 1.12 против 4.5.
 */
test('чип слайда: вид перехода читается на своём фоне', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('slide-node-1-slide-1')).toBeVisible();

  /**
   * ДВА ЧИПА, А НЕ ОДИН, и это куплено сломом 18.08.2026.
   *
   * Сначала здесь мерялся только первый чип — а первый чип ТЕКУЩИЙ, и фон
   * ему даёт отдельное правило [aria-current='true']. Слом «убрать фон
   * у обычного чипа» тест НЕ ЗАМЕТИЛ: текущий сохранил свой собственный
   * фон, отношение осталось 5.22, зелено. То есть проверка охраняла один
   * чип из пятнадцати, а четырнадцать остальных могли стать нечитаемыми
   * молча — ровно тот дефект, ради которого файл и написан.
   *
   * Поэтому берутся оба состояния: выделенный чип и его сосед. У них
   * РАЗНЫЕ фоны (--ui-action-selected-bg и --ui-surface-raised), и каждый
   * обязан держать порог сам.
   */
  const cases = [
    { sel: '[data-testid="slide-node-1-slide-1"] .ed-slide-transition', name: 'текущий чип' },
    { sel: '[data-testid="slide-node-1-slide-2"] .ed-slide-transition', name: 'обычный чип' },
  ] as const;

  const seen: string[] = [];
  for (const probe of cases) {
    const label = await painted(page, probe.sel);
    seen.push(label.background);
    const ratio = contrast(parse(label.color), parse(label.background));
    expect(
      Number(ratio.toFixed(2)),
      `${probe.name}: подпись ${label.color} на ${label.background} (фон от .${label.from}), кегль ${label.fontSize} — отношение ${ratio.toFixed(2)}:1 при пороге WCAG 2.2 SC 1.4.3 = 4.5:1`,
    ).toBeGreaterThanOrEqual(4.5);
  }

  // Положительный контроль охвата: фоны ДЕЙСТВИТЕЛЬНО разные. Совпади они,
  // второй случай был бы копией первого, и слом снова прошёл бы мимо.
  expect(seen[0], `оба чипа на одном фоне ${seen[0]} — проверка охватывает одно состояние`).not.toBe(
    seen[1],
  );
});

/**
 * Соседняя подпись того же чипа. Отдельным тестом, а не проверкой в цикле:
 * время читается и сегодня (5.33:1), и этот тест — положительный контроль
 * прибора. Покрасней он вместе с первым — значит сломан замер, а не чип.
 */
test('чип слайда: время читается — положительный контроль замера', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('slide-node-1-slide-1')).toBeVisible();

  const time = await painted(page, '.ed-slide-time');
  const ratio = contrast(parse(time.color), parse(time.background));
  expect(
    Number(ratio.toFixed(2)),
    `время на чипе: ${time.color} на ${time.background} — ${ratio.toFixed(2)}:1`,
  ).toBeGreaterThanOrEqual(4.5);
});

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: выделение
 * текущего слайда снова перестаёт рисоваться — например, правило вешают
 * на признак, которого в разметке нет. На коде до починки все строки
 * дают один и тот же rgb(242,243,245).
 *
 * Сравнивается ТЕКУЩАЯ строка с СОСЕДНЕЙ, а не с записанным числом:
 * записанное число закрепило бы сегодняшний оттенок как требование,
 * тогда как требование — «видно, какой выбран».
 */
test('чип слайда: видно, какой слайд сейчас выбран', async ({ page }) => {
  await openEditor(page);

  const paint = async (): Promise<{ current: string; currentId: string; others: readonly string[] }> =>
    page.evaluate(() => {
      const rows = [...document.querySelectorAll('.ed-slide-panel .ed-slide-row')];
      if (rows.length < 2) throw new Error(`слайдов в списке ${rows.length} — сравнивать не с чем`);
      const bgOf = (row: Element): string => {
        // Цвет берётся у САМОГО ГЛУБОКОГО непрозрачного узла строки —
        // выделение может лежать и на строке, и на кнопке внутри.
        const button = row.querySelector('button');
        const target = button ?? row;
        const own = getComputedStyle(target).backgroundColor;
        const parts = (own.match(/[\d.]+/g) ?? []).map(Number);
        const opaque = parts.length >= 3 && (parts.length < 4 || parts[3] === 1);
        return opaque ? own : getComputedStyle(row).backgroundColor;
      };
      const isCurrent = (row: Element): boolean =>
        row.querySelector('[aria-current="true"]') !== null ||
        row.getAttribute('aria-current') === 'true' ||
        row.getAttribute('aria-pressed') === 'true';
      const current = rows.filter(isCurrent);
      if (current.length !== 1) {
        throw new Error(`строк, помеченных как текущая: ${current.length} — ожидалась ровно одна`);
      }
      const button = current[0]!.querySelector('button[data-testid]');
      return {
        current: bgOf(current[0]!),
        currentId: button?.getAttribute('data-testid') ?? '(без testid)',
        others: rows.filter((row) => !isCurrent(row)).map(bgOf),
      };
    });

  const first = await paint();
  expect(
    first.others,
    `текущий слайд не отличается фоном ни от одного соседа: у всех ${first.current}`,
  ).not.toContain(first.current);

  // Выделение обязано ПЕРЕЕХАТЬ на другую строку. Без этого шага тест
  // зелен и в том случае, когда цвет прибит к первой строке навсегда,
  // а выбор слайда ни на что не влияет.
  await page.getByTestId('slide-node-1-slide-3').click();
  const second = await paint();
  expect(
    second.currentId,
    `после щелчка по третьему слайду текущей осталась строка ${second.currentId}`,
  ).not.toBe(first.currentId);
  expect(
    second.others,
    'после выбора третьего слайда выделение слилось с соседями',
  ).not.toContain(second.current);
});

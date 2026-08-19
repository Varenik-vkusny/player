/**
 * Пункты рейки каталога — ОДНОГО РАЗМЕРА, и подпись не рвётся надвое.
 *
 * Заведено Сессией 52 по возврату приёмки. Подпись «Шаблоны» разрывалась
 * посередине: автор видел «Шаблон» и под ним «ы», а первый пункт был выше
 * остальных на 13 px. У натуры шаг пунктов ровный — замерено 19.08.2026
 * на двух продуктах: Канва 72x72 у всех, КапКут 58x58 у всех
 * (docs/research/2026-08-19-anatomy-canva-capcut.md).
 *
 * ⚠️ ПОЧЕМУ ЭТО НЕ ПРОВЕРЯЕТ chrome-clip-guard, хотя беда выглядит похоже.
 * Сторож обрезки ищет узлы, у которых scrollHeight больше clientHeight при
 * невидимом overflow, — то есть СПРЯТАННОЕ содержимое. Здесь ничего спрятано
 * не было: замер 19.08.2026 дал у всех пунктов scrollHeight равным
 * clientHeight и overflow visible. Пункт честно вырастал под две строки,
 * и обе строки были видны целиком. Расширение сторожа на рейку эту беду
 * НЕ ПОЙМАЛО БЫ — он смотрит на другое свойство. Ловится она только
 * сравнением пунктов между собой, чем этот файл и занят.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

/** Меньше — значит рейка не отрисовалась, и любое «всё совпало» пусто. */
const MIN_ITEMS = 5;

type Rail = {
  items: { label: string; height: number; width: number; scrollWidth: number }[];
  labels: { text: string; height: number }[];
  railRight: number;
};

const readRail = (page: Page): Promise<Rail> =>
  page.evaluate(() => {
    const rail = document.querySelector('.ed-rail');
    if (!rail) throw new Error('нет .ed-rail — мерить нечего');
    const items = Array.from(rail.querySelectorAll('.ed-rail-item')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: (el.textContent ?? '').trim(),
        height: Math.round(r.height * 10) / 10,
        width: Math.round(r.width * 10) / 10,
        scrollWidth: el.scrollWidth,
      };
    });
    const labels = Array.from(rail.querySelectorAll('.ed-rail-label')).map((el) => ({
      text: (el.textContent ?? '').trim(),
      height: Math.round(el.getBoundingClientRect().height * 10) / 10,
    }));
    return { items, labels, railRight: rail.getBoundingClientRect().right };
  });

const openEditor = async (page: Page): Promise<void> => {
  await page.goto('/editor.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
};

test('рейка: у всех пунктов одна высота', async ({ page }) => {
  await openEditor(page);
  const rail = await readRail(page);

  expect(rail.items.length, 'рейка не отрисовалась — сравнивать нечего')
    .toBeGreaterThanOrEqual(MIN_ITEMS);

  const heights = [...new Set(rail.items.map((i) => i.height))];
  expect(
    heights,
    `пункты рейки разной высоты:\n${rail.items.map((i) => `  ${i.label} — ${i.height}`).join('\n')}`,
  ).toHaveLength(1);
});

test('рейка: подпись не переносится на вторую строку', async ({ page }) => {
  await openEditor(page);
  const rail = await readRail(page);

  expect(rail.labels.length, 'подписей не найдено').toBeGreaterThanOrEqual(MIN_ITEMS);

  // Сравниваем подписи между собой, а не с числом: строка в пикселях зависит
  // от гарнитуры машины, и зашитое число сделало бы тест хрупким там, где
  // проверяется совсем другое. Две строки против одной видны и без этого.
  const heights = [...new Set(rail.labels.map((l) => l.height))];
  expect(
    heights,
    `подписи рейки разной высоты — значит какая-то перенеслась:\n${rail.labels.map((l) => `  ${l.text} — ${l.height}`).join('\n')}`,
  ).toHaveLength(1);
});

/**
 * Страховка в обратную сторону.
 *
 * Перенос по букве (`overflow-wrap: anywhere`) убран ради ровных пунктов,
 * но убирать перенос СОВСЕМ нельзя: без него длинная подпись вылезает
 * за рейку и ложится поверх заголовка соседней панели. Это уже случалось
 * и записано в styles.ts у .ed-rail. Тест держит обе стороны сразу:
 * пункты ровные И ничего не торчит наружу.
 */
test('рейка: ни один пункт не вылезает за её край', async ({ page }) => {
  await openEditor(page);
  const rail = await readRail(page);

  const overflowing = rail.items.filter((i) => i.scrollWidth > Math.ceil(i.width) + 1);
  expect(
    overflowing,
    `подпись шире своего пункта:\n${overflowing.map((i) => `  ${i.label} — ${i.scrollWidth} при ${i.width}`).join('\n')}`,
  ).toEqual([]);
});

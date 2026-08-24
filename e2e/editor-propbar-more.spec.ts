/**
 * Полоса свойств после Сессии 48: 13 кнопок расположения (выравнивание
 * объектов, раскладка, слои, «копировать форматирование») убраны с полосы
 * решением владельца 18.08.2026 и переехали в блок «Расположение» панели
 * «Объект» (`panels/Inspector.tsx`), за дверь «Объект» (до Сессии 53 —
 * «Ещё…»). На полосе остаются только пять частых полей стиля (шрифт, кегль,
 * начертание, цвет, `text-align`) и сама дверь.
 *
 * Это НЕ делает полосу помещающейся всегда — задача и не обещала этого.
 * Замер 18.08.2026: одним пяти полям стиля нужно 673 px, а окно 1280
 * с открытым каталогом даёт полосе только 586. Полю попросту неоткуда
 * взяться, если владелец назвал именно эти пять полей частыми и они все
 * остаются на виду. Поэтому здесь ДВЕ разные, одинаково честные проверки:
 * при свёрнутом каталоге (942 px) полоса помещается, при открытом —
 * по-прежнему нет, и обязана об этом сказать (ScrollStrip, Сессия 46).
 *
 * Каждое сочетание «окно × каталог» — ОТДЕЛЬНЫЙ test(), а не цикл внутри
 * одного. Свёрнутость каталога персистится в localStorage
 * (`chrome/layoutStore.ts`, ключ CHROME_LAYOUT_STORAGE_KEY) — прогон
 * нескольких сочетаний на одной странице в одном test() унаследовал бы
 * состояние от предыдущего сочетания и дал бы правдоподобные, но неверные
 * числа. У Playwright контекст (и localStorage) свой на test() — только
 * так состояние не течёт между проверками.
 */
import { expect, test, type Page } from '@playwright/test';
import { openLayers } from './panels.js';

test.use({ viewport: { width: 1280, height: 800 } });

async function openWithSelection(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await openLayers(page);
  await page.getByTestId('element-row-title').click();
  await expect(page.getByTestId('propbar')).toBeVisible();
}

/** clientWidth / scrollWidth самой полосы. */
async function barSize(page: Page): Promise<{ client: number; scroll: number }> {
  return page.evaluate(() => {
    const bar = document.querySelector('.ed-propbar');
    if (!bar) throw new Error('полоса свойств не найдена — тест мерил бы пустоту');
    return { client: bar.clientWidth, scroll: bar.scrollWidth };
  });
}

/**
 * Что должно сломаться, чтобы покраснел: вернуть на полосу хотя бы один
 * из 13 органов расположения (или не убрать какой-то из них вовсе) —
 * при свёрнутом каталоге (942 px) сумма (поля + органы + «Объект», было
 * 1276 px) снова не поместится.
 *
 * Положительный контроль ДО: полоса вообще нашлась и в ней есть поле
 * стиля — иначе «влезло» и «пусто, мерить нечего» неотличимы одно от
 * другого.
 */
test('окно 1280, каталог свёрнут: полоса помещается целиком', async ({ page }) => {
  await openWithSelection(page);

  await expect(page.locator('.ed-propbar-field').first(), 'на полосе нет ни одного поля стиля').toBeVisible();

  await page.getByTestId('collapse-catalog').click();
  // Свёрнутая колонка каталога не рендерится вовсе (Editor.tsx, комментарий
  // у `chromeLayout.catalogCollapsed ? <div aria-hidden /> : <CatalogPanel>`) —
  // это и есть положительный контроль того, что каталог правда свёрнут,
  // а не просто визуально сузился.
  await expect(page.getByTestId('catalog')).toHaveCount(0);

  const size = await barSize(page);
  expect(
    size.scroll,
    `полоса переполнена даже при свёрнутом каталоге: ${size.client} из ${size.scroll}`,
  ).toBeLessThanOrEqual(size.client);
});

/**
 * Что должно сломаться, чтобы покраснел: полоса вдруг стала помещаться
 * при открытом каталоге — то есть кто-то тайно убрал ещё и поля стиля
 * (не входило в задачу, задача снимала только органы расположения)
 * либо признак продолжения (`propbar-scroll-end`) перестал появляться.
 *
 * Положительный контроль: каталог ДЕЙСТВИТЕЛЬНО открыт (ширина ~350 px) —
 * без него «не помещается» и «каталог случайно свёрнут» дали бы одинаково
 * зелёное по разным причинам. Ровно эти грабли нашла соседняя сессия при
 * том же замере 18.08.2026, гоняя несколько сочетаний на одной странице.
 */
test('окно 1280, каталог открыт: полоса по-прежнему не помещается и говорит об этом', async ({ page }) => {
  await openWithSelection(page);

  const catalog = page.getByTestId('catalog');
  await expect(catalog).toBeVisible();
  const catalogBox = await catalog.boundingBox();
  if (!catalogBox) throw new Error('у каталога нет geometry — boundingBox пуст');
  expect(
    catalogBox.width,
    `каталог занимает ${catalogBox.width}px — не похоже на открытый (по умолчанию 361)`,
  ).toBeGreaterThan(300);

  const size = await barSize(page);
  expect(
    size.scroll,
    `полоса помещается (${size.client} из ${size.scroll}) — при открытом каталоге и пяти полях стиля (673px) это арифметически невозможно`,
  ).toBeGreaterThan(size.client);

  await expect(page.getByTestId('propbar-scroll-end')).toBeVisible();
});

/**
 * Органы уехали с полосы, но НЕ пропали: дверь «Объект» доводит до панели
 * «Объект», где стоит блок «Расположение» с теми же кнопками.
 *
 * Что должно сломаться, чтобы покраснел: кнопка потеряна при переносе
 * (а не спрятана переполнением/CSS) — например, если блок «Расположение»
 * получил overflow: hidden с недостаточной высотой и обрезал кнопки, или
 * если сама кнопка не отрендерилась вовсе.
 *
 * ⚠️ Playwright сам прокручивает вложенный контейнер перед щелчком —
 * «нажимается» не доказывает видимости (CLAUDE.md, «Playwright прокручивает
 * вложенное»). Здесь кнопки не нажимаются вовсе: видимость проверяется
 * через clientHeight/scrollHeight панели и elementFromPoint в центре
 * каждой кнопки — то же самое, чем `editor-propbar.spec.ts` проверяет
 * стрелку продолжения.
 */
test('органы расположения достижимы за дверью «Объект»', async ({ page }) => {
  await openWithSelection(page);

  await page.getByTestId('propbar-more').click();
  const inspector = page.getByTestId('inspector');
  await expect(inspector).toBeVisible();

  const overflow = await inspector.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
  }));
  // Панель обязана держать хотя бы половину своего содержимого в кадре —
  // раздавленная почти до нуля панель (CLAUDE.md, «Playwright прокручивает
  // вложенное») прошла бы toBeVisible() зелёной, а автор не увидел бы ничего.
  expect(
    overflow.client,
    `панель «Объект» раздавлена: clientHeight ${overflow.client} при scrollHeight ${overflow.scroll}`,
  ).toBeGreaterThan(overflow.scroll * 0.5);

  for (const id of ['align-left', 'distribute-x', 'layer-front', 'copy-format']) {
    const button = page.getByTestId(id);
    await expect(button, `${id} не найдена в DOM`).toBeVisible();

    const hit = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { coveredBy: at === el || el.contains(at) ? null : (at?.className ?? '(ничего)') };
    });
    expect(hit.coveredBy, `${id} накрыта другим узлом: ${hit.coveredBy}`).toBeNull();
  }
});

/**
 * Панель за дверью не имеет права ВРАТЬ о выделении.
 *
 * Найдено приёмкой Сессии 48 и починено там же. `element` у панели пуст
 * в ДВУХ разных случаях: когда не выделено ничего и когда выделено
 * несколько (полей одного элемента показать нечего). Текст на оба случая
 * стоял один — «Ничего не выделено», — и после переезда органов
 * расположения он оказался прямо под рядом работающих кнопок, которые
 * действуют на выделенную пачку. Панель сообщала автору, что он ничего
 * не выделил, ровно в тот момент, когда он выделил троих.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: свести обе ветки обратно
 * к одному тексту (убрать проверку `selectedCount > 1`).
 *
 * Положительный контроль ОБЯЗАТЕЛЕН: выделение из трёх ДЕЙСТВИТЕЛЬНО
 * набрано. Без него «нет надписи "Ничего не выделено"» получилось бы
 * и оттого, что выделен один элемент и панель показывает его поля, —
 * зелень по совершенно другой причине.
 */
test('панель «Объект»: при нескольких выделенных она не говорит «Ничего не выделено»', async ({
  page,
}) => {
  await page.goto('/editor.html?fixture=transitions', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });

  for (const [index, id] of ['stays', 'goes', 'caption'].entries()) {
    const center = await page.evaluate((selector) => {
      const node = document.querySelector(selector);
      if (!node) throw new Error(`нет узла ${selector}`);
      const box = node.getBoundingClientRect();
      return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
    }, `[data-id="${id}"]`);
    // Shift зажимается КЛАВИАТУРОЙ: у mouse.click полей модификаторов нет
    // вовсе, и лишний ключ в опциях выбрасывается молча (грабля Сессии 28).
    if (index > 0) await page.keyboard.down('Shift');
    await page.mouse.click(center.x, center.y);
    if (index > 0) await page.keyboard.up('Shift');
  }
  // Положительный контроль: выделены именно трое.
  await openLayers(page);
  await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(3);

  await page.getByTestId('propbar-more').click();
  await expect(page.getByTestId('inspector')).toBeVisible();

  await expect(
    page.getByTestId('inspector-empty'),
    'панель говорит «Ничего не выделено» при трёх выделенных',
  ).toHaveCount(0);
  await expect(page.getByTestId('inspector-many')).toBeVisible();

  // Органы расположения при этом живы — ради них панель и открывали.
  await expect(page.getByTestId('align-left')).toBeVisible();
});

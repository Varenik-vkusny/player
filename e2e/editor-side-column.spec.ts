/**
 * Правая колонка: панель выделенной метки обязана быть видна целиком.
 *
 * Проверяем НЕ «нажимается ли» — Playwright перед щелчком сам прокручивает
 * вложенный контейнер и честно нажмёт кнопку внутри 24-пиксельной щели.
 * Проверяем СКОЛЬКО ЕЁ ВИДНО: clientHeight против scrollHeight у самой
 * панели. Замер 17.08.2026 до починки на этой фикстуре и этом окне:
 * 24 из 1427, то есть 1.7 %. (На более широком окне замеряли 24 из 1576 —
 * содержимое панели зависит от ширины, число видимого не зависит вовсе.)
 *
 * Селектор везде `.ed-side > .ed-inspector`, а не просто `.ed-inspector`:
 * класс носят ДВЕ разные панели — MarkPanel в правой колонке и Inspector
 * в панели каталога («Объект», Editor.tsx). Панель каталога стоит раньше
 * в порядке документа, поэтому голый querySelector отдал бы её, стоит ей
 * оказаться открытой, и тест мерил бы не тот предмет — молча и правдоподобно.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test('панель выделенной метки не прокручивается внутри себя', async ({ page }) => {
  await openEditor(page, 'two-gates');
  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();

  const size = await page.evaluate(() => {
    const insp = document.querySelector('.ed-side > .ed-inspector');
    if (!insp) throw new Error('панель метки не найдена — тест мерил бы пустоту');
    return { client: insp.clientHeight, scroll: insp.scrollHeight };
  });

  // Положительный контроль: панель действительно с содержимым, а не пустая.
  expect(size.scroll, 'панель пуста — проверять нечего').toBeGreaterThan(200);
  // Собственно проверка: содержимое не обрезано своим же контейнером.
  expect(size.client, `видно ${size.client} из ${size.scroll}`)
    .toBeGreaterThanOrEqual(size.scroll);
});

/**
 * Договор колонки: прокручивается она целиком, подпанели растут по
 * содержимому. Значит низ панели метки обязан доставаться прокруткой
 * САМОЙ КОЛОНКИ — без второй прокрутки внутри панели.
 *
 * Поэтому колонку здесь крутим руками (`side.scrollTop`), а не зовём
 * `scrollIntoViewIfNeeded`: тот прокрутил бы и вложенный контейнер тоже,
 * то есть добрался бы до кнопки и через раздавленную панель — и тест
 * остался бы зелёным ровно в том состоянии, ради которого написан.
 *
 * Что должно сломаться, чтобы покраснел: панель снова становится
 * сжимаемой (снять `flex: 0 0 auto`) — её содержимое уезжает за пределы
 * 24-пиксельной щели, и низ панели не достаётся прокруткой колонки вовсе.
 */
test('низ панели метки достаётся прокруткой самой колонки', async ({ page }) => {
  await openEditor(page, 'two-gates');
  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();

  const probe = await page.evaluate(() => {
    const side = document.querySelector('.ed-side');
    const panel = document.querySelector('.ed-side > .ed-inspector');
    const last = document.querySelector('[data-testid="mark-remove"]');
    if (!side || !panel || !last) throw new Error('колонка, панель метки или её низ не найдены');

    side.scrollTop = side.scrollHeight;

    const s = side.getBoundingClientRect();
    const l = last.getBoundingClientRect();
    return {
      panelScroll: panel.scrollHeight,
      inside: l.top >= s.top - 1 && l.bottom <= s.bottom + 1,
      low: Math.round(l.top),
      high: Math.round(l.bottom),
      sideTop: Math.round(s.top),
      sideBottom: Math.round(s.bottom),
    };
  });

  // Положительный контроль: панель действительно длинная, иначе доставать нечего.
  expect(probe.panelScroll, 'панель пуста — доставать нечего').toBeGreaterThan(200);
  expect(
    probe.inside,
    `низ панели на ${probe.low}..${probe.high} при колонке ${probe.sideTop}..${probe.sideBottom}`,
  ).toBe(true);
});

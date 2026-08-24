/**
 * Панель выделенной метки обязана быть видна ЦЕЛИКОМ.
 *
 * ОТКУДА ЭТОТ ФАЙЛ. Замер 17.08.2026, фикстура two-gates, окно 1280×800:
 * панель метки показывала 24 px из 1427 — 1.7 %. Она была единственным
 * сжимаемым ребёнком правой колонки (все соседи объявлены `flex: 0 0 auto`),
 * и всю нехватку вычитали из неё одной. Собственный `overflow: auto` делал
 * это МОЛЧА: панель существовала, отвечала на запросы, кнопки внутри
 * нажимались — Playwright перед щелчком сам прокручивает вложенный
 * контейнер и честно нажмёт кнопку внутри 24-пиксельной щели.
 *
 * Поэтому здесь меряется СКОЛЬКО ЕЁ ВИДНО (clientHeight против
 * scrollHeight), а не «нажимается ли». Проверка нажатием была бы зелёной
 * ровно в том состоянии, ради которого файл написан.
 *
 * ЧТО ПЕРЕЕХАЛО, А ЧТО УБРАНО В СЕССИИ 55 — вслух, потому что тихое
 * сокращение набора тестов в отчёте выглядит как выполненная работа:
 *
 *   • «низ панели метки достаётся прокруткой самой колонки» ПЕРЕЕХАЛ,
 *     а не убран. Роль колонки играет тело панели каталога
 *     (`.ed-catalog-body`), и договор ровно тот же: прокручивается ОНО,
 *     а панель внутри растёт по содержимому. Замер 23.08.2026, two-gates,
 *     окно 1280×800: панель 1194 из 1194 (себя не режет), тело 647 из 1226
 *     (прокручивается). Первая попытка написать этот файл утверждала
 *     обратное — что прокручивать нечего, — и была бы красной на исправном
 *     коде. Спасла проверка живым браузером, не рассуждение.
 *
 *   • «секции правой колонки складываются и колонка укорачивается» УБРАН.
 *     Тест складывал секцию «Главы», стоявшую в одной колонке с панелью
 *     метки, и мерил, что колонка укоротилась на 300+ px из 900+. Главы
 *     теперь отдельная панель за своей дверью; в одной колонке с меткой
 *     их нет, и складывать в ней нечего.
 */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: панель метки снова начинает
 * прятать своё содержимое внутри себя — например, получает собственный
 * `overflow: auto` при нехватке высоты. Тогда `client` станет меньше
 * `scroll`, и в сообщении будут оба числа.
 *
 * Меряется ТЕЛО ПАНЕЛИ КАТАЛОГА, а не сама `.ed-inspector`: прокрутка
 * поручена телу, и обрезка, случись она, произойдёт там. Класс
 * `.ed-inspector` при этом носят ДВЕ разные панели — метка и «Объект», —
 * поэтому голый селектор по нему отдавал бы разное в разных состояниях.
 */
test('панель выделенной метки видна целиком, а не щелью', async ({ page }) => {
  await openEditor(page, 'two-gates');

  // Выбор метки И ЕСТЬ дверь: своей у панели метки нет и быть не может —
  // без выбранной метки показывать нечего (Editor.tsx, автооткрытие).
  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();

  const size = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="mark-panel"]');
    if (!panel) throw new Error('панель метки не найдена — тест мерил бы пустоту');
    const body = document.querySelector('.ed-catalog-body');
    if (!body) throw new Error('тело панели каталога не найдено');
    return {
      client: body.clientHeight,
      scroll: body.scrollHeight,
      panelScroll: panel.scrollHeight,
      panelClient: panel.clientHeight,
    };
  });

  // Положительный контроль: панель действительно с содержимым, а не пустая.
  // Без него тест был бы зелёным на пустом экране — 0 не больше 0.
  expect(size.panelScroll, 'панель пуста — проверять нечего').toBeGreaterThan(200);

  // Панель не режет себя сама.
  expect(size.panelClient, `панель показывает ${size.panelClient} из ${size.panelScroll}`)
    .toBeGreaterThanOrEqual(size.panelScroll);

  // А колонка ОБЯЗАНА прокручиваться: содержимое панели длиннее окна,
  // и без прокрутки её низ до автора не доезжает. Это положительный
  // контроль к проверке ниже — без него «прокрутилась» и «нечего было
  // прокручивать» выглядели бы одинаково.
  expect(size.scroll, 'колонке нечего прокручивать — проверять нечего')
    .toBeGreaterThan(size.client);
});

/**
 * Низ панели метки доезжает до автора прокруткой колонки.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: тело панели каталога теряет свою прокрутку
 * (`overflow-y: auto`) — низ панели становится недостижим вовсе, а не
 * «неудобен»: последний орган панели для автора перестаёт существовать.
 *
 * Крутим `scrollTop` руками, а НЕ зовём `scrollIntoViewIfNeeded`: тот
 * прокрутил бы и вложенные контейнеры тоже, то есть добрался бы до низа
 * даже через раздавленную панель — и тест остался бы зелёным ровно
 * в том состоянии, ради которого написан.
 */
test('низ панели метки доезжает прокруткой колонки', async ({ page }) => {
  await openEditor(page, 'two-gates');
  await page.locator('.ed-mark-gate').first().click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();

  const scrolled = await page.evaluate(() => {
    const body = document.querySelector('.ed-catalog-body');
    if (!body) throw new Error('тело панели каталога не найдено');
    body.scrollTop = body.scrollHeight;
    return { top: body.scrollTop, max: body.scrollHeight - body.clientHeight };
  });

  expect(scrolled.max, 'прокручивать нечего — проверка пуста').toBeGreaterThan(0);
  expect(scrolled.top, `прокрутилось ${scrolled.top} из ${scrolled.max}`)
    .toBe(scrolled.max);

  // И низ панели ПОСЛЕ прокрутки действительно на экране: число scrollTop
  // само по себе не доказывает, что автор что-то увидел.
  const bottomVisible = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="mark-panel"]');
    const body = document.querySelector('.ed-catalog-body');
    if (!panel || !body) throw new Error('панель или колонка не найдены');
    const p = panel.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    return p.bottom <= b.bottom + 1;
  });
  expect(bottomVisible, 'низ панели остался за краем колонки').toBe(true);
});

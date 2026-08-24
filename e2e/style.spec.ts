/**
 * Срез 5: секция «Вид» панели свойств — правка стиля через восемь полей
 * `state/style.ts` (ADR-012).
 *
 * Критерий приёмки сессии — правка стиля даёт одинаковый вид элемента
 * в редакторе и в плеере. Каждый тест нажимает по видимому полю панели,
 * а не подставляет значение в состояние в обход интерфейса: проверка
 * «вызвался ли onChange» была бы зелёной при любом дефекте раскладки
 * (перепутанный `htmlFor`, не тот `onChange`, забытый импорт виджета)
 * и не отличила бы работающее поле от красивого, но неподключённого.
 *
 * `<input type="color">` — особый случай: «нажать» на него по-настоящему
 * означает открыть системный OS-диалог выбора цвета, а его не открывает
 * ни Playwright, ни любой другой браузерный e2e-фреймворк — это не веб-код,
 * над ним нет DOM. Единственный работающий аналог нажатия — установить
 * `.value` на настоящем узле и дать браузеру породить настоящее событие
 * `input`, ровно как это делает браузер сам после закрытия диалога с выбором.
 * React слушает то же событие на том же узле, что и от реального пикера, —
 * поэтому это не вызов обработчика в обход интерфейса, а тот же путь, каким
 * прошло бы взаимодействие автора, минус недоступную саму системную часть.
 */
import { expect, test, type Page } from '@playwright/test';
import { openLayers } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

/** Симулирует выбор цвета в системном пикере — см. комментарий в шапке файла. */
async function pickColor(page: Page, label: string, hex: string): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await input.evaluate((node, value) => {
    const el = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
}

async function computedOf(
  page: Page,
  id: string,
  property: 'color' | 'fontWeight' | 'fontSize' | 'borderRadius' | 'backgroundColor',
): Promise<string> {
  return page.evaluate(
    ({ elementId, prop }) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      return getComputedStyle(node)[prop];
    },
    { elementId: id, prop: property },
  );
}

test.describe('секция «Вид»: правка стиля элемента', () => {
  test('border-radius: 50% у dot из demo.json — элемент выделяется, панель показывает значение и не падает', async ({
    page,
  }) => {
    const errors = await openEditor(page, 'demo');

    // dot невидим на нулевой секунде (анимация появления на слове №58) —
    // выделяем через список, а не кликом по сцене, тем же приёмом, что
    // в e2e/editor-authoring.spec.ts.
    await openLayers(page);
    await page.getByTestId('element-row-dot').click();
    await expect(page.getByTestId('selection-readout')).toContainText('dot');

    // Полный состав свойств живёт в панели «Объект» (Сессия 30): на полосе
    // над холстом только частые поля, за остальным — одна дверь «Ещё…».
    await page.getByTestId('propbar-more').click();

    // Панель жива и показывает секцию — заголовок виден, приложение не упало.
    const inspector = page.getByTestId('inspector');
    await expect(inspector.getByText('Вид', { exact: true })).toBeVisible();

    // Поиск СУЖЕН до инспектора намеренно. «Скругление» — частое поле фигуры,
    // поэтому при открытой панели «Объект» оно есть на экране дважды: на полосе
    // и в панели. Это не дефект, а решение (панель обязана показывать полный
    // состав, иначе автор решит, что поля нет вовсе), но строгий режим
    // Playwright на двух совпадениях падает. Здесь проверяется ПАНЕЛЬ.
    const amount = inspector.getByLabel('Скругление', { exact: true });
    await expect(amount).toHaveValue('50');
    const unit = inspector.getByLabel('Скругление: единица');
    await expect(unit).toHaveValue('%');

    expect(errors, 'панель не имеет права падать на border-radius: 50%').toEqual([]);
  });

  test('раздел «Вид» показывает значения, которые модуль не понимает, текстом, а не роняет панель', async ({
    page,
  }) => {
    // card в demo.json несёт border: '2px solid #2c3a4d' — ключ вне набора
    // восьми (state/style.ts). Секция обязана показать его как есть, а не
    // промолчать и не упасть.
    const errors = await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-card').click();
    await expect(page.getByTestId('selection-readout')).toContainText('card');
    expect(errors, 'панель не имеет права падать на незнакомый ключ style').toEqual([]);
  });

  test('правка цвета через color picker меняет вид элемента одинаково в редакторе и в плеере', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-lead').click();
    await expect(page.getByTestId('selection-readout')).toContainText('lead');

    await pickColor(page, 'Цвет', '#ff00aa');

    const editorColor = await computedOf(page, 'lead', 'color');
    expect(editorColor).toBe('rgb(255, 0, 170)');

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });

    const playerColor = await player.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="lead"]');
      if (!node) throw new Error('нет узла lead в плеере');
      return getComputedStyle(node).color;
    });
    expect(playerColor, 'плеер обязан показать тот же цвет, что редактор').toBe(editorColor);
  });

  test('правка выбора из списка (насыщенность шрифта) применяется к сцене', async ({ page }) => {
    await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-title').click();
    await expect(page.getByTestId('selection-readout')).toContainText('title');

    // title в demo.json: font-weight 700.
    expect(await computedOf(page, 'title', 'fontWeight')).toBe('700');

    await page.getByLabel('Насыщенность').selectOption('400');

    await expect.poll(() => computedOf(page, 'title', 'fontWeight')).toBe('400');
  });

  test('правка длины (кегль) числовым полем меняет размер шрифта на сцене', async ({ page }) => {
    await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-footer').click();
    await expect(page.getByTestId('selection-readout')).toContainText('footer');

    // footer в demo.json: font-size 28px.
    expect(await computedOf(page, 'footer', 'fontSize')).toBe('28px');

    await page.getByLabel('Кегль, px').fill('64');

    await expect.poll(() => computedOf(page, 'footer', 'fontSize')).toBe('64px');
  });

  test('переключение единицы border-radius (px → %) меняет форму элемента на сцене', async ({
    page,
  }) => {
    await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-card').click();
    await expect(page.getByTestId('selection-readout')).toContainText('card');

    const before = await computedOf(page, 'card', 'borderRadius');

    await page.getByLabel('Скругление: единица').selectOption('%');
    await page.getByLabel('Скругление', { exact: true }).fill('50');

    await expect.poll(() => computedOf(page, 'card', 'borderRadius')).not.toBe(before);
  });

  /**
   * Тема доезжает до DOM — проверка того, что поле схемы v9 на что-то влияет.
   *
   * Юнит-тестом это непроверяемо: `environment: 'node'`, DOM нет вовсе,
   * а `applyTheme` пишет CSS-переменные на живой узел. Значит проверка
   * обязана быть здесь, в браузере.
   *
   * Что должно сломаться, чтобы тест покраснел: снятый вызов `applyTheme`
   * в конструкторе `SlideEngine`. Тогда переменной на контейнере не будет,
   * ссылка `var(--scene-surface, #1b2430)` уедет на запас — цвет совпадёт,
   * а первая половина проверки упадёт. Поэтому проверяются ОБЕ: и что
   * переменная объявлена, и что элемент ею покрашен.
   */
  test('тема сцены записана переменными на контейнер, и элемент ею покрашен', async ({ page }) => {
    const errors = await openEditor(page, 'demo');

    const declared = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="card"]');
      if (!node) return null;
      const host = node.parentElement;
      return host ? host.style.getPropertyValue('--scene-surface').trim() : null;
    });
    expect(declared, 'роль --scene-surface не объявлена на контейнере сцены').toBe('#1b2430');

    // Ссылка на роль обязана дать тот же цвет, что даёт роль.
    expect(await computedOf(page, 'card', 'backgroundColor')).toBe('rgb(27, 36, 48)');

    expect(errors).toEqual([]);
  });

  /**
   * Опирается на данные фикстуры: у элемента `card` в `demo.json` значение
   * `style.background` — ссылка на роль темы `var(--scene-surface, #1b2430)`.
   *
   * Правка фикстуры сделана 05.08.2026 по решению владельца и НЕ ради
   * зелени теста: без неё эталонный набор вообще не покрывал третий вид
   * значения, появившийся в v9. Цена доказуема, а не правдоподобна —
   * ссылка рисуется тем же цветом, что прежний голый `#1b2430`, и до
   * применения темы (сработает запас), и после (умолчание роли — тот же
   * `#1b2430`). Поэтому все 80 скриншотных эталонов обязаны остаться
   * в нуле пикселей, и это проверено прогоном.
   */
  test('ссылка на роль темы показывается панелью как роль, а не как «не распознано», и её можно отвязать', async ({
    page,
  }) => {
    const errors = await openEditor(page, 'demo');
    await openLayers(page);
    await page.getByTestId('element-row-card').click();
    await expect(page.getByTestId('selection-readout')).toContainText('card');

    // Панель обязана показать ИМЯ роли — не сырую строку var(...) и не
    // «не распознано» (та же строка раньше не проходила через tryColor).
    const tokenField = page.getByLabel('Фон (роль темы)', { exact: true });
    await expect(tokenField).toBeVisible();
    await expect(tokenField).toHaveValue('--scene-surface');
    await expect(page.getByText('Фон (не распознано)')).toHaveCount(0);

    const before = await computedOf(page, 'card', 'backgroundColor');

    // Нажимаем по ВИДИМОЙ кнопке — не вызываем обработчик в обход интерфейса.
    await page.getByRole('button', { name: 'Отвязать от темы' }).click();

    // Вид на сцене не должен скакнуть: запасное значение и было тем, что рисовалось.
    const afterDetach = await computedOf(page, 'card', 'backgroundColor');
    expect(afterDetach).toBe(before);

    // Поле стало обычным редактируемым цветом — не иллюзия смены подписи:
    // правка через тот же color picker, что и у любого другого цвета,
    // реально меняет сцену.
    const colorField = page.getByLabel('Фон', { exact: true });
    await expect(colorField).toBeVisible();
    await pickColor(page, 'Фон', '#ff00aa');
    await expect.poll(() => computedOf(page, 'card', 'backgroundColor')).toBe('rgb(255, 0, 170)');

    expect(errors, 'панель не имеет права падать на ссылку на роль темы').toEqual([]);
  });
});

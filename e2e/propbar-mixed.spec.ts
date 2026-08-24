/**
 * Полоса свойств при НЕСКОЛЬКИХ выделенных: «разное» вместо значения первого
 * (Сессия 32).
 *
 * До этой сессии полоса показывала значение первого выделенного как будто оно
 * общее. Дефект был невидим по всем признакам, которые обычно ловят: цвет
 * настоящий, поле рабочее, ни ошибки, ни предупреждения, ни одного красного
 * теста. Автор узнавал правду, только поправив цвет троих и получив не то,
 * что видел на экране.
 *
 * Фикстура `morph` проверяет ОБЕ стороны правила одним выделением, и это
 * не совпадение, а причина её выбора: у `mover` и `leaver` фон РАЗНЫЙ
 * (`#3b82f6` против `#e4572e`), а скругление ОДИНАКОВОЕ (`16px` у обоих).
 * Реализация, которая метит «разным» всё подряд, зелёной здесь не будет —
 * её поймает проверка про скругление.
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

/**
 * Клик по элементу НА СЦЕНЕ, `shift` — добавить к выделению.
 *
 * Shift зажимается КЛАВИАТУРОЙ вокруг клика, а не передаётся опцией:
 * у `page.mouse.click` полей модификаторов нет вовсе, и переданный лишний
 * ключ молча выбрасывается — тест выглядел бы как проверка Shift, а кликал
 * бы без него (тот же приём и та же причина, что в `multi-select.spec.ts`).
 */
async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

/**
 * Симулирует выбор цвета в системном пикере.
 *
 * «Нажать» на `<input type="color">` по-настоящему значит открыть системный
 * диалог, а его не открывает ни Playwright, ни любой другой браузерный e2e:
 * это не веб-код, над ним нет DOM. Работающий аналог — поставить `.value`
 * на настоящем узле и дать браузеру породить настоящее событие `input`,
 * ровно как он делает сам после закрытия диалога (тот же приём, что
 * в `style.spec.ts`, где он разобран подробно).
 */
async function pickColor(page: Page, label: string, hex: string): Promise<void> {
  await page.getByLabel(label, { exact: true }).evaluate((node, value) => {
    const input = node as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, hex);
}

async function backgroundOf(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    return getComputedStyle(node).backgroundColor;
  }, id);
}

async function selectBothShapes(page: Page): Promise<void> {
  await clickElement(page, 'mover');
  await clickElement(page, 'leaver', true);
  await openLayers(page);
  await expect(page.locator('.ed-element-row[aria-pressed="true"]')).toHaveCount(2);
}

test.describe('полоса свойств: «разное» у нескольких выделенных', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: полоса снова выдала значение
   * первого выделенного за общее — подпись поля осталась «Фон», а образец
   * показал синий цвет `mover`.
   */
  test('разный фон помечен «разное», и образец не показывает цвет первого', async ({ page }) => {
    const errors = await openEditor(page, 'morph');
    await selectBothShapes(page);

    const propbar = page.getByTestId('propbar');
    const mixed = propbar.getByLabel('Фон — разное', { exact: true });
    await expect(mixed).toBeVisible();

    // Несущая часть проверки. Подпись могла бы говорить «разное», а образец
    // при этом по-прежнему показывать цвет первого — вранью хватило бы
    // и этого: автор смотрит на цвет, а не читает подпись.
    await expect(mixed).not.toHaveValue('#3b82f6');
    await expect(mixed).not.toHaveValue('#e4572e');

    expect(errors, 'полоса не имеет права падать на выделении пачкой').toEqual([]);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: пометка «разное» уехала обратно
   * в ПОДПИСЬ поля — и стала невидимой.
   *
   * Тест куплен настоящим дефектом этой же сессии. Первая реализация несла
   * слово «разное» только в подписи, и все три теста выше были зелёными:
   * `getByLabel` подпись находит. А автор не видел НИЧЕГО — подписи полей
   * на полосе свойств визуально скрыты (`.ed-propbar-field .ed-insp-label`:
   * `width: 1px`, `clip-path: inset(50%)`). Нашлось снимком, ни одна
   * обычная проверка этого поймать не могла.
   *
   * Поэтому здесь меряется то, что видно глазами: штриховка на поле есть
   * при пачке и её нет у одного выделенного.
   */
  test('пометка «разное» ВИДНА: поле заштриховано, а у одного выделенного — нет', async ({
    page,
  }) => {
    await openEditor(page, 'morph');
    const propbar = page.getByTestId('propbar');

    await selectBothShapes(page);
    const mixedFill = await propbar
      .getByLabel('Фон — разное', { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(mixedFill, 'у пачки без общего цвета поле обязано быть заштриховано').toContain(
      'repeating-linear-gradient',
    );

    // Схлопываем выделение до одного — штриховка обязана исчезнуть, иначе
    // «разное» перестаёт что-либо значить.
    await clickElement(page, 'mover');
    const singleFill = await propbar
      .getByLabel('Фон', { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundImage);
    expect(singleFill, 'у одного выделенного цвет общий, штриховке взяться неоткуда').toBe('none');
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: «разным» стало метиться всё
   * подряд, без сравнения значений, — тогда общее скругление тоже получило
   * бы подпись «Скругление — разное» и пустое поле.
   */
  test('одинаковое скругление остаётся общим значением, а не «разным»', async ({ page }) => {
    await openEditor(page, 'morph');
    await selectBothShapes(page);

    const propbar = page.getByTestId('propbar');
    await expect(propbar.getByLabel('Скругление', { exact: true })).toHaveValue('16');
    await expect(propbar.getByLabel('Скругление — разное', { exact: true })).toHaveCount(0);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: поле «разное» стало витриной
   * без действия за ней. Помеченное, но неработающее поле хуже врущего:
   * автор нажимает и решает, что редактор сломан.
   */
  test('по полю «разное» задаётся общее значение — оно применяется ко ВСЕМ', async ({ page }) => {
    await openEditor(page, 'morph');
    await selectBothShapes(page);

    await pickColor(page, 'Фон — разное', '#00ff88');

    expect(await backgroundOf(page, 'mover')).toBe('rgb(0, 255, 136)');
    expect(await backgroundOf(page, 'leaver')).toBe('rgb(0, 255, 136)');

    // И «разное» обязано исчезнуть: общее значение теперь есть.
    const propbar = page.getByTestId('propbar');
    await expect(propbar.getByLabel('Фон — разное', { exact: true })).toHaveCount(0);
    await expect(propbar.getByLabel('Фон', { exact: true })).toHaveValue('#00ff88');
  });
});

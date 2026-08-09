/**
 * Хром редактора по каркасу `design/index.html` (Сессия 30).
 *
 * Проверяется то, что автор делает руками: выбирает категорию на рельсе,
 * правит частые свойства прямо над холстом, за редкими лезет в «Объект»
 * и сворачивает панели, когда они мешают.
 *
 * Почему тесты именно такие. Проверка «вызвался ли обработчик» была бы
 * зелёной у сломанного интерфейса — этим уже дважды ловили дефекты
 * наложения (гейт в Сессии 11, полоска расположения в Сессии 29). Поэтому
 * здесь всё нажимается по видимой кнопке и проверяется тем, что видит
 * автор: составом полосы и ШИРИНОЙ холста в пикселях.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

const stageWidth = async (page: Page): Promise<number> => {
  const box = await page.locator('.ed-stage-host').boundingBox();
  if (!box) throw new Error('сцена не видна');
  return box.width;
};

test.describe('рельс каталогов', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: панель перестала считаться
   * из выбранной категории — например, все заготовки снова показываются
   * разом, как было до переезда каталога налево.
   */
  test('категория на рельсе меняет содержимое панели каталога', async ({ page }) => {
    await openEditor(page, 'demo');

    // Каталог открывается на шаблонах: заготовок элементов на экране нет.
    await expect(page.getByTestId('template-question')).toBeVisible();
    await expect(page.getByTestId('insert-shape')).toHaveCount(0);

    await page.getByTestId('rail-shapes').click();
    await expect(page.getByTestId('insert-shape')).toBeVisible();
    await expect(page.getByTestId('template-question')).toHaveCount(0);

    // Текст и фигуры — РАЗНЫЕ категории, а не одна панель со всем подряд.
    await expect(page.getByTestId('insert-text')).toHaveCount(0);
    await page.getByTestId('rail-text').click();
    await expect(page.getByTestId('insert-text')).toBeVisible();
    await expect(page.getByTestId('insert-shape')).toHaveCount(0);
  });
});

test.describe('полоса свойств над холстом', () => {
  /**
   * Состав полосы считается из типа выделенного, а не задан списком.
   * У текста частые поля — про буквы, у фигуры — про заливку и скругление,
   * и это РАЗНЫЕ наборы.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: отбор перестал зависеть от типа
   * (тогда «Скругление» появится у текста) или частые поля перестали
   * попадать на полосу вовсе.
   */
  test('состав полосы зависит от типа выделенного', async ({ page }) => {
    await openEditor(page, 'demo');

    await page.getByTestId('element-row-title').click();
    await expect(page.getByTestId('selection-readout')).toContainText('title');
    await expect(page.getByLabel('Кегль, px', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Скругление', { exact: true })).toHaveCount(0);

    await page.getByTestId('element-row-card').click();
    await expect(page.getByTestId('selection-readout')).toContainText('card');
    await expect(page.getByLabel('Скругление', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Кегль, px', { exact: true })).toHaveCount(0);
  });

  /**
   * Редкие свойства на полосу не выносятся — за ними одна дверь, «Ещё…».
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: геометрия уехала обратно на полосу
   * (тогда «Ширина, px» найдётся до нажатия) или кнопка перестала открывать
   * панель «Объект» (тогда не найдётся и после).
   */
  test('«Ещё…» открывает «Объект», и там лежит то, чего нет на полосе', async ({ page }) => {
    await openEditor(page, 'demo');

    await page.getByTestId('element-row-card').click();
    await expect(page.getByLabel('Ширина, px', { exact: true })).toHaveCount(0);

    await page.getByTestId('propbar-more').click();

    await expect(page.getByTestId('inspector')).toBeVisible();
    await expect(page.getByLabel('Ширина, px', { exact: true })).toBeVisible();
  });
});

test.describe('сворачивание панелей', () => {
  /**
   * Заказано владельцем 09.08.2026 дословно: «чтобы не всегда надо было
   * на них пялиться».
   *
   * Проверяется НЕ состояние кнопки, а ширина холста в пикселях: автор
   * сворачивает панель ради места, и если место не появилось, кнопка
   * бесполезна, даже когда `aria-expanded` переключился честно.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: свёрнутая панель продолжила
   * занимать колонку в сетке — например, ширину задали классом, а не
   * переменной, и она перестала обнуляться.
   */
  test('свёрнутый каталог отдаёт своё место холсту', async ({ page }) => {
    await openEditor(page, 'demo');

    const before = await stageWidth(page);
    await page.getByTestId('collapse-catalog').click();
    const after = await stageWidth(page);

    // Панель каталога 350px; берём запас вниз, чтобы проверка не зависела
    // от толщины границы и от того, какая ширина сохранена в хранилище.
    expect(after - before, 'холст не получил место свёрнутой панели').toBeGreaterThan(300);

    // Дорога назад обязана быть: свернул и не вернул — это не «свернул».
    await page.getByTestId('rail-shapes').click();
    await expect(page.getByTestId('insert-shape')).toBeVisible();
    expect(await stageWidth(page), 'панель не вернулась нажатием по рельсу')
      .toBeLessThan(after - 300);
  });
});

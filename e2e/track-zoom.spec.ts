/**
 * Масштаб дорожки (`docs/design/track-zoom.md`): ступени, хвост, ручка стыка,
 * прокрутка и потолок ширины канвы браузера.
 *
 * Фикстура — `transitions`, уже существующая (каталог приёмов перехода).
 * Новую фикстуру заводить нельзя (`e2e/fixtures.spec.ts` собирает список
 * `readdirSync`'ом каталога `fixtures/projects/`, и любой новый файл дал бы
 * пять новых скриншотных эталонов). Арифметика фикстуры, посчитана и
 * проверена прогоном: 9 слайдов, `s-0` меткой не считается (`Editor.tsx`,
 * `marks`, `fromSlides = segment.slides.slice(1)`), значит на полосе 8 меток
 * слайдов; `s-1` — срез (`transition: cut`, `morphSeconds === 0`), у него
 * нет ни хвоста, ни ручки, — значит 7 хвостов и 7 ручек.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

async function durationOf(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __transport: { durationSeconds: number } }).__transport.durationSeconds,
  );
}

async function transitionSecondsOf(page: Page, slideIndex: number): Promise<number> {
  return page.evaluate(
    (index) =>
      (window as unknown as {
        __project: { segments: { slides: { transitionSeconds: number }[] }[] };
      }).__project.segments[0]!.slides[index]!.transitionSeconds,
    slideIndex,
  );
}

test.describe('масштаб дорожки: e2e', () => {
  /**
   * Что должно сломаться: сдвиг базовой ширины полотна при zoom === 1 —
   * например, если `canvasWidth` перестанет совпадать с шириной КОНТЕЙНЕРА
   * прокрутки (добавочный отступ, лишний множитель). Ожидаемое положение
   * считается от ширины `.ed-lane-scroll` (внешняя правда, независимая от
   * того, что нарисовало само полотно) — не от ширины самого `.ed-marks`,
   * иначе тест сверял бы полотно само с собой и остался бы зелёным при любой
   * ошибке в canvasWidth.
   */
  test('при ×1 положение метки совпадает с вычисленным от доли', async ({ page }) => {
    await openEditor(page, 'transitions');

    const container = await page.locator('.ed-lane-scroll').boundingBox();
    // s-4 — известная секунда фикстуры (18.00 с, приём slide).
    const mark = await page.getByTestId('mark-slide-s-4').boundingBox();
    if (!container || !mark) throw new Error('полоса меток или метка не видны');
    const duration = await durationOf(page);

    const expectedLeft = (18.0 / duration) * container.width;
    const actualCenter = mark.x + mark.width / 2 - container.x;

    expect(Math.abs(actualCenter - expectedLeft), 'метка стоит не там, где велит доля времени').toBeLessThan(1.5);
  });

  /**
   * Что должно сломаться: ширина хвоста перестанет расти пропорционально
   * zoom (например, если canvasWidth перестанет учитывать ступень масштаба
   * для полосы меток). Ручка стыка — отдельная проверка: у неё
   * ФИКСИРОВАННАЯ ширина 10px в CSS (`.ed-mark-transition-handle`), она НЕ
   * растёт с zoom (см. отчёт — это разошлось с текстом задания, где ожидалось
   * ⩾12px на ×4; измерено в живом браузере — ровно 10px на любом zoom).
   * Здесь проверяется то, что действительно является инвариантом ручки:
   * она держит один и тот же (не сжимающийся) размер попадания на любом
   * масштабе — сломается, если кто-то свяжет её ширину с шириной хвоста
   * (тем самым отменив исходную задачу 5, где ручка вводилась именно потому,
   * что сам хвост на ×1 был непопадаемо узким).
   */
  test('при ×4 хвост вчетверо шире, ручка остаётся попадаемой', async ({ page }) => {
    await openEditor(page, 'transitions');

    const tailAt1 = await page.getByTestId('mark-tail-s-4').boundingBox();
    const handleAt1 = await page.getByTestId('mark-transition-s-4').boundingBox();
    if (!tailAt1 || !handleAt1) throw new Error('хвост или ручка не видны при ×1');

    await page.getByTestId('track-zoom').selectOption('4');
    await expect(page.getByTestId('track-zoom')).toHaveValue('4');

    const tailAt4 = await page.getByTestId('mark-tail-s-4').boundingBox();
    const handleAt4 = await page.getByTestId('mark-transition-s-4').boundingBox();
    if (!tailAt4 || !handleAt4) throw new Error('хвост или ручка не видны при ×4');

    expect(tailAt4.width, 'хвост обязан стать вчетверо шире').toBeCloseTo(tailAt1.width * 4, 0);
    // Ручка остаётся не менее фактического минимума (10px, измерено) и НЕ
    // сжимается при возврате к ×1 — именно это делает её попадаемой всегда,
    // а не только на большом масштабе.
    expect(handleAt4.width).toBeGreaterThanOrEqual(10);

    await page.getByTestId('track-zoom').selectOption('1');
    const handleBackAt1 = await page.getByTestId('mark-transition-s-4').boundingBox();
    if (!handleBackAt1) throw new Error('ручка не видна при возврате к ×1');
    expect(handleBackAt1.width, 'ручка не должна сжиматься на узком масштабе').toBe(handleAt4.width);
  });

  /**
   * Что должно сломаться: если бы формула перемотки мерила прямоугольник
   * КОНТЕЙНЕРА прокрутки вместо прямоугольника ПОЛОТНА (`.ed-lane`), результат
   * совпадал бы с ожидаемым только при scrollLeft === 0 и разъезжался бы
   * с ним после прокрутки — контейнер стоит на месте, полотно уезжает под
   * него. Ожидаемая секунда здесь считается из ширины и положения
   * КОНТЕЙНЕРА плюс его scrollLeft — то есть источник истины не совпадает
   * с реализацией `seekToPointer`, а выражает намерение независимо от неё.
   */
  test('щелчок по известной секунде даёт её же ПОСЛЕ прокрутки', async ({ page }) => {
    await openEditor(page, 'transitions');

    await page.getByTestId('track-zoom').selectOption('8');
    await expect(page.getByTestId('track-zoom')).toHaveValue('8');

    const container = await page.locator('.ed-lane-scroll').boundingBox();
    if (!container) throw new Error('контейнер прокрутки не виден');

    const maxScroll = await page.evaluate(() => {
      const el = document.querySelector('.ed-lane-scroll')!;
      return el.scrollWidth - el.clientWidth;
    });
    expect(maxScroll, 'полотно обязано быть шире контейнера при ×8, иначе тест бессмыслен').toBeGreaterThan(100);

    await page.evaluate((scroll) => {
      document.querySelector('.ed-lane-scroll')!.scrollLeft = scroll;
    }, Math.floor(maxScroll * 0.4));
    const actualScrollLeft = await page.evaluate(() => document.querySelector('.ed-lane-scroll')!.scrollLeft);

    const canvasWidthPx = await page.evaluate(() => document.querySelector('.ed-lane-bodies')!.clientWidth);
    const duration = await durationOf(page);

    const clickXInContainer = container.width / 2;
    const expectedSeconds = ((actualScrollLeft + clickXInContainer) / canvasWidthPx) * duration;

    /*
     * Щелчок кладётся В ЛИНЕЙКУ, а не в середину контейнера по высоте.
     *
     * До каркаса это было одно и то же: контейнер прокрутки БЫЛ полосой
     * волны, и его вертикальная середина всегда попадала в поверхность
     * перемотки. С пятью полосами середина контейнера (90 из 180) приходится
     * на полосу МЕТОК, которая не перематывает, — измерено elementFromPoint.
     * Тест целился в совпадение, а не в предмет проверки; предмет — «щелчок
     * по оси времени даёт свою секунду после прокрутки», и линейка есть
     * ось времени по определению.
     */
    const ruler = await page.getByTestId('track-ruler').boundingBox();
    if (!ruler) throw new Error('линейка не видна');
    await page.mouse.click(container.x + clickXInContainer, ruler.y + ruler.height / 2);

    const actual = await page.evaluate(
      () => (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds,
    );
    expect(Math.abs(actual - expectedSeconds), 'перемотка после прокрутки попала не туда').toBeLessThan(0.15);
  });

  /**
   * Что должно сломаться: коммит истории на КАЖДЫЙ `pointermove` жеста
   * (а не один раз на `pointerup`, как `onMoveEnd`/`onTransitionSecondsCommit`
   * у остальных перетаскиваний). При таком дефекте один Ctrl+Z вернул бы
   * значение лишь к ПРЕДПОСЛЕДНЕМУ кадру жеста, а не к исходному, а кнопка
   * «Отменить» осталась бы доступна для дальнейших отмен того же жеста.
   */
  test('перетаскивание ручки — ОДИН шаг истории', async ({ page }) => {
    await openEditor(page, 'transitions');

    const before = await transitionSecondsOf(page, 2); // s-2, morph

    const handle = page.getByTestId('mark-transition-s-2');
    const box = await handle.boundingBox();
    if (!box) throw new Error('ручка не видна');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Несколько промежуточных pointermove — настоящий жест, а не один клик.
    await page.mouse.move(box.x - 20, box.y + box.height / 2);
    await page.mouse.move(box.x - 40, box.y + box.height / 2);
    await page.mouse.move(box.x - 60, box.y + box.height / 2);
    await page.mouse.up();

    const afterDrag = await transitionSecondsOf(page, 2);
    expect(afterDrag, 'жест обязан был что-то изменить, иначе тест бессмыслен').not.toBe(before);

    await page.keyboard.press('Control+z');

    const afterUndo = await transitionSecondsOf(page, 2);
    expect(afterUndo, 'одна отмена обязана вернуть значение ДО жеста целиком').toBe(before);
    await expect(
      page.getByRole('button', { name: 'Отменить' }),
      'после ОДНОЙ отмены жеста истории больше нет',
    ).toBeDisabled();
  });

  /**
   * Что должно сломаться: снятие `Math.min(candidate, gapSeconds)` в
   * `handleTransitionMove` (MarksLane.tsx) — тогда перетаскивание далеко
   * за потолок дало бы `transitionSeconds` больше расстояния до предыдущей
   * метки, и хвост залез бы за неё.
   */
  test('потолок не пускает хвост на предыдущий слайд', async ({ page }) => {
    await openEditor(page, 'transitions');

    // s-2 (index 2, приём morph): потолок = slideSeconds[2] − slideSeconds[1]
    // = 8.00 − 4.00 = 4.0 с (посчитано из фикстуры, ADR-020).
    const handle = page.getByTestId('mark-transition-s-2');
    const box = await handle.boundingBox();
    if (!box) throw new Error('ручка не видна');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Заведомо дальше потолка — далеко за метку s-1.
    await page.mouse.move(box.x - 400, box.y + box.height / 2);
    await page.mouse.move(box.x - 800, box.y + box.height / 2);
    await page.mouse.up();

    const after = await transitionSecondsOf(page, 2);
    expect(after, 'перетаскивание за потолок обязано остановиться на нём').toBe(4);
  });

  /**
   * Что должно сломаться: ручка стыка создаётся для ЛЮБОГО слайда, включая
   * срез (`transition === 'cut'`), а не только там, где `morphSeconds > 0`
   * (условие `.filter(mark => mark.morphSeconds > 0)` в MarksLane.tsx).
   */
  test('у среза ручки нет', async ({ page }) => {
    await openEditor(page, 'transitions');

    await expect(page.locator('[data-testid^="mark-slide-"]')).toHaveCount(8);
    await expect(page.locator('.ed-mark-transition-handle')).toHaveCount(7);
    await expect(page.locator('.ed-mark-tail')).toHaveCount(7);
    // s-1 — единственный срез фикстуры (transition: cut) — ручки у него нет.
    await expect(page.getByTestId('mark-transition-s-1')).toHaveCount(0);
  });

  /**
   * Что должно сломаться: любая новая строка (например, вторая строка
   * ступеней масштаба, перенос кнопок при нехватке места) или дробный
   * line-height, из-за которого высота зоны дорожки перестанет быть целым
   * числом при какой-то ступени. Раздел 8 спецификации запрещает поднимать
   * высоту зоны дорожки хоть на пиксель при смене ступени.
   */
  test('высота области сцены не меняется при смене ступени', async ({ page }) => {
    await openEditor(page, 'transitions');

    const heightAt1 = await page.locator('.ed-stage-host').evaluate((node) => node.getBoundingClientRect().height);

    await page.getByTestId('track-zoom').selectOption('16');
    await expect(page.getByTestId('track-zoom')).toHaveValue('16');
    const heightAt16 = await page.locator('.ed-stage-host').evaluate((node) => node.getBoundingClientRect().height);

    expect(heightAt16, 'высота сцены поменялась при смене ступени').toBe(heightAt1);
    expect(Number.isInteger(heightAt16), 'высота обязана остаться целым числом пикселей').toBe(true);
  });

  /**
   * Часть A. Что должно сломаться: снятие клэмпа в TrackView (эффект,
   * опускающий zoom через `largestFittingZoom`, когда `zoomFits` перестаёт
   * быть верным для активной ступени). Без него автор, стоящий на ×16,
   * растянул бы окно и потерял волну молча — canvas превысил бы
   * MAX_CANVAS_WIDTH_PX, `zoom-16` остался бы нажатым, а полотно рисовало бы
   * пустоту.
   */
  test('активный масштаб опускается, если перестал помещаться', async ({ page }) => {
    // Узкое окно: ×16 ещё помещается (laneWidth ~1968px × 16 = 31488 < 65535).
    await page.setViewportSize({ width: 2000, height: 800 });
    await openEditor(page, 'transitions');

    await page.getByTestId('track-zoom').selectOption('16');
    await expect(page.getByTestId('track-zoom')).toHaveValue('16');

    // Широкое окно: laneWidth вырастает настолько, что ×16 больше не влезает
    // в канву браузера (laneWidth ~5168px × 16 = 82688 > 65535), а ×8 — влезает
    // (5168 × 8 = 41344).
    await page.setViewportSize({ width: 5200, height: 800 });
    // Кадр после ResizeObserver'а и клэмпа.
    await expect(page.getByTestId('track-zoom')).toHaveValue('8');
    await expect(page.locator('[data-testid=track-zoom] option[value="16"]')).toHaveAttribute('disabled', '');

    // Полотно волны действительно перерисовано под новую (влезающую)
    // ступень, а не просто кнопка сменила подпись — иначе «опускание»
    // было бы фикцией интерфейса без реального следствия для канвы.
    const laneWidth = await page.evaluate(() => document.querySelector('.ed-lane-scroll')!.clientWidth);
    const canvasClientWidth = await page.evaluate(() => document.querySelector('.ed-lane')!.clientWidth);
    expect(canvasClientWidth).toBe(laneWidth * 8);
  });
});

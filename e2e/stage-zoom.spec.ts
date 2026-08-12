/**
 * Масштаб холста (Сессия 32).
 *
 * Главный тест файла — про мину, названную в задании: масштаб сцены это то,
 * через что пересчитываются ВСЕ жесты мыши, и сохранённое где-нибудь число
 * сломало бы перетаскивание ТИХО. Тихо — потому что при вписывании (масштаб
 * один на всех) неверный источник даёт правильный ответ, и дефект вылезает
 * только после того, как автор приблизил холст.
 *
 * Поэтому здесь тащат объект указателем на известное число ЭКРАННЫХ пикселей
 * и проверяют, что в координатах сцены он проехал ровно столько, сколько
 * положено при текущем масштабе. Проверка «вызвался ли обработчик» была бы
 * зелёной при любом расхождении масштабов.
 */
import { expect, test, type Page } from '@playwright/test';

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
 * Фактический масштаб — из DOM, а не из состояния редактора.
 *
 * Ровно тот источник, которым пользуются сами жесты (`stageScale` поверх
 * `getBoundingClientRect`), и ровно поэтому он здесь: тест обязан мерить
 * то же, что видит продукт.
 */
async function sceneScale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-id="mover"]');
    if (!node) throw new Error('нет узла mover');
    // 320 — ширина mover в координатах сцены (фикстура morph).
    return node.getBoundingClientRect().width / 320;
  });
}

/** Координата x выделенного в координатах СЦЕНЫ — то же число, что видит автор. */
async function readoutX(page: Page): Promise<number> {
  const text = await page.getByTestId('selection-readout').textContent();
  const match = /:\s*(-?\d+(?:\.\d+)?)\s*×/.exec(text ?? '');
  if (!match) throw new Error(`не разобрал показания выделения: ${text}`);
  return Number(match[1]);
}

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Несколько шагов, а не один: жест — это десятки pointermove, и дефекты
  // накопления смещения видны только на них.
  for (let step = 1; step <= 6; step += 1) {
    await page.mouse.move(from.x + (dx * step) / 6, from.y + (dy * step) / 6);
  }
  await page.mouse.up();
}

test.describe('масштаб холста', () => {
  /**
   * Зазор вокруг сцены (Сессия 36, решение владельца 12.08.2026; числа сняты
   * с живой Canva — `docs/research/2026-08-12-canva-stage-gap.md`).
   *
   * Проверяется то, что ВИДИТ автор: край сцены не совпадает с краем области
   * холста. Ради этого зазор и заведён — ручки размера стоят центром на краю
   * рамки и выступают за неё на 5 px, а точка ровно на границе достаётся
   * соседнему узлу.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: обнуление `STAGE_GAP_X`/
   * `STAGE_GAP_Y` или возврат вписывания к полному размеру окна.
   *
   * Сверяется НЕ с константой из кода, а с независимым числом: тест не должен
   * оставаться зелёным при любом значении зазора, включая ноль.
   */
  test('при вписывании между краем сцены и краем области холста есть поле', async ({ page }) => {
    await openEditor(page, 'demo');

    const gaps = await page.evaluate(() => {
      const host = document.querySelector('.ed-stage-host')!.getBoundingClientRect();
      // Фон `bg` занимает всю сцену — его бокс и есть бокс сцены на экране.
      const scene = document.querySelector('[data-id="bg"]')!.getBoundingClientRect();
      return {
        top: scene.top - host.top,
        bottom: host.bottom - scene.bottom,
        left: scene.left - host.left,
        right: host.right - scene.right,
      };
    });

    // По ведущей оси поле равно зазору, по ведомой — больше него. Нижняя
    // граница проверяется по обеим: именно НИЖНИЕ ручки были недостижимы.
    expect(gaps.top, `сверху поле ${gaps.top.toFixed(1)}px`).toBeGreaterThanOrEqual(15);
    expect(gaps.bottom, `снизу поле ${gaps.bottom.toFixed(1)}px`).toBeGreaterThanOrEqual(15);
    expect(gaps.left, `слева поле ${gaps.left.toFixed(1)}px`).toBeGreaterThanOrEqual(15);
    expect(gaps.right, `справа поле ${gaps.right.toFixed(1)}px`).toBeGreaterThanOrEqual(15);
  });

  test('по умолчанию сцена вписана, и полотно равно окну холста', async ({ page }) => {
    // Несущее свойство совместимости: пока автор не тронул масштаб, картинка
    // обязана остаться ровно той, что была до появления этой возможности.
    // Полотно больше окна означало бы полосы прокрутки там, где их не было.
    const errors = await openEditor(page, 'morph');

    const sizes = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.ed-stage-host');
      const canvas = document.querySelector<HTMLElement>('.ed-stage-canvas');
      const scroll = document.querySelector<HTMLElement>('.ed-stage-scroll');
      if (!host || !canvas || !scroll) throw new Error('нет узлов холста');
      return {
        hostW: host.clientWidth,
        hostH: host.clientHeight,
        canvasW: canvas.getBoundingClientRect().width,
        canvasH: canvas.getBoundingClientRect().height,
        scrollW: scroll.scrollWidth,
        clientW: scroll.clientWidth,
      };
    });

    expect(sizes.canvasW).toBe(sizes.hostW);
    expect(sizes.canvasH).toBe(sizes.hostH);
    expect(sizes.scrollW, 'при вписывании прокручивать нечего').toBe(sizes.clientW);
    expect(errors).toEqual([]);
  });

  test('выбор 100 % увеличивает сцену и даёт прокрутку', async ({ page }) => {
    await openEditor(page, 'morph');
    const before = await sceneScale(page);

    await page.getByTestId('zoom-select').selectOption('1');

    expect(await sceneScale(page), 'сто процентов — единица сцены в один пиксель').toBeCloseTo(1, 2);
    expect(before, 'вписывание в стенде мельче единицы, иначе тест ничего не проверяет').toBeLessThan(1);

    const scroll = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('.ed-stage-scroll');
      if (!node) throw new Error('нет слоя прокрутки');
      return { scrollW: node.scrollWidth, clientW: node.clientWidth };
    });
    expect(scroll.scrollW, 'увеличенная сцена обязана прокручиваться').toBeGreaterThan(scroll.clientW);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: жест начал считать координаты
   * по СОХРАНЁННОМУ масштабу вместо свежего замера DOM.
   *
   * Тогда объект поехал бы за курсором не в такт: при вписывании 0.38 и
   * фактическом масштабе 1 расхождение вышло бы в два с половиной раза.
   * Юнит-тест этого не видит вовсе — там нет ни DOM, ни трансформации.
   */
  test('при масштабе 100 % объект идёт ЗА КУРСОРОМ, а не быстрее его', async ({ page }) => {
    await openEditor(page, 'morph');
    await page.getByTestId('zoom-select').selectOption('1');

    /**
     * Прокрутка к объекту — часть проверки, а не подготовка к ней.
     *
     * Холст стенда невысок (замерено: 586×127 при окне 1280×800), и при
     * стопроцентном масштабе объект просто не попадает в видимую часть.
     * Автор в этом случае прокручивает, и тест делает то же самое — заодно
     * проверяя, что после прокрутки координаты жеста остаются верными:
     * `getBoundingClientRect` прокрутку учитывает, а вот отдельная арифметика
     * по `scrollLeft`, если бы она где-то завелась, разошлась бы именно здесь.
     */
    await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="mover"]');
      if (!node) throw new Error('нет узла mover');
      node.scrollIntoView({ block: 'center', inline: 'center' });
    });

    const scale = await sceneScale(page);
    const center = await centerOnScreen(page, 'mover');
    await page.mouse.click(center.x, center.y);
    const startX = await readoutX(page);

    const dxScreen = 120;
    await drag(page, await centerOnScreen(page, 'mover'), dxScreen, 0);

    const movedScene = (await readoutX(page)) - startX;
    // Запас в 12 единиц сцены покрывает прилипание (порог 8 экранных px).
    // Ошибка «взяли не тот масштаб» дала бы здесь ~317 вместо ~120 —
    // мимо запаса на два порядка величины.
    expect(movedScene).toBeCloseTo(dxScreen / scale, -1);
    expect(Math.abs(movedScene - dxScreen / scale)).toBeLessThan(12);
  });

  /**
   * Складывание панели озвучки меняет ВЫСОТУ холста, а при вписывании высота
   * холста и есть масштаб сцены (Сессия 34).
   *
   * Мина здесь та же, что и у зума: масштаб — это то, через что пересчитываются
   * все жесты мыши, и сохранённое где-нибудь число сломало бы их ТИХО. Разница
   * в том, что тут его меняет не автор ползунком, а соседняя панель, которая
   * про сцену ничего не знает.
   *
   * Проверяется не «изменился ли масштаб», а СОВПАДАЕТ ЛИ он с нынешним
   * размером холста. Первое было бы зелёным и при пересчёте по устаревшему
   * размеру; второе — нет.
   */
  test('складывание озвучки пересчитывает вписывание по НОВОЙ высоте холста', async ({ page }) => {
    await openEditor(page, 'morph');

    /**
     * Каким вписывание ОБЯЗАНО быть при нынешнем размере холста.
     *
     * Зазор вокруг сцены (Сессия 36, `STAGE_GAP_X`/`STAGE_GAP_Y` в
     * `stage/zoom.ts`, числа сняты с живой Canva) входит сюда, потому что
     * вписывание считается от окна ЗА ВЫЧЕТОМ зазора. Проверяемое свойство
     * от этого не изменилось: масштаб обязан отвечать НЫНЕШНЕМУ размеру
     * холста, а не сохранённому. Изменилась только формула ожидания —
     * вместе с самим вписыванием, а не ради зелени.
     */
    const fitFromHost = async (): Promise<number> =>
      page.evaluate(() => {
        const host = document.querySelector('.ed-stage-host');
        if (!host) throw new Error('нет .ed-stage-host');
        const GAP_X = 24;
        const GAP_Y = 16;
        return Math.min(
          (host.clientWidth - 2 * GAP_X) / 1920,
          (host.clientHeight - 2 * GAP_Y) / 1080,
        );
      });

    const hostHeight = async (): Promise<number> =>
      page.evaluate(() => document.querySelector('.ed-stage-host')!.clientHeight);

    // Панель свёрнута по умолчанию — холсту досталась высота.
    const tallHost = await hostHeight();
    expect(await sceneScale(page)).toBeCloseTo(await fitFromHost(), 3);

    // Автор разворачивает озвучку: холст обязан отдать ей высоту...
    await page.getByTestId('audio-source-toggle').click();
    const shortHost = await hostHeight();
    expect(shortHost).toBeLessThan(tallHost);

    // ...а сцена — пересчитаться по тому, что осталось. Без пересчёта здесь
    // остался бы прежний масштаб, и он разошёлся бы с холстом вдвое.
    expect(await sceneScale(page)).toBeCloseTo(await fitFromHost(), 3);

    // И обратно: свернули — холст вернул себе высоту, масштаб снова сошёлся.
    await page.getByTestId('audio-source-toggle').click();
    expect(await hostHeight()).toBe(tallHost);
    expect(await sceneScale(page)).toBeCloseTo(await fitFromHost(), 3);
  });

  test('Ctrl+0 возвращает вписывание, каким оно и было', async ({ page }) => {
    await openEditor(page, 'morph');
    const fitScale = await sceneScale(page);

    await page.getByTestId('zoom-select').selectOption('1');
    expect(await sceneScale(page)).not.toBeCloseTo(fitScale, 2);

    await page.keyboard.press('Control+0');
    expect(await sceneScale(page)).toBeCloseTo(fitScale, 3);
  });

  test('кнопки шага гаснут на краях лестницы, а не исчезают', async ({ page }) => {
    // Пропавшая кнопка меняла бы ширину панели на каждом краю; гашение —
    // тот же приём, что у масштаба дорожки, и так же ведёт себя Canva.
    await openEditor(page, 'morph');

    await page.getByTestId('zoom-select').selectOption('3');
    await expect(page.getByTestId('zoom-in')).toBeVisible();
    await expect(page.getByTestId('zoom-in')).toBeDisabled();
    await expect(page.getByTestId('zoom-out')).toBeEnabled();

    await page.getByTestId('zoom-select').selectOption('0.1');
    await expect(page.getByTestId('zoom-out')).toBeVisible();
    await expect(page.getByTestId('zoom-out')).toBeDisabled();
    await expect(page.getByTestId('zoom-in')).toBeEnabled();
  });

  test('«+» от вписывания шагает вверх от видимого, а не на начало лестницы', async ({ page }) => {
    // Снято с Canva: при вписывании 60 % кнопка «+» даёт 75 %. Реализация
    // «взять первую ступень» ОТДАЛИЛА бы сцену по нажатию «приблизить».
    await openEditor(page, 'morph');
    const fitScale = await sceneScale(page);

    await page.getByTestId('zoom-in').click();

    expect(await sceneScale(page)).toBeGreaterThan(fitScale);
  });
});

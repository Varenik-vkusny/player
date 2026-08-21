/**
 * Полоса капли: отрезки «моё» и права автора на них (v14, ADR-032).
 *
 * Почему это e2e, а не юниты. Правила отрезков уже проверены чисто
 * (`packages/editor/test/spans.test.ts`), и повторять их здесь бессмысленно.
 * Здесь проверяется ровно то, чего юнит не видит: доезжает ли жест до модели
 * и виден ли результат на экране. В проекте записан случай, когда проверка
 * «вызвался ли обработчик» была зелёной на кнопке, до которой нельзя было
 * дотянуться мышью.
 *
 * Фикстура `bubble-spans` — та самая, что заведена под схему v14.
 * Фикстура `transitions` служит отрицательным контролем: капли в ней нет,
 * и полосы быть не должно.
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

/**
 * Настоящий жест мышью: нажали, ПРОВЕЛИ несколькими шагами, отпустили.
 *
 * Промежуточные `pointermove` не для красоты: жест из одного скачка не
 * порождает `pointermove` вовсе у части реализаций, и тест прошёл бы,
 * ничего не подвигав.
 */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * step) / 8,
      from.y + ((to.y - from.y) * step) / 8,
    );
  }
  await page.mouse.up();
}

/** Левый край и ширина каждого клипа — в экранных пикселях. */
async function clips(page: Page): Promise<{ left: number; width: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="bubble-span"]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width) };
    }));
}

test.describe('полоса капли', () => {
  // Два захода в одном тесте намеренно: утверждение здесь — о РАЗНИЦЕ.
  // Половина его («полоса есть») верна и при реализации, рисующей полосу
  // всегда; стоит денег вторая половина — полоса у всех означала бы минус
  // 30 px высоты сцены в каждом объяснении, включая те, где капли нет.
  test('у главы с каплей полоса нарисована, у главы без капли — нет', async ({ page }) => {
    await openEditor(page, 'bubble-spans');
    await expect(page.getByTestId('bubble-lane')).toBeVisible();
    await expect(page.getByTestId('bubble-span')).toHaveCount(2);

    // СЛОМ: вписать 'bubble' прямо в TIER_LANES (то есть показывать полосу
    // всегда) — покраснеет вторая половина.
    await openEditor(page, 'transitions');
    await expect(page.getByTestId('bubble-lane')).toHaveCount(0);

    // Переключатель полосы убран из шапки зоны в Сессия 55 и стал пунктом
    // меню правой кнопки по пустому месту дорожки (`ctxmenu-bubble-lane-toggle`,
    // `TrackView.tsx` — пункт добавляется в перечень, только когда `bubble`
    // определён). У главы без капли открываем то же меню и убеждаемся,
    // что переключателя капли в нём нет вовсе.
    const lane = await page.getByTestId('track-lane').boundingBox();
    if (!lane) throw new Error('дорожка не видна');
    await page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height / 2, { button: 'right' });
    await expect(page.getByTestId('context-menu')).toBeVisible();
    await expect(page.getByTestId('ctxmenu-bubble-lane-toggle')).toHaveCount(0);
  });

  test('автор рисует новый отрезок тягой по свободному месту', async ({ page }) => {
    await openEditor(page, 'bubble-spans');
    const lane = await page.getByTestId('bubble-lane').boundingBox();
    if (!lane) throw new Error('полоса капли не видна');

    // Фикстура: глава 10 с, отрезки на 1–3 и 7–9. Свободно 3–7,
    // тянем внутри него — 4.0 → 6.0 секунды.
    const xAt = (seconds: number): number => lane.x + (lane.width * seconds) / 10;
    const y = lane.y + lane.height / 2;

    await drag(page, { x: xAt(4), y }, { x: xAt(6), y });

    await expect(page.getByTestId('bubble-span')).toHaveCount(3);

    // ПРОМЕЖУТОЧНАЯ ПРОВЕРКА, что предыдущий шаг СОСТОЯЛСЯ, — и она же
    // главная: число «3» верно и у реализации, которая нарисовала клип
    // не там, где вели. Проверяем ПОПАДАНИЕ по иксу.
    const drawn = (await clips(page))[1];
    if (!drawn) throw new Error('нарисованного отрезка нет');
    expect(Math.abs(drawn.left - xAt(4))).toBeLessThan(6);
    expect(Math.abs(drawn.width - (xAt(6) - xAt(4)))).toBeLessThan(8);
  });

  test('тяга за правый край меняет длину отрезка и упирается в соседа', async ({ page }) => {
    await openEditor(page, 'bubble-spans');
    const lane = await page.getByTestId('bubble-lane').boundingBox();
    if (!lane) throw new Error('полоса капли не видна');
    const xAt = (seconds: number): number => lane.x + (lane.width * seconds) / 10;
    const y = lane.y + lane.height / 2;

    const before = await clips(page);
    const grip = await page.getByTestId('bubble-span-grip-to').first().boundingBox();
    if (!grip) throw new Error('ручки правого края нет');

    // Тянем ЗА ПРЕДЕЛ соседа: край обязан встать на 7 с (начало второго
    // отрезка), а не уехать под него.
    await drag(page, { x: grip.x + grip.width / 2, y }, { x: xAt(9.5), y });

    const after = await clips(page);
    expect(after[0]!.width).toBeGreaterThan(before[0]!.width);

    // СЛОМ: убрать в `clampEdge` сужение по соседу — правый край уедет
    // на 9.5 с и наложится на второй отрезок, а проект перестанет
    // разбираться при следующей загрузке.
    const right = after[0]!.left + after[0]!.width;
    expect(Math.abs(right - xAt(7))).toBeLessThan(6);
  });

  test('щелчок по ВИДИМОМУ крестику убирает отрезок', async ({ page }) => {
    await openEditor(page, 'bubble-spans');
    await expect(page.getByTestId('bubble-span')).toHaveCount(2);

    // Именно `.click()` по видимой кнопке, а не вызов обработчика: полоса
    // берёт захват указателя на `pointerdown`, и захват переадресует
    // последующий `click` захватившему узлу. В проекте это измерено
    // на сцене редактора — кнопка молча переставала работать.
    //
    // СЛОМ: убрать `event.stopPropagation()` с `onPointerDown` крестика.
    await page.getByTestId('bubble-span-remove').first().click();

    await expect(page.getByTestId('bubble-span')).toHaveCount(1);
  });

  test('«спрятать каплю» убирает полосу, но не отрезки', async ({ page }) => {
    await openEditor(page, 'bubble-spans');

    // Переключатель полосы капли — пункт меню правой кнопки по пустому
    // месту дорожки (Сессия 55), а не отдельная кнопка над дорожкой.
    const lane = await page.getByTestId('track-lane').boundingBox();
    if (!lane) throw new Error('дорожка не видна');
    const openMenu = () =>
      page.mouse.click(lane.x + lane.width * 0.5, lane.y + lane.height / 2, { button: 'right' });

    await openMenu();
    const toggle = page.getByTestId('ctxmenu-bubble-lane-toggle');
    await expect(toggle).toContainText('Спрятать полосу капли');
    await toggle.click();

    await expect(page.getByTestId('bubble-lane')).toHaveCount(0);

    // Надпись называет ДЕЙСТВИЕ и обязана поменяться на обратное:
    // состояние, живущее только в атрибуте, видит тест и не видит автор.
    await openMenu();
    await expect(page.getByTestId('ctxmenu-bubble-lane-toggle')).toContainText('Показать полосу капли');
    await page.getByTestId('ctxmenu-bubble-lane-toggle').click();

    // Отрезки на месте — пряталась полоса, а не владение.
    await expect(page.getByTestId('bubble-span')).toHaveCount(2);
  });
});

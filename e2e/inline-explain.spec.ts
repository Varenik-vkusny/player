/**
 * Разбор на месте: плеер не покидает сегмент и не перематывает дорожку.
 *
 * `onWrong: 'inline-explain'` — это не «показать текст». Это обещание про
 * ВРЕМЯ: базовая дорожка стоит, пока зритель читает, и продолжается с той же
 * позиции. Проверка «вызвался ли обработчик» была бы зелена при любом дефекте
 * этого обещания, поэтому здесь нажимают по видимой кнопке и читают позицию
 * часов до и после.
 *
 * Второй предмет файла — решение [Р] из product.md §3: гейт и смена слайда
 * на одной секунде. Фикстура сделана так намеренно: слайд `e-2` стоит ровно
 * на 1.5 с, и там же гейт. Незавершённый переход обязан быть доведён до
 * конечного состояния МГНОВЕННО, до открытия взаимодействия, — зритель
 * не отвечает поверх едущих элементов.
 */
import { expect, test, type Page } from '@playwright/test';

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=inline-explain', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
  return errors;
}

async function reachGate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Играть' }).click();
  await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('at-gate');
}

test.describe('гейт с разбором на месте', () => {
  /**
   * Решение [Р] product.md §3. Слайд `e-2` двигает `prompt` сверху вниз
   * и начинается ровно на секунде гейта. К моменту открытия взаимодействия
   * переход обязан быть доведён до конца, то есть трансформация — схемная.
   */
  test('гейт на времени перехода: переход доведён до конца ДО открытия', async ({ page }) => {
    await open(page);
    await reachGate(page);

    const transform = await page.evaluate(() => {
      const node = document.querySelector('[data-id="prompt"]');
      return node instanceof HTMLElement ? getComputedStyle(node).transform : 'нет узла';
    });
    expect(transform, 'едущих элементов на открытом гейте быть не должно').toBe('none');

    // И бокс раскладки — конечный, а не начальный: слайд e-2 опускает
    // подпись с 160 на 700.
    const top = await page.evaluate(() => {
      const node = document.querySelector('[data-id="prompt"]');
      return node instanceof HTMLElement ? node.style.top : '';
    });
    expect(top).toBe('700px');
  });

  test('неверный ответ открывает разбор слоем ПОВЕРХ сцены', async ({ page }) => {
    await open(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Таймер' }).click();

    await expect.poll(() => stateOf(page)).toBe('at-reveal');
    await expect(page.locator('#panel[data-reveal="inline-explain"]')).toBeVisible();
    await expect(page.locator('[data-correct="opt-gate"]')).toContainText('Гейт');

    // Сцена ОСТАЛАСЬ на экране: разбор не уводит зрителя со страницы.
    // Флаги обязательны — по умолчанию checkVisibility не смотрит
    // ни на visibility, ни на opacity, и был бы зелёным на спрятанной сцене.
    const sceneVisible = await page.evaluate(() => {
      const node = document.querySelector('[data-id="prompt"]');
      return node instanceof HTMLElement
        && node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    });
    expect(sceneVisible, 'сцена обязана остаться видимой под разбором').toBe(true);
  });

  /**
   * Попытка уже разобрана, отвечать больше нечего. Варианты ответа — это
   * элементы сцены (ADR-011), и без снятия доступности зритель мог бы
   * ткнуть в них поверх открытого разбора.
   */
  test('пока разбор открыт, сцена снова недоступна для мыши', async ({ page }) => {
    await open(page);
    await reachGate(page);

    const pointerEventsAtGate = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEventsAtGate, 'на гейте сцена доступна').toBe('auto');

    await page.getByRole('button', { name: 'Таймер' }).click();
    await expect.poll(() => stateOf(page)).toBe('at-reveal');

    const pointerEventsAtReveal = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEventsAtReveal, 'на разборе — снова нет').toBe('none');
  });

  test('пока разбор открыт, время стоит', async ({ page }) => {
    await open(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Таймер' }).click();
    await expect.poll(() => stateOf(page)).toBe('at-reveal');

    const first = await positionOf(page);
    await page.waitForTimeout(700);
    const second = await positionOf(page);
    expect(second, 'дорожка на разборе не идёт').toBe(first);
  });

  test('«дальше» продолжает ТУ ЖЕ дорожку с той же секунды, без перемотки', async ({ page }) => {
    const errors = await open(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Таймер' }).click();
    await expect.poll(() => stateOf(page)).toBe('at-reveal');
    const atReveal = await positionOf(page);

    await page.locator('#reveal-next').click();
    await expect.poll(() => stateOf(page)).toBe('playing');

    // Сегмент тот же — его элемент на месте. Позиция идёт вперёд от точки
    // остановки, а не с нуля: перемотки не происходит никогда.
    await expect(page.locator('[data-id="prompt"]')).toBeVisible();
    await expect.poll(() => positionOf(page), { timeout: 5_000 }).toBeGreaterThan(atReveal);
    expect(errors).toEqual([]);
  });

  /**
   * Ответ записан в переменную ДО показа разбора, а не после продолжения.
   * Иначе выход сегмента опирался бы на переменную, которой ещё нет.
   */
  test('ответ записан в переменную зрителя уже на разборе', async ({ page }) => {
    await open(page);
    await reachGate(page);

    await page.getByRole('button', { name: 'Таймер' }).click();
    await expect.poll(() => stateOf(page)).toBe('at-reveal');

    const gateId = await page.evaluate(() =>
      (window as unknown as { __player: { currentGate?: { id: string } } }).__player.currentGate?.id);
    expect(gateId, 'гейт остаётся текущим и на разборе').toBe('g-explain');
  });
});

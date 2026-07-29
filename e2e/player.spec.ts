/**
 * Поведенческие тесты плеера.
 *
 * Проверяют то, чего не видит юнит-тест: что зритель действительно не может
 * кликнуть вне гейта, что остановка происходит на нужной секунде и что
 * возобновление не перематывает дорожку.
 */
import { expect, test, type Page } from '@playwright/test';

/** Гейты в фикстуре e2e стоят на словах «смотришь» (1.175 с) и «момент» (2.938 с). */
const FIRST_GATE_AT = 1.175;

async function openPlayground(page: Page, fixture = 'e2e'): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

test.describe('плеер: сквозной сценарий', () => {
  test('грузит фикстуру, строит сцену и ждёт жеста', async ({ page }) => {
    await openPlayground(page);

    expect(await stateOf(page)).toBe('ready');
    await expect(page.locator('.player-stage > *')).toHaveCount(7);
    // Первый кадр отрисован: зритель видит сцену, а не пустоту.
    await expect(page.locator('[data-id="title"]')).toBeVisible();
  });

  test('вне гейта ни один элемент сцены не получает клики', async ({ page }) => {
    await openPlayground(page);

    // Инвариант №3: не «мы не вешаем обработчик», а физически недоступно.
    const pointerEvents = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEvents).toBe('none');

    // Проверка попадания проходит НАСКВОЗЬ: в точке элемента лежит не элемент.
    const hit = await page.evaluate(() => {
      const node = document.querySelector('[data-id="title"]')!;
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top?.getAttribute('data-id') ?? top?.tagName.toLowerCase() ?? null;
    });
    expect(hit, 'в точке элемента сцены не должно быть самого элемента').not.toBe('title');
  });

  test('останавливается на гейте ровно на его времени', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    expect(await stateOf(page)).toBe('at-gate');

    const position = await positionOf(page);
    // Логическое время записывается явно, а не «где успели затормозить».
    expect(Math.abs(position - FIRST_GATE_AT)).toBeLessThan(0.001);
  });

  test('в гейте сцена становится доступной, после — снова нет', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const inGate = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(inGate).toBe('auto');

    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();

    const afterGate = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(afterGate).toBe('none');
  });

  test('неверный ответ не пропускает дальше, верный — пропускает', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Отдельный таймер' }).click();
    await expect(page.locator('.feedback')).toContainText('Неверно');
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible();
    expect(await stateOf(page)).toBe('at-gate');

    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(page)).toBe('playing');
  });

  test('возобновление продолжает с той же секунды: перемотки нет', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const atGate = await positionOf(page);
    await page.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect.poll(() => stateOf(page)).toBe('playing');

    // Сразу после возобновления позиция обязана быть НЕ МЕНЬШЕ той, на которой
    // встали. Отход назад означал бы перемотку, а её не существует.
    const afterResume = await positionOf(page);
    expect(afterResume).toBeGreaterThanOrEqual(atGate);
    expect(afterResume - atGate).toBeLessThan(0.5);
  });

  test('доезжает до второго гейта, а он с полем ввода', async ({ page }) => {
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Позиция в аудио' }).click();

    await expect(page.locator('#gate-input')).toBeVisible({ timeout: 15_000 });
    await page.locator('#gate-input').fill('гейт');
    await page.getByRole('button', { name: 'Ответить' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(page)).toBe('playing');
  });
});

test.describe('плеер: интерактив внутри сцены (ADR-011)', () => {
  /**
   * fixtures/projects/scene-gate.json: гейт-выбор на слове «смотришь»
   * (1.175 с), оба option.id совпадают с id элементов сцены — вариантом
   * ответа служит сам элемент, нарисованный автором.
   */
  test('вариант, привязанный к элементу, нажимается прямо на сцене', async ({ page }) => {
    await openPlayground(page, 'scene-gate');
    await page.getByRole('button', { name: 'Играть' }).click();

    // Плашки нет (проверяется отдельным тестом ниже), поэтому ждём открытия
    // гейта по состоянию, а не по видимости оверлея.
    await expect.poll(() => stateOf(page)).toBe('at-gate');

    // Неверный вариант нажат КЛИКОМ ПО СЦЕНЕ, а не вызовом answer() напрямую:
    // проверка «вызвался ли обработчик» была бы зелена и при сломанной
    // раскладке, и при перехваченном клике (CLAUDE.md, ADR-011).
    await page.locator('[data-id="opt-timer"]').click();
    expect(await stateOf(page), 'неверный ответ не пропускает дальше').toBe('at-gate');

    // Верный вариант — тоже клик по видимому элементу сцены.
    await page.locator('[data-id="opt-audio"]').click();
    await expect.poll(() => stateOf(page), 'верный ответ пропускает дальше').toBe('playing');
  });

  test('сцена не гаснет и плашки нет, когда все варианты — элементы сцены', async ({ page }) => {
    await openPlayground(page, 'scene-gate');
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page)).toBe('at-gate');

    await expect(page.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect(page.locator('#panel')).toBeEmpty();
  });

  test('вне гейта элемент-вариант сцены клики не получает', async ({ page }) => {
    await openPlayground(page, 'scene-gate');

    // Тот же ход, что и в общем тесте инварианта №3, но на новом пути —
    // на элементе, который в открытом гейте станет кликабельным ответом.
    const pointerEvents = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(pointerEvents).toBe('none');

    const hit = await page.evaluate(() => {
      const node = document.querySelector('[data-id="opt-audio"]')!;
      const box = node.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return top?.getAttribute('data-id') ?? top?.tagName.toLowerCase() ?? null;
    });
    expect(hit, 'в точке варианта не должно быть самого элемента').not.toBe('opt-audio');
  });

  test('гейт, у которого варианты без элементов, по-прежнему рисуется плашкой', async ({ page }) => {
    // Фикстура e2e: ни один option.id ('opt-audio', 'opt-timer') не совпадает
    // с id элемента сцены — старое поведение обязано остаться нетронутым.
    await openPlayground(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Позиция в аудио' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отдельный таймер' })).toBeVisible();
  });
});

test.describe('плеер: гейт на нулевой секунде', () => {
  /**
   * Гейт в самом начале — первое, что построит автор на пустом проекте.
   *
   * Путь у него отдельный: `play()` открывает такой гейт сразу, не запуская
   * звук, иначе зритель услышал бы начало фразы, к которой относится вопрос.
   * Часы при этом обязаны оказаться в определённом состоянии — иначе ответ
   * на гейт некуда возобновлять.
   *
   * Фикстура `edge-cases` такой гейт содержит, но её аудиофайла на диске нет,
   * поэтому проект подменяется на лету: берём `e2e` и двигаем первый гейт
   * в ноль. Эталонные фикстуры при этом не трогаются.
   */
  async function openWithGateAtZero(page: Page): Promise<void> {
    await page.route('**/fixtures/e2e.json', async (route) => {
      const original = await route.fetch();
      const project = await original.json();
      project.scene.gates[0].at = { kind: 'seconds', t: 0 };
      await route.fulfill({ json: project });
    });
    await openPlayground(page);
  }

  test('останавливается до первого звука', async ({ page }) => {
    await openWithGateAtZero(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });
    expect(await stateOf(page)).toBe('at-gate');
    // Ни одного сэмпла не прозвучало: позиция ровно ноль, а не «почти ноль».
    expect(await positionOf(page)).toBe(0);
  });

  test('ответ на него продолжает воспроизведение, а не роняет часы', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openWithGateAtZero(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Позиция в аудио' }).click();

    await expect.poll(() => stateOf(page), { timeout: 15_000 }).toBe('playing');
    expect(errors, 'ответ на гейт в нуле не должен ронять часы').toEqual([]);
    // Продолжили с нуля, а не перемотали: инвариант №4.
    await expect.poll(() => positionOf(page)).toBeGreaterThan(0);
  });
});

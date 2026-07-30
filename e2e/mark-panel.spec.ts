/**
 * Срез 3 (настройка гейта) и срез 4 (настройка анимации) плана сессии 3:
 * панель выделенной метки (`panels/MarkPanel.tsx`).
 *
 * Критерий приёмки сессии — «гейт с выбором варианта, собранный в редакторе,
 * работает в плеере», плюс гейт-ввод и анимация с правленым свойством.
 * Каждый тест доходит до настоящего плеера (тот же круг, что и
 * `e2e/roundtrip.spec.ts`) и нажимает по видимым узлам — проверка «вызвался
 * ли колбэк панели» была бы зелёной и при сломанной привязке варианта
 * к элементу (ADR-011), и при потерянной правке свойства анимации.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function waitTransportReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

async function setNumberField(page: Page, label: string, value: number): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  await input.fill(String(value));
  await input.press('Tab');
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);

test.describe('панель гейта: выбор варианта', () => {
  test('гейт с вариантами, привязанными к элементам сцены, собранный в редакторе, работает в плеере', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    // Два текстовых элемента, разнесённые по сцене, чтобы клики в плеере
    // однозначно попадали каждый в свой узел.
    await page.getByTestId('insert-text').click(); // text-1, авто-выделен
    await setNumberField(page, 'X, px', 100);
    await setNumberField(page, 'Y, px', 400);

    await page.getByTestId('insert-text').click(); // text-2, авто-выделен
    await setNumberField(page, 'X, px', 1000);
    await setNumberField(page, 'Y, px', 400);

    const ids = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { elements: { id: string }[] }[] } })
          .__project.segments[0]!.elements.map((element) => element.id),
    );
    expect(ids).toEqual(['text-1', 'text-2']);

    // Гейт СТРОГО после нулевой секунды, а не на ней: гейт ровно на t=0
    // упирается в отдельный, не связанный с этой сессией дефект плеера —
    // см. отчёт сессии, раздел «Что выглядит неправильным». Секунда 1
    // безопасна и здесь не нужна ради самого теста.
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(seconds: number): void } }).__transport.seek(1);
    });
    await expect(page.getByTestId('track-clock')).toContainText('00:01', { timeout: 5_000 });
    await page.getByRole('button', { name: /остановка/ }).click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    await page.getByLabel('Вид', { exact: true }).selectOption('choice');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что было часами проекта?');

    await page.getByTestId('gate-option-bind-0').selectOption('text-1');
    await page.getByTestId('gate-option-bind-1').selectOption('text-2');
    await page.getByTestId('gate-option-correct-1').check();

    const gate = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: unknown[] }[] } })
          .__project.segments[0]!.gates[0],
    );
    expect(gate).toMatchObject({
      config: {
        kind: 'choice',
        options: [
          { id: 'text-1' },
          { id: 'text-2' },
        ],
        correctId: 'text-2',
      },
    });

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    await expect(player.locator('[data-id="text-1"]')).toBeVisible();
    await expect(player.locator('[data-id="text-2"]')).toBeVisible();

    await player.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(player), { timeout: 20_000 }).toBe('at-gate');

    // Гибрид ADR-011: варианты — сами элементы сцены, плашки нет вовсе.
    await expect(player.locator('#overlay[data-open="1"]')).toBeHidden();

    // Неверный вариант — клик ПО ВИДИМОМУ ЭЛЕМЕНТУ сцены, не answer() напрямую.
    await player.locator('[data-id="text-1"]').click();
    expect(await stateOf(player), 'неверный ответ не пропускает дальше').toBe('at-gate');

    await player.locator('[data-id="text-2"]').click();
    await expect.poll(() => stateOf(player), 'верный ответ пропускает дальше').toBe('playing');
  });
});

test.describe('панель гейта: ввод ответа', () => {
  test('гейт с вводом слова, собранный в редакторе, принимает ответ', async ({ page, context }) => {
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    // Гейт СТРОГО после нулевой секунды — см. комментарий в тесте выше.
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(seconds: number): void } }).__transport.seek(1);
    });
    await expect(page.getByTestId('track-clock')).toContainText('00:01', { timeout: 5_000 });
    await page.getByRole('button', { name: /остановка/ }).click();
    await page.getByLabel('Вид', { exact: true }).selectOption('input');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что является часами проекта?');

    const accept = page.getByTestId('gate-accept');
    await accept.fill('аудио');
    await accept.press('Tab');

    const config = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { gates: { config: unknown }[] }[] } })
          .__project.segments[0]!.gates[0]!.config,
    );
    expect(config).toMatchObject({ kind: 'input', accept: ['аудио'], caseSensitive: false });

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });

    await player.getByRole('button', { name: 'Играть' }).click();
    await expect(player.locator('#gate-input')).toBeVisible({ timeout: 20_000 });

    // Другой регистр — гейт создан с caseSensitive: false по умолчанию.
    await player.locator('#gate-input').fill('АУДИО');
    await player.getByRole('button', { name: 'Ответить' }).click();

    await expect(player.locator('#overlay[data-open="1"]')).toBeHidden();
    await expect.poll(() => stateOf(player)).toBe('playing');
  });
});


/*
 * Блок «панель анимации» удалён вместе с предметом.
 *
 * Он проверял правку кью — «свойство, from, to, длительность, плавность».
 * В схеме v3 кью не существует: анимация выражается слайдами, а длительность
 * перехода — свойство слайда. Адаптировать было нечего, поэтому тест удалён,
 * а не переписан. Морфинг между слайдами получит собственную страховку
 * в той сессии, где появится (ADR-015).
 */

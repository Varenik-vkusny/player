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
        (window as unknown as { __project: { scene: { elements: { id: string }[] } } }).__project
          .scene.elements.map((element) => element.id),
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
    await page.getByRole('button', { name: /гейт/ }).click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    await page.getByLabel('Вид', { exact: true }).selectOption('choice');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что было часами проекта?');

    await page.getByTestId('gate-option-bind-0').selectOption('text-1');
    await page.getByTestId('gate-option-bind-1').selectOption('text-2');
    await page.getByTestId('gate-option-correct-1').check();

    const gate = await page.evaluate(
      () =>
        (window as unknown as { __project: { scene: { gates: unknown[] } } }).__project.scene
          .gates[0],
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
    await page.getByRole('button', { name: /гейт/ }).click();
    await page.getByLabel('Вид', { exact: true }).selectOption('input');
    await page.getByLabel('Вопрос', { exact: true }).fill('Что является часами проекта?');

    const accept = page.getByTestId('gate-accept');
    await accept.fill('аудио');
    await accept.press('Tab');

    const config = await page.evaluate(
      () =>
        (window as unknown as { __project: { scene: { gates: { config: unknown }[] } } }).__project
          .scene.gates[0]!.config,
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

test.describe('панель анимации', () => {
  test('анимация с правленым свойством видна на своей секунде и не видна до неё — проверка покадровая', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await openEditor(page, 'empty');
    await waitTransportReady(page);

    await page.getByTestId('insert-shape').click(); // shape-1, авто-выделен

    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(seconds: number): void } }).__transport.seek(5);
    });
    // Ждём, пока и настоящий транспорт, и React-состояние догонят перемотку —
    // иначе кнопка добавит анимацию на секунде, где ещё стоял редактор
    // до вызова seek.
    await expect(page.getByTestId('track-clock')).toContainText('00:05', { timeout: 5_000 });

    await page.getByRole('button', { name: /анимация/ }).click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();

    // Правим свойство, изначально заданное срезом 1 (opacity 0 → 1, 400 мс),
    // на собственную длительность — тест обязан ловить и то, что правка
    // панели реально попала в проект, а не только исходные значения кнопки.
    await setNumberField(page, 'Длительность, мс', 1000);

    const savedCue = await page.evaluate(
      () =>
        (window as unknown as {
          __project: { scene: { cues: { animation: { duration: number; property: string } }[] } };
        }).__project.scene.cues[0]!,
    );
    expect(savedCue.animation.duration).toBe(1000);
    expect(savedCue.animation.property).toBe('opacity');

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });

    // До начала анимации (t=0) элемент обязан быть невидим — ровно то, что
    // чинит ADR-009 (начальное состояние выставляется явно).
    const initialOpacity = await player.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="shape-1"]')!).opacity,
    );
    expect(Number(initialOpacity)).toBeLessThan(0.01);

    await player.getByRole('button', { name: 'Играть' }).click();

    // Покадровая проверка через настоящее воспроизведение — время движется
    // вперёд маленькими реальными шагами, а не скачком, которым anime.js
    // форсирует рендер и прячет дефект (ADR-009).
    const samples: { t: number; opacity: number }[] = [];
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const sample = await player.evaluate(() => {
        const p = (window as unknown as { __player: { positionSeconds: number } }).__player;
        const node = document.querySelector('[data-id="shape-1"]');
        return {
          t: p.positionSeconds,
          opacity: node ? Number(getComputedStyle(node as Element).opacity) : NaN,
        };
      });
      samples.push(sample);
      if (sample.t >= 7) break;
      await player.waitForTimeout(100);
    }

    const before = samples.filter((s) => s.t < 4.7);
    const mid = samples.filter((s) => s.t >= 5.1 && s.t < 5.9);
    const after = samples.filter((s) => s.t >= 6.3);

    expect(before.length, 'нет сэмплов до начала анимации — тест ничего не проверяет').toBeGreaterThan(0);
    expect(before.every((s) => s.opacity < 0.01), 'элемент виден ДО своей секунды').toBe(true);

    expect(mid.length, 'нет сэмплов внутри окна анимации').toBeGreaterThan(0);
    expect(
      mid.some((s) => s.opacity > 0.05 && s.opacity < 0.95),
      'не найдено промежуточное значение прозрачности — анимация не идёт покадрово',
    ).toBe(true);

    expect(after.length, 'нет сэмплов после конца анимации').toBeGreaterThan(0);
    expect(after.every((s) => s.opacity > 0.99), 'элемент не стал полностью видимым на своей секунде').toBe(
      true,
    );
  });
});

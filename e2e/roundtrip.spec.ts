/**
 * Сквозной круг: автор правит в редакторе — зритель смотрит в плеере.
 *
 * Это и есть цель сессии, выраженная тестом. Всё остальное — детали,
 * которые имеют смысл только если этот круг замыкается.
 *
 * Отдельно проверяется паритет рендера (инвариант №5) — но уже не на спайке,
 * а на живом редакторе. Спайк S7 доказал, что одна и та же функция даёт
 * одинаковую картинку в двух хостах; здесь проверяется, что редактор
 * действительно этой функцией и пользуется.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Момент, на котором сравниваются картинки. Видны и текст, и фигуры. */
const PARITY_AT = 24;

async function openEditor(page: Page, fixture = 'demo'): Promise<void> {
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

/** Двигает элемент мышью — так же, как это делает автор. */
async function dragElement(page: Page, id: string, dx: number, dy: number): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx / 2, center.y + dy / 2);
  await page.mouse.move(center.x + dx, center.y + dy);
  await page.mouse.up();
}

test.describe('круг: правка в редакторе — просмотр в плеере', () => {
  test('сохранённый файл проходит валидацию и содержит правки', async ({ page }) => {
    await openEditor(page);
    // Двигаем элемент, который виден на нулевой секунде и потому попадает
    // под курсор без перемотки.
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(s: number): void } }).__transport.seek(24);
    });
    await dragElement(page, 'card', 80, 40);

    const moved = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: { scene: { elements: { id: string; x: number }[] } };
      }).__project;
      return project.scene.elements.find((element) => element.id === 'card')?.x;
    });
    expect(moved).not.toBe(1240);

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Сохранить' }).click(),
    ]).then(([event]) => event);

    const file = await download.path();
    if (!file) throw new Error('файл не сохранился');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      schemaVersion: number;
      scene: { elements: { id: string; x: number }[] };
    };

    // Валидация уже прошла внутри редактора — serializeProject прогоняет
    // текст через loadProject перед выдачей. Здесь проверяется, что в файл
    // попало именно то, что на экране.
    expect(saved.schemaVersion).toBe(1);
    expect(saved.scene.elements.find((element) => element.id === 'card')?.x).toBe(moved);
  });

  test('правленый проект открывается плеером и доезжает до гейта', async ({ page, context }) => {
    await openEditor(page);
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek(s: number): void } }).__transport.seek(24);
    });
    await dragElement(page, 'card', 60, 30);

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');

    // Плеер валидирует проект сам. Дошёл до готовности — значит правки
    // редактора не сломали формат.
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    await expect(player.locator('.player-stage > *')).toHaveCount(7);

    await player.getByRole('button', { name: 'Играть' }).click();
    // Первый гейт demo.json стоит на слове №32, около 14.6 с. Дожидаемся
    // именно остановки: это и есть механика, ради которой всё делалось.
    await expect(player.locator('#state')).toHaveText('at-gate', { timeout: 40_000 });
    await expect(player.locator('#overlay')).toHaveAttribute('data-open', '1');

    // И проходим его: круг замыкается не на остановке, а на том, что зритель
    // ответил и объяснение поехало дальше.
    await player.getByRole('button', { name: 'Позиция в аудио' }).click();
    await expect(player.locator('#state')).toHaveText('playing', { timeout: 20_000 });
  });

  test('инвариант №5: сцена в редакторе и в ванильном хосте совпадает', async ({ page }) => {
    await openEditor(page);
    await page.evaluate((at) => {
      (window as unknown as { __transport: { seek(s: number): void } }).__transport.seek(at);
    }, PARITY_AT);

    // Размер области сцены в редакторе задаёт условия сравнения: ванильный
    // хост открывается ровно в таком вьюпорте, тогда масштаб выходит тот же,
    // а значит снимки одного размера.
    const size = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.ed-stage-host');
      if (!host) throw new Error('нет области сцены');
      return { width: host.clientWidth, height: host.clientHeight };
    });

    const fromEditor = await page.locator('.ed-stage-host > div').screenshot();

    const vanilla = await page.context().newPage();
    await vanilla.setViewportSize(size);
    await vanilla.goto(`/preview.html?fixture=demo&t=${PARITY_AT}`, { waitUntil: 'load' });
    await vanilla.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
    const fromVanilla = await vanilla.locator('#stage-host > div').screenshot();

    const a = PNG.sync.read(fromEditor);
    const b = PNG.sync.read(fromVanilla);
    expect({ width: a.width, height: a.height }).toEqual({ width: b.width, height: b.height });

    const diff = new PNG({ width: a.width, height: a.height });
    const different = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
    const total = a.width * a.height;

    // Порог тот же, что в S7: расхождение меньше 0.1 % пикселей.
    // Ужесточать до нуля нельзя — сглаживание текста не воспроизводится
    // побитово даже на одной машине.
    expect(
      (different / total) * 100,
      `различается ${different} пикселей из ${total}`,
    ).toBeLessThan(0.1);
  });
});

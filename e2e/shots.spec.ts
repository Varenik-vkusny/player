/**
 * Съёмка настоящих снимков продукта: приёмка глазами и картинки для отчёта.
 *
 * Не проверка, а ОСНАСТКА. Скриншотную регрессию делает fixtures.spec.ts;
 * здесь снимки складываются на диск, чтобы их можно было посмотреть
 * и вставить в отчёт владельцу.
 *
 * Помечен `@shots` и по умолчанию пропускается: гонять съёмку в каждом
 * `pnpm check` незачем, а забыть выключить — легко.
 */
import { mkdirSync } from 'node:fs';
import { splitChapterAtGate } from './panels.js';

import { expect, test, type Page } from '@playwright/test';

const OUT = 'docs/shots';
const enabled = process.env['SHOTS'] === '1';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('@shots снимки продукта', () => {
  test.skip(!enabled, 'съёмка включается переменной SHOTS=1');
  test.use({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });

  test.beforeAll(() => {
    mkdirSync(OUT, { recursive: true });
  });

  test('редактор целиком', async ({ page }) => {
    await openEditor(page, 'demo');
    await page.screenshot({ path: `${OUT}/editor.png` });
  });

  test('панель развилки и кнопка разреза', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await page.getByTestId('mark-gate-g-ask').click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();
    await page.getByTestId('mark-panel').screenshot({ path: `${OUT}/fork-panel.png` });
    await page.screenshot({ path: `${OUT}/fork-editor.png` });
  });

  test('после разреза: части на месте', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await page.getByTestId('mark-gate-g-ask').click();
    await splitChapterAtGate(page, 'mark-gate-g-ask');
    await page.screenshot({ path: `${OUT}/after-split.png` });
  });

  /**
   * Моменты выбраны под окна ПОСЛЕ разворота (ADR-020): к слайду `m-2`
   * сцена едет по (0.4, 1.0), к `m-3` — по (1.4, 2.0). Раскадровка обязана
   * показывать движение ДО метки и приехавшую картинку НА ней — прежняя
   * серия (1.200 … 3.000) вся попадала бы в «уже приехал».
   */
  test('раскадровка морфинга', async ({ page }) => {
    for (const t of ['0.000', '0.600', '0.850', '1.000', '1.700', '2.000']) {
      await page.goto(`/preview.html?fixture=morph&t=${t}&fonts=test`, { waitUntil: 'load' });
      await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
      await page.locator('#stage-host').screenshot({ path: `${OUT}/morph-${t.replace('.', '-')}.png` });
    }
  });

  test('остановка и разбор на месте', async ({ page }) => {
    await page.goto('/?fixture=inline-explain', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect
      .poll(() => page.evaluate(() => document.getElementById('state')?.textContent), { timeout: 15_000 })
      .toBe('at-gate');
    await page.screenshot({ path: `${OUT}/gate-open.png` });
  });

  test('голый HTML: инвариант №9 глазами', async ({ page }) => {
    await page.goto('/bare.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/bare.png` });
  });

  test('крупный план полосы меток', async ({ page }) => {
    await openEditor(page, 'demo');
    const lane = page.getByTestId('marks-lane');
    const box = await lane.boundingBox();
    if (!box) throw new Error('полоса меток не видна');
    // Кусок дорожки слева, где метки стоят кучно: так видно и форму, и то,
    // что остановки и слайды лежат в разных полосах.
    await page.screenshot({
      path: `${OUT}/marks-zoom.png`,
      clip: { x: box.x, y: box.y - 46, width: 470, height: box.height + 56 },
    });
  });

  /** §14.9 глазами: правка на голом месте дорожки ставит новый ромб. */
  test('слайд рождается при правке', async ({ page }) => {
    await openEditor(page, 'demo');
    await page.waitForFunction(
      () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
      null,
      { timeout: 30_000 },
    );

    const track = await page.getByTestId('track-lane').boundingBox();
    if (!track) throw new Error('дорожка не видна');
    const duration = await page.evaluate(
      () => (window as unknown as { __transport: { durationSeconds: number } })
        .__transport.durationSeconds,
    );
    await page.mouse.click(track.x + (track.width * 24) / duration, track.y + track.height / 2);
    await page.screenshot({ path: `${OUT}/s12-before-edit.png` });

    const node = await page.locator('.ed-stage-host [data-id="title"]').boundingBox();
    if (!node) throw new Error('элемент не виден на сцене правки');
    const x = node.x + node.width / 2;
    const y = node.y + node.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y + 40);
    await page.mouse.move(x + 120, y + 80);
    await page.mouse.up();

    await page.screenshot({ path: `${OUT}/s12-after-edit.png` });
  });
});

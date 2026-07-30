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
    await page.getByTestId('gate-split').click();
    await page.screenshot({ path: `${OUT}/after-split.png` });
  });

  test('раскадровка морфинга', async ({ page }) => {
    for (const t of ['0.000', '1.200', '1.500', '1.800', '2.250', '3.000']) {
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
});

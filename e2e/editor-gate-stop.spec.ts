/**
 * Предпросмотр в редакторе обязан останавливаться на гейте.
 *
 * До этого дорожка редактора проезжала гейт молча: на линейке стоял квадратик,
 * автор жал «играть», и звук шёл дальше. То есть редактор показывал автору
 * поведение, которого у зрителя не будет, — а судит о своей работе автор
 * именно по редактору. Найдено владельцем руками, воспроизведено в браузере:
 * 4.5 → 8.4 с через гейт на 6.0 с.
 *
 * Тест нажимает по ВИДИМОЙ кнопке «играть», а не зовёт `transport.play()`:
 * контекст звука просыпается только по настоящему жесту, и проверка,
 * обходящая кнопку, была бы зелёной при неработающей кнопке.
 */
import { expect, test, type Page } from '@playwright/test';

/** Гейт `gate-start` фикстуры развилки: слово №3, смещение 0. */
const GATE_SECONDS = 1.175;

interface Snapshot {
  readonly position: number;
  readonly playing: boolean;
  readonly state: string;
}

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
 * Снимок транспорта плоским объектом.
 *
 * `positionSeconds` и `isPlaying` — геттеры на прототипе `Transport`, и вернуть
 * сам объект из `evaluate` нельзя: сериализация берёт только собственные поля,
 * а геттеры молча превращаются в undefined. На этом черновик теста один раз
 * уже «упал» не там, где искал дефект.
 */
function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const t = (
      window as unknown as {
        __transport: { positionSeconds: number; isPlaying: boolean; state: string };
      }
    ).__transport;
    return { position: t.positionSeconds, playing: t.isPlaying, state: t.state };
  });
}

/** Ждёт, пока звук действительно поедет: до этого «не играет» верно и так. */
function waitPlaying(page: Page): Promise<unknown> {
  return page.waitForFunction(
    () => (window as unknown as { __transport: { isPlaying: boolean } }).__transport.isPlaying,
    null,
    { timeout: 15_000 },
  );
}

function waitStopped(page: Page): Promise<unknown> {
  return page.waitForFunction(
    () => !(window as unknown as { __transport: { isPlaying: boolean } }).__transport.isPlaying,
    null,
    { timeout: 15_000 },
  );
}

test.describe('гейт останавливает предпросмотр редактора', () => {
  test('дорожка встаёт на гейте, а не проезжает его', async ({ page }) => {
    await openEditor(page, 'branching');

    await page.getByRole('button', { name: 'Играть' }).click();
    await waitPlaying(page);
    await waitStopped(page);

    const after = await snapshot(page);
    expect(after.playing).toBe(false);
    // Перелёт в пределах пары кадров: freezeAt берёт позицию на момент вызова,
    // а `pause()` асинхронный — точную остановку даёт плеер, редактору хватает
    // «на глаз того же места».
    expect(after.position).toBeGreaterThanOrEqual(GATE_SECONDS);
    expect(after.position).toBeLessThan(GATE_SECONDS + 0.4);
  });

  test('второе нажатие «играть» проезжает гейт дальше, а не держит на нём', async ({ page }) => {
    await openEditor(page, 'branching');

    await page.getByRole('button', { name: 'Играть' }).click();
    await waitPlaying(page);
    await waitStopped(page);
    const atGate = await snapshot(page);

    // Стоя РОВНО на гейте, автор жмёт «играть» ещё раз. Будь условие
    // пересечения нестрогим, гейт держал бы его здесь навсегда.
    await page.getByRole('button', { name: 'Играть' }).click();
    await page.waitForFunction(
      (from: number) =>
        (window as unknown as { __transport: { positionSeconds: number } }).__transport
          .positionSeconds > from + 0.4,
      atGate.position,
      { timeout: 15_000 },
    );

    expect((await snapshot(page)).position).toBeGreaterThan(atGate.position + 0.4);
  });
});

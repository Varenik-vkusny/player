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

/**
 * Гейт `gate-start` фикстуры развилки: слово №97 «борьбу», смещение 0
 * (`fixtures/projects/branching.json`, `nodes[0].scene.gates`). Проверено
 * в браузере через `window.__project` после миграции: секунды совпадают
 * с тем, что даёт `resolveTimeRef` по факту — брать их из комментария
 * на глаз здесь нельзя, декодированная длительность `demo.mp3` (48.96 с)
 * на 0.36 с больше объявленной в фикстуре (48.6 с, тот же эффект уже
 * измерен и описан в CLAUDE.md).
 */
const GATE_SECONDS = 46.875;

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

/**
 * Перемотка нажатием по дорожке — тем же жестом, каким это делает автор.
 *
 * Гейт стоит на 46.875 с из 48.96 — играть от нуля значило бы ждать
 * настоящих сорок шесть секунд реального звука на каждый прогон. Автор,
 * которому нужно проверить остановку, промотал бы дорожку рядом с гейтом
 * сам; тест делает то же самое, а не подставляет позицию в обход интерфейса.
 */
async function seekTrack(page: Page, seconds: number): Promise<void> {
  const box = await page.getByTestId('track-lane').boundingBox();
  if (!box) throw new Error('дорожка не видна');
  const duration = await page.evaluate(
    () =>
      (window as unknown as { __transport: { durationSeconds: number } }).__transport
        .durationSeconds,
  );
  await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2);
}

test.describe('гейт останавливает предпросмотр редактора', () => {
  test('дорожка встаёт на гейте, а не проезжает его', async ({ page }) => {
    await openEditor(page, 'branching');
    await seekTrack(page, GATE_SECONDS - 1.5);

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
    await seekTrack(page, GATE_SECONDS - 1.5);

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

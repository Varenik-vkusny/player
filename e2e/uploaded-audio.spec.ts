/**
 * Дорожка, адресуемая через `audio.fileId` (схема v6), а не через `src`.
 *
 * Проверка на существование узла ничего не говорит о том, звучит ли проект:
 * `resolveAudioUrl` мог бы вернуть пустой адрес, а сцена — проиграть немую
 * дорожку в полной тишине, и ни один тест на «элемент есть» этого не поймает
 * (CLAUDE.md: «тест, который проверяет вызов обработчика, — не поведенческий
 * тест»). Здесь проверяется НАБЛЮДАЕМОЕ поведение: позиция в аудио действительно
 * растёт со временем — то есть звук пошёл, а не просто состояние сменилось
 * на «playing».
 *
 * Второй тест — обратный случай: ключ, под которым фикстура ищет байты,
 * в этом браузере не сохранён. Тихая немая сцена недопустима (CLAUDE.md,
 * «не глуши ошибку»): `resolveAudioUrl` (packages/player/src/assets.ts)
 * бросает по-русски внятное сообщение, а `apps/playground/src/main.ts` кладёт
 * его на страницу текстом — это и проверяется.
 */
import { expect, test, type Page } from '@playwright/test';

/** Ключ, на который ссылается fixtures/projects/uploaded-audio.json. */
const FILE_ID = 'aud-fixture-demo';

/**
 * Кладёт настоящие байты `demo.mp3` в `player-assets`/`audio` под ключом
 * {@link FILE_ID} — ДО того, как плеер вообще откроет страницу с фикстурой.
 *
 * Порядок обязателен: `page.evaluate` дожидается своего промиса, а `page.goto`
 * запускается только после того, как этот вызов вернулся, — значит запрос
 * плеера к IndexedDB застаёт запись уже на месте. Открытие какой-то другой
 * страницы того же источника нужно только для того, чтобы в контексте были
 * `indexedDB` и `fetch` с тем же origin, что у `/audio/demo.mp3`: сама
 * страница (`bare.html`) не имеет отношения к фикстуре и её загрузка никак
 * не пересекается с записью в другую базу.
 */
async function seedUploadedAudio(page: Page): Promise<void> {
  await page.goto('/bare.html', { waitUntil: 'commit' });
  await page.evaluate(
    async (fileId) => {
      const response = await fetch('/audio/demo.mp3');
      if (!response.ok) throw new Error(`Не удалось скачать demo.mp3: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('player-assets', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('audio')) {
            request.result.createObjectStore('audio');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('indexedDB.open не сообщил причину'));
      });

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('audio', 'readwrite');
        tx.objectStore('audio').put(
          { name: 'demo.mp3', type: 'audio/mpeg', bytes, durationSeconds: 48.96, addedAt: Date.now() },
          fileId,
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('запись в player-assets не удалась'));
      });
      db.close();
    },
    FILE_ID,
  );
}

const stateOf = (page: Page) => page.evaluate(() => document.getElementById('state')?.textContent);
const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

test.describe('дорожка, загруженная автором (fileId вместо src)', () => {
  test('звук действительно идёт: позиция в аудио растёт со временем', async ({ page }) => {
    await seedUploadedAudio(page);

    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/?fixture=uploaded-audio', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 15_000,
    });
    expect(errors, 'страница открылась с ошибками').toEqual([]);
    expect(await stateOf(page)).toBe('ready');

    await page.getByRole('button', { name: 'Играть' }).click();
    await expect.poll(() => stateOf(page)).toBe('playing');

    const first = await positionOf(page);
    // Ждём реального течения времени, а не одного кадра: позиция обязана
    // сдвинуться заметно, а не на долю миллисекунды по округлению.
    await expect.poll(() => positionOf(page), { timeout: 5_000 }).toBeGreaterThan(first + 0.3);

    expect(errors, 'воспроизведение не должно было бросить ошибок').toEqual([]);
  });

  test('без байт в хранилище ошибка видна и внятна, а не немая сцена', async ({ page }) => {
    // Байты сознательно НЕ кладутся: fileId в фикстуре ссылается на ключ,
    // которого в этом браузере нет.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.goto('/?fixture=uploaded-audio', { waitUntil: 'load' });

    // Готовности не наступает: main() падает раньше, чем выставляет
    // dataset.ready, — сцена не открывается наполовину рабочей.
    const box = page.locator('pre');
    await expect(box).toBeVisible({ timeout: 15_000 });
    await expect(box).toContainText(FILE_ID);
    await expect(box).toContainText('не найдена в хранилище');

    expect(await page.evaluate(() => document.documentElement.dataset['ready'])).toBeUndefined();

    // Тот же текст обязан прилететь и как настоящая ошибка страницы —
    // main.ts перебрасывает её после того, как показал сообщение.
    expect(pageErrors.some((message) => message.includes(FILE_ID))).toBe(true);
  });
});

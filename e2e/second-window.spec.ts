/**
 * Второе окно: дерево веток во весь экран (`docs/design/tracks.md` §4,
 * решение владельца 16.08.2026 на прямой вопрос «что там показывать»).
 *
 * Несущее свойство — **окно ничего не хранит**. Оно получает состояние
 * от главного и отправляет обратно жесты; своих правок не применяет
 * (`tracks.md` §6, прямой запрет). Отсюда и устройство теста: страница
 * открывается ОДНА, без редактора, и всё, что она покажет, обязано прийти
 * снаружи. Если бы окно что-то помнило или достраивало само, оно показало
 * бы дерево и без сообщения — и первый же тест это поймает.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const SPLIT_TRACK = readFileSync(
  fileURLToPath(new URL('../fixtures/projects/split-track.json', import.meta.url)),
  'utf8',
);

async function openSecondWindow(page: Page): Promise<void> {
  await page.goto('/branches.html', { waitUntil: 'load' });
  await expect(page.getByTestId('branches-window-waiting')).toBeVisible();
}

/** Шлёт состояние так же, как его шлёт главное окно, — тем же каналом. */
async function publishState(page: Page, text: string, currentSegmentId: string): Promise<void> {
  await page.evaluate(
    ([projectText, id]) => {
      const channel = new BroadcastChannel('player-branches');
      channel.postMessage({ kind: 'state', text: projectText, currentSegmentId: id });
      channel.close();
    },
    [text, currentSegmentId] as const,
  );
}

test.describe('второе окно', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: если окно начнёт что-нибудь хранить или само
   * доставать проект (из хранилища работы, из адреса, откуда угодно) —
   * дерево появится без единого сообщения, и надпись ожидания исчезнет.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Реализация, читающая проект сама,
   * этот тест провалит — а именно её запрещает `tracks.md` §6.
   */
  test('без сообщения от главного окна не показывает НИЧЕГО, кроме ожидания', async ({ page }) => {
    await openSecondWindow(page);

    await expect(page.getByTestId('branches-window-tree')).toHaveCount(0);
    await expect(page.getByTestId('branches-window-waiting')).toContainText('Ждём главное окно');
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: разорвать канал (переименовать его на одной
   * из сторон) либо перестать разбирать текст проекта.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — предыдущий тест доказывает, что
   * без сообщения дерева нет, значит его появление вызвано сообщением,
   * а не самим фактом открытия страницы.
   */
  test('получив состояние, показывает то же дерево, что и главное окно', async ({ page }) => {
    await openSecondWindow(page);
    await publishState(page, SPLIT_TRACK, 's-left');

    await expect(page.getByTestId('branches-window-tree')).toBeVisible();
    await expect(page.getByTestId('branch-row-s-head')).toBeVisible();
    await expect(page.getByTestId('branch-row-s-left')).toBeVisible();
    await expect(page.getByTestId('branch-row-s-right')).toBeVisible();
    // Ровно тот же вид, что в нижней зоне редактора: один компонент на два
    // места, а не вторая отрисовка дерева.
    await expect(page.getByTestId('branch-tail-s-left')).toContainText('дальше →');
  });

  /**
   * Жест уходит ОБРАТНО, а не применяется на месте.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: если окно начнёт применять правку у себя —
   * оно не пошлёт ничего в канал, и слушатель ничего не дождётся.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Реализация «второе окно правит
   * само» этот тест провалит, и провалит именно по существу запрета.
   */
  test('щелчок по главе уходит жестом в главное окно, а не правится на месте', async ({ page }) => {
    await openSecondWindow(page);
    await publishState(page, SPLIT_TRACK, 's-head');
    await expect(page.getByTestId('branches-window-tree')).toBeVisible();

    const gesture = page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          const channel = new BroadcastChannel('player-branches');
          channel.onmessage = (event) => {
            const data = event.data as { kind?: string };
            if (data.kind === 'pick') {
              channel.close();
              resolve(data);
            }
          };
        }),
    );

    await page.getByTestId('chapter-pick-s-left').click();

    expect(await gesture).toEqual({ kind: 'pick', chapterId: 's-left' });
  });
});

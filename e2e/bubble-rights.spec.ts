/**
 * Права зрителя на каплю у ЗРИТЕЛЯ, а не у автора (v14, ADR-032).
 *
 * Здесь проверяется то, чего не видит ни один юнит: инвариант №3 в живом
 * браузере и — главное — ТИХИЙ ДЕФЕКТ, названный планом заранее.
 *
 * **Про тихий дефект.** Голос живёт внутри того же mp4, что и картинка.
 * Проверка «флаг `collapsed` выставился» была бы зелёной на продукте,
 * который вместе с картинкой выключил звук, — зритель сидел бы в тишине,
 * а все сигналы горели бы зелёным. Поэтому тест меряет, что звук ИДЁТ:
 * `webkitAudioDecodedByteCount` растёт, пока капля свёрнута.
 *
 * Прибор выбран замером S17, а не по вере: `AnalyserNode` в этой среде
 * показывает ноль ВСЕГДА, включая полностью видимое видео, — то есть врёт.
 * Счётчик декодированных байт различает состояния: при вынутом из DOM узле
 * он даёт 0, при любом сокрытии стилем — сотни байт за секунду.
 * Он нестандартный и живёт только в Chromium; наши e2e идут в Chromium.
 */
import { expect, test, type Page } from '@playwright/test';

/**
 * Счётчик декодированных байт звука — НЕСТАНДАРТНЫЙ API, живёт только
 * в Chromium, и стандартных типов у него нет.
 *
 * Объявляется здесь, а не в общих типах проекта: расширь мы `HTMLVideoElement`
 * глобально — свойство стало бы выглядеть частью платформы, и однажды на него
 * опёрся бы продукт, а не тест. Наши e2e идут в Chromium, продукт — нет.
 */
interface VideoWithAudioBytes extends HTMLVideoElement {
  readonly webkitAudioDecodedByteCount?: number;
}

async function openPlayer(page: Page, fixture: string): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
}

/** Позиция плеера в секундах сегмента. */
const positionOf = (page: Page): Promise<number> => page.evaluate(() =>
  (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

/**
 * Ждёт момента, когда владение точно у зрителя.
 *
 * Фикстура `bubble-spans`: отрезки автора на 1–3 и 7–9 с. Ждём 4-й секунды —
 * это середина промежутка, и одна пропущенная десятая доля не сдвинет ответ.
 */
async function waitForViewerTime(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const p = (window as unknown as { __player: { positionSeconds: number } }).__player;
    return p.positionSeconds >= 4 && p.positionSeconds < 6;
  }, null, { timeout: 30_000 });
}

test.describe('права зрителя на каплю', () => {
  test('вне отрезка капля достижима, а сцена вокруг — по-прежнему нет', async ({ page }) => {
    await openPlayer(page, 'bubble-spans');
    await page.getByRole('button', { name: 'Играть' }).click();
    await waitForViewerTime(page);

    // Инвариант №3 не ослаблен: сцена мертва, как и была.
    // СЛОМ: выставить сцене `pointer-events: auto` — покраснеет здесь,
    // и правильно: разрешение обязано быть точечным.
    const scene = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.player-stage')!).pointerEvents);
    expect(scene).toBe('none');

    // А капля — достижима. Спрашиваем БРАУЗЕР, кто лежит в этой точке,
    // а не читаем свойство: «мы выставили auto» и «попадание доходит» —
    // разные утверждения, и в этом проекте `elementFromPoint` уже врал
    // в обе стороны.
    // Спрашивается «попадание пришло В КАПЛЮ», а не «пришло ровно в её
    // корневой узел»: рендер видео кладёт внутрь настоящий <video>, и попадает
    // курсор именно в него. Требовать корень значило бы проверять устройство
    // рендера, а не право зрителя.
    const hit = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="head"]');
      if (!node) return { where: 'капли нет в DOM', inside: false };
      const r = node.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        where: at?.tagName.toLowerCase() ?? null,
        inside: at !== null && (at === node || node.contains(at)),
      };
    });
    // СЛОМ: не выставлять капле `pointer-events: auto` — попадание уедет
    // в `body`, ровно как измерено для остальной сцены (S4: 0 кликов из 6).
    expect(hit.inside, `попадание ушло в ${String(hit.where)}`).toBe(true);
    expect(hit.where).not.toBe('body');

    // Сосед по сцене остаётся недостижимым — разрешение точечное.
    const neighbour = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="bg"]');
      if (!node) return 'фона нет в DOM';
      const at = document.elementFromPoint(20, 20);
      return at?.getAttribute('data-id') ?? at?.tagName.toLowerCase() ?? null;
    });
    expect(neighbour).not.toBe('bg');
  });

  test('вне отрезка зритель сворачивает каплю ВИДИМОЙ кнопкой', async ({ page }) => {
    await openPlayer(page, 'bubble-spans');
    await page.getByRole('button', { name: 'Играть' }).click();
    await waitForViewerTime(page);

    const toggle = page.getByTestId('bubble-toggle');
    await expect(toggle).toBeVisible();

    // Нажимаем ПО КНОПКЕ, а не зовём обработчик: кнопка лежит внутри сцены,
    // у которой `pointer-events: none`, и её достижимость — отдельное
    // утверждение, измеренное в S17.
    await toggle.click();

    const scaleNow = (): Promise<number> => page.evaluate(() => {
      const value = getComputedStyle(document.querySelector('[data-id="head"]')!).scale;
      // `none` — свойство не задано вовсе, то есть масштаб единичный.
      return value === 'none' ? 1 : Number.parseFloat(value);
    });

    // СРАЗУ после нажатия капля ЕЩЁ НЕ ужалась: она ЕДЕТ, а не прыгает.
    // Это не придирка к анимации — `bubble.md` требует плавности, и прыжок
    // здесь был бы отступлением от спецификации, которое ничем не видно.
    // СЛОМ: убрать `transition` в `applyOwnership` — ужимание станет
    // мгновенным, и эта проверка покраснеет.
    expect(await scaleNow(), 'капля прыгнула, а не поехала').toBeGreaterThan(0.5);

    // А доехав — ужалась. СЛОМ: не выставлять `scale` при `collapsed`.
    await expect.poll(scaleNow, { timeout: 3_000 }).toBeLessThan(0.1);
  });

  test('СВОРАЧИВАНИЕ НЕ ГЛУШИТ ЗВУК — тихий дефект, названный планом', async ({ page }) => {
    await openPlayer(page, 'bubble-spans');
    await page.getByRole('button', { name: 'Играть' }).click();
    await waitForViewerTime(page);

    await page.getByTestId('bubble-toggle').click();

    // Меряем ПОСЛЕ сворачивания: сколько байт звука браузер декодировал
    // за секунду с четвертью. Флаг `collapsed` здесь не спрашивается вовсе —
    // он верен при любой реализации сворачивания, включая ту, что убивает звук.
    //
    // СЛОМ: заменить ужимание на `node.remove()` — счётчик встанет,
    // и тест покраснеет. Ровно этот слом и измерен в S17 как единственный
    // способ потерять голос.
    const grown = await page.evaluate(async () => {
      const video = document.querySelector<VideoWithAudioBytes>('video');
      if (!video) return { error: 'видео нет в DOM' };
      const before = video.webkitAudioDecodedByteCount ?? null;
      const positionBefore = video.currentTime;
      await new Promise((done) => setTimeout(done, 1250));
      return {
        bytes: (video.webkitAudioDecodedByteCount ?? 0) - (before ?? 0),
        time: video.currentTime - positionBefore,
        paused: video.paused,
        inDocument: document.contains(video),
      };
    });

    expect(grown.error, 'узел видео обязан остаться в документе').toBeUndefined();
    expect(grown.inDocument, 'узел вынут из DOM — так теряется голос').toBe(true);
    expect(grown.paused, 'видео встало — вместе с ним встал бы и голос').toBe(false);
    expect(grown.time, 'время дорожки не идёт').toBeGreaterThan(0.5);
    expect(grown.bytes, 'звук не декодируется: зритель сидит в тишине').toBeGreaterThan(0);
  });

  test('внутри отрезка автора зритель не может НИЧЕГО', async ({ page }) => {
    await openPlayer(page, 'bubble-spans');
    await page.getByRole('button', { name: 'Играть' }).click();

    // Отрезок автора — 1–3 с. Ждём его середины.
    await page.waitForFunction(() => {
      const p = (window as unknown as { __player: { positionSeconds: number } }).__player;
      return p.positionSeconds >= 1.4 && p.positionSeconds < 2.6;
    }, null, { timeout: 30_000 });

    // Кнопки нет — свернуть нечем. СЛОМ: показывать кнопку всегда.
    await expect(page.getByTestId('bubble-toggle')).toBeHidden();

    // И указатель капле не возвращён: внутри отрезка она принадлежит автору.
    // СЛОМ: выставлять `pointer-events: auto` без учёта владельца.
    const pointer = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-id="head"]')!).pointerEvents);
    expect(pointer).toBe('none');

    // Тот же вопрос БРАУЗЕРУ, что и в тесте про владение зрителя, — и ответ
    // обязан быть противоположным. Пара утверждений различающая: реализация,
    // которая просто всегда отдаёт `body` или всегда отдаёт каплю, покраснеет
    // ровно в одном из двух тестов.
    const hit = await page.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="head"]');
      if (!node) return { where: 'капли нет в DOM', inside: true };
      const r = node.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        where: at?.tagName.toLowerCase() ?? null,
        inside: at !== null && (at === node || node.contains(at)),
      };
    });
    // Ожидается «мимо капли», а не «в `body`»: у стенда плеера сцена лежит
    // внутри контейнера страницы, и сквозь мёртвую сцену попадание приходит
    // на него. Требовать именно `body` значило бы проверять устройство
    // стенда — замер S4 делался на голой странице, где контейнера нет.
    expect(hit.inside, `попадание пришло в каплю (${String(hit.where)})`).toBe(false);

    expect(await positionOf(page)).toBeLessThan(3);
  });
});

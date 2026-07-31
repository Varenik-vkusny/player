/**
 * Дорожка: волна, звук, перемотка.
 *
 * Проверяется то, ради чего дорожка существует, а не то, что компоненты
 * отрисовались. Волна обязана быть настоящей — то есть на канве действительно
 * есть непустые пиксели; звук обязан идти — то есть позиция растёт сама;
 * перемотка обязана попадать туда, куда нажали.
 *
 * Отдельно проверяется фикстура без аудиофайла. У minimal.json, two-gates.json
 * и edge-cases.json дорожки на диске нет, и схема этого не ловит: `src`
 * проверяется только на непустоту. Редактор обязан сказать об этом прямо
 * и продолжить работать — сцену править можно и без звука.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

/** Ждёт, пока дорожка декодируется: до этого волны нет и играть нечего. */
async function waitForTrack(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const transport = (window as unknown as { __transport?: { state: string } }).__transport;
      return transport?.state === 'ready';
    },
    null,
    { timeout: 30_000 },
  );
}

test.describe('дорожка редактора', () => {
  test('волна нарисована, а не пустая канва', async ({ page }) => {
    const errors = await openEditor(page, 'demo');
    expect(errors).toEqual([]);
    await waitForTrack(page);

    // Ждём кадр после появления пиков: канва рисуется в layout-эффекте.
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('.ed-waveform');
            if (!canvas) return -1;
            const ctx = canvas.getContext('2d');
            if (!ctx) return -1;
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // Считаем непрозрачные пиксели: на пустой канве их ноль.
            let painted = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) painted += 1;
            return painted;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(1000);
  });

  test('кнопка играет: позиция растёт сама', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    await page.getByRole('button', { name: 'Играть' }).click();
    // Кнопка обязана превратиться в паузу — иначе автор не поймёт, идёт ли звук.
    await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (window as unknown as { __transport: { positionSeconds: number } }).__transport
                .positionSeconds,
          ),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0.3);

    await page.getByRole('button', { name: 'Пауза' }).click();
    const stopped = await page.evaluate(
      () =>
        (window as unknown as { __transport: { positionSeconds: number } }).__transport
          .positionSeconds,
    );
    await page.waitForTimeout(400);
    const still = await page.evaluate(
      () =>
        (window as unknown as { __transport: { positionSeconds: number } }).__transport
          .positionSeconds,
    );
    expect(still, 'после паузы позиция не должна ехать').toBeCloseTo(stopped, 2);
  });

  test('нажатие по дорожке перематывает туда, куда нажали', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    const lane = page.getByTestId('track-lane');
    const box = await lane.boundingBox();
    if (!box) throw new Error('дорожка не видна');

    // Ровно четверть дорожки.
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);

    const { position, duration } = await page.evaluate(() => {
      const t = (window as unknown as {
        __transport: { positionSeconds: number; durationSeconds: number };
      }).__transport;
      return { position: t.positionSeconds, duration: t.durationSeconds };
    });

    expect(position / duration).toBeCloseTo(0.25, 2);

    // Головка обязана оказаться там же: иначе автор видит одно, а слышит другое.
    const head = await page.getByTestId('playhead').evaluate((node) => node.style.left);
    expect(Number.parseFloat(head)).toBeCloseTo(25, 0);
  });

  // Схема v3 разводит «звучит дорожка» и «что показывает сцена» (ADR-015):
  // StageView всегда рисует ровно один `currentSlide` (`state.currentSlideId`),
  // а `TrackView.seekToPointer` (`packages/editor/src/track/TrackView.tsx`)
  // трогает только `transport.seek` — сцену это не переключает. Автор
  // выбирает слайд явно, панелью слайдов или меткой на дорожке
  // (`SlidePanel`/`MarksLane`, см. e2e/editor.spec.ts и e2e/editor-text-
  // edit.spec.ts), а не пролистывает его перемоткой звука.
  //
  // ЭТОТ ТЕСТ ОСТАВЛЕН ВЫКЛЮЧЕННЫМ НАМЕРЕННО, а не удалён: предмет проверки
  // не исчез, он ПРОПАЛ ИЗ ПРОДУКТА. С появлением морфинга (ADR-016) потеря
  // стала дорогой: автор описывает переход, которого не может увидеть —
  // сцена редактора показывает статичный снимок выбранного слайда.
  //
  // Долг записан в planning.md §12.5 вместе с предложенным решением
  // (разделить «что правлю» и «что смотрю»: перемотка ведёт сцену через
  // ScenePreview.seek, выделение возвращает её на слайд). Тест — маркер
  // этого долга: как только сцена поедет за головкой, он снимается с паузы
  // и обязан позеленеть без правок.
  //
  // Проверка идёт по visibility, а не по opacity: скрытый элемент по
  // ADR-015 выражается видимостью, и `opacity` у него единица.
  test('сцена следует за дорожкой', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    const lane = page.getByTestId('track-lane');
    const box = await lane.boundingBox();
    if (!box) throw new Error('дорожка не видна');

    // Ищем внутри СМОТРОВОЙ сцены, а не по всему документу.
    //
    // Тест писался в мире с одной сценой, где document.querySelector был
    // однозначен. Решение владельца 31.07.2026 поставило рядом вторую сцену,
    // и узлов с этим data-id стало два. Проверено прогоном в живом Chrome:
    // querySelectorAll даёт 2 узла, и у первого closest('.ed-watch-host')
    // равен null.
    //
    // Уточнение до смотровой сцены осталось, но причина сменилась. С 01.08.2026
    // за головкой идут ОБЕ сцены (§2г: головка ведёт выбранный слайд), только
    // по-разному: смотровая показывает МОМЕНТ, включая середину перехода,
    // а сцена правки — СНИМОК слайда, в который ляжет правка. Внутри окна
    // перехода они законно расходятся, и утверждение про момент проверяется
    // на той сцене, которая момент и показывает.
    //
    // Это правка формы, а не смысла: утверждение «сцена поехала за головкой»
    // осталось прежним, изменилось лишь то, какая из двух им проверяется.
    const shown = () => page.evaluate(() => {
      const node = document.querySelector('.ed-watch-host [data-id="title"]');
      return node instanceof HTMLElement
        && node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    });

    // На нулевой секунде заголовок ещё не проявлен, к середине — уже да.
    expect(await shown()).toBe(false);

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    expect(await shown(), 'сцена не поехала за головкой').toBe(true);
  });

  /**
   * Обе сцены показывают один слайд, когда головка стоит ВНЕ окна перехода.
   *
   * Связка «головка ↔ выбранный слайд» была сделана односторонней и это
   * оказалось хуже, чем её отсутствие: правка уходит в слайд под головкой
   * (§14.9), а автору показывается слайд под выделением — он правит не то,
   * что видит. Замерено на `demo.json`: головка на 46.8 с, сцена правки
   * показывала один элемент из семи, смотровая — все семь.
   *
   * Сравниваются СОСТАВЫ видимого, а не отдельный элемент: расхождение
   * на один слайд меняет сразу несколько элементов, и проверка по одному
   * имени была бы зелёной ровно тогда, когда этот один совпал случайно.
   */
  test('обе сцены показывают один слайд, куда бы ни встала головка', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    const box = await page.getByTestId('track-lane').boundingBox();
    if (!box) throw new Error('дорожка не видна');
    const duration = await page.evaluate(
      () => (window as unknown as { __transport: { durationSeconds: number } })
        .__transport.durationSeconds,
    );

    const visible = () => page.evaluate(() => {
      const namesIn = (selector: string): string[] =>
        [...document.querySelectorAll<HTMLElement>(selector)]
          .filter((node) => node.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          .map((node) => node.dataset['id'] ?? '')
          .sort();
      return {
        edit: namesIn('.ed-stage-host [data-id]'),
        watch: namesIn('.ed-watch-host [data-id]'),
      };
    });

    // Моменты выбраны заведомо ВНЕ окон перехода: внутри окна сцены
    // расходятся законно — одна показывает движение, другая снимок.
    for (const seconds of [3, 12, 24, 46.8]) {
      await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2);
      const { edit, watch } = await visible();
      expect(edit, `на ${seconds} с сцены показывают разные слайды`).toEqual(watch);
      expect(edit.length, `на ${seconds} с обе сцены пусты — проверять нечего`)
        .toBeGreaterThan(0);
    }
  });

  test('фикстура без аудиофайла: причина видна, редактор работает', async ({ page }) => {
    // Ошибка загрузки печатается в консоль браузером — это его дело,
    // и в список ошибок страницы она не попадает.
    await openEditor(page, 'two-gates');

    // Причина показывается дословно и обязана называть файл: без пути
    // «Unable to decode audio data» не говорит автору, что именно сломано.
    // Сама формулировка приходит от браузера и от сервера, поэтому
    // проверяется путь, а не текст ошибки.
    await expect(page.getByTestId('track-failure')).toContainText('audio/two-gates.mp3');
    // Играть нечего, и кнопка обязана быть недоступна, а не делать вид.
    await expect(page.getByRole('button', { name: 'Играть' })).toBeDisabled();

    // Сцена при этом жива и правится: отсутствие звука не повод ломать редактор.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
  });
});

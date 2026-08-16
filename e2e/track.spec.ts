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
  // ИСТОРИЯ ЭТОГО ТЕСТА, ИСПРАВЛЕННАЯ 09.08.2026.
  //
  // Комментарий, стоявший здесь до Сессии 30, заглавными буквами утверждал,
  // что тест «оставлен выключенным намеренно». Это было неправдой: на строке
  // ниже стоит обычный `test(...)`, а во всём e2e единственный `test.skip` —
  // в shots.spec.ts. Тест сняли с паузы, когда долг §12.5 закрыли смотровой
  // сценой, а комментарий над ним не тронули. Комментарий, велящий не верить
  // зелёному тесту, опаснее гнилого числа, поэтому переписан.
  //
  // Долг §12.5 ПЕРЕОТКРЫТ 09.08.2026 решением владельца: смотровая сцена
  // убрана ради ширины холста, и цена названа вслух. Автор снова не может
  // увидеть сам переход внутри редактора — только уходом в плеер отдельной
  // вкладкой.
  //
  // Но утверждение ЭТОГО теста переход не трогает: он проверяет, что сцена
  // едет за головкой, а это осталось. С 01.08.2026 (§2г) головка ведёт
  // выбранный слайд, и сцена правки показывает снимок того слайда, в который
  // ляжет правка. Момент выбран вне окна перехода, поэтому снимок и момент
  // совпадают, и проверка честно переносится на единственную оставшуюся сцену.
  //
  // Проверка идёт по visibility, а не по opacity: скрытый элемент по
  // ADR-015 выражается видимостью, и `opacity` у него единица.
  test('сцена следует за дорожкой', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    const lane = page.getByTestId('track-lane');
    const box = await lane.boundingBox();
    if (!box) throw new Error('дорожка не видна');

    // Сцена в редакторе снова одна (Сессия 30), поэтому уточнять, какая
    // из двух, больше не нужно и нечем. Селектор вернулся к сцене правки —
    // ровно к тому, чем он был до появления смотровой сцены 31.07.2026.
    const shown = () => page.evaluate(() => {
      const node = document.querySelector('.ed-stage-host [data-id="title"]');
      return node instanceof HTMLElement
        && node.checkVisibility({ visibilityProperty: true, opacityProperty: true });
    });

    // На нулевой секунде заголовок ещё не проявлен, к середине — уже да.
    expect(await shown()).toBe(false);

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    expect(await shown(), 'сцена не поехала за головкой').toBe(true);
  });

  /**
   * ПРАВКА УХОДИТ В ТОТ СЛАЙД, КОТОРЫЙ ПОКАЗАН, куда бы ни встала головка.
   *
   * До Сессии 30 тот же риск проверялся сравнением ДВУХ сцен: сцена правки
   * и смотровая обязаны были показывать одно вне окна перехода. Смотровую
   * сцену убрал владелец 09.08.2026 — и вместе с ней исчез не риск, а его
   * ДЕТЕКТОР. Удалить тест значило бы выключить проверку, притворившись,
   * что проверять стало нечего.
   *
   * Охраняемый дефект прежний, §14.9: связка «головка ↔ выбранный слайд»
   * односторонняя, и правка уходит в слайд под головкой, а показывается
   * слайд под выделением — автор правит не то, что видит. Замерено было
   * на `demo.json`: головка на 46.8 с, сцена показывала один элемент
   * из семи вместо всех семи.
   *
   * С одной сценой то же самое проверяется прямее и строже: делаем
   * настоящую правку и смотрим, ВИДНА ли она. Если правка ушла в другой
   * слайд, новый элемент не появится на сцене вовсе, и тест краснеет.
   * Проверка стала поведенческой вместо сравнительной — не «два числа
   * совпали», а «автор увидел то, что сделал».
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: любое расхождение между
   * слайдом, который рисует сцена, и слайдом, в который редьюсер кладёт
   * новый элемент. Именно оно и было дефектом §14.9.
   */
  test('правка уходит в тот слайд, который показан, куда бы ни встала головка', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitForTrack(page);

    const box = await page.getByTestId('track-lane').boundingBox();
    if (!box) throw new Error('дорожка не видна');
    const duration = await page.evaluate(
      () => (window as unknown as { __transport: { durationSeconds: number } })
        .__transport.durationSeconds,
    );

    const visibleIds = () => page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.ed-stage-host [data-id]')]
        .filter((node) => node.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
        .map((node) => node.dataset['id'] ?? '')
        .sort());

    // Моменты выбраны заведомо ВНЕ окон перехода: внутри окна сцена
    // показывает движение, а не снимок, и состав видимого меняется законно.
    for (const seconds of [3, 12, 24, 46.8]) {
      await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2);

      const before = await visibleIds();
      expect(before.length, `на ${seconds} с сцена пуста — правку не с чем сравнивать`)
        .toBeGreaterThan(0);

      await page.getByTestId('rail-shapes').click();
      await page.getByTestId('insert-shape').click();

      // Через poll, а не одним чтением: перерисовка сцены асинхронна,
      // и мгновенный снимок дал бы гонку — красное там, где продукт цел.
      await expect
        .poll(
          async () => (await visibleIds()).filter((id) => !before.includes(id)).length,
          { message: `на ${seconds} с правка не видна: элемент лёг в слайд, который сцена не показывает` },
        )
        .toBe(1);
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

/**
 * ОДНО И ТО ЖЕ — ОДНИМ ЧИСЛОМ (решение владельца 15.08.2026).
 *
 * Голова полосы «Слайды» и счётчик ленты слайдов стоят в нижней зоне
 * ОДНОВРЕМЕННО и оба говорят про слайды текущей главы. До этой правки они
 * расходились на единицу: подпись полосы считала РОМБЫ на дорожке, а первый
 * слайд ромба не получает — он стартовый вид главы. Автор видел «Слайды 14»
 * и «1 / 15» рядом и не мог понять, какое из чисел правда.
 *
 * Найдено ГЛАЗАМИ на скриншоте: схема числа не проверяет, и не жаловался
 * ни один тест.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: возврат подсчёта по меткам
 * (`marks.filter(kind === 'slide').length`) в `TrackView`.
 *
 * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Сравниваются ДВА НЕЗАВИСИМЫХ источника
 * на экране — подпись полосы и счётчик ленты, — и они расходились на живом
 * продукте. Проверка «подпись показывает число» была бы зелёной и тогда.
 */
test.describe('числа про слайды не расходятся между собой', () => {
  test('подпись полосы «Слайды» совпадает со счётчиком ленты', async ({ page }) => {
    const errors = await openEditor(page, 'demo');

    // Счётчик ленты вида «1 / 15 · 0.00 с» — виден и при свёрнутой ленте.
    const counter = await page.getByTestId('strip-counter').textContent();
    const total = /\/\s*(\d+)/.exec(counter ?? '');
    expect(total, `не разобрал счётчик ленты: ${counter}`).not.toBeNull();

    const laneNote = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('.ed-lane-head'));
      const slides = heads.find(
        (head) => head.querySelector('.ed-lane-head-title')?.textContent === 'Слайды',
      );
      return slides?.querySelector('.ed-lane-head-note')?.textContent ?? null;
    });
    expect(laneNote, 'у полосы «Слайды» нет подписи с числом').not.toBeNull();

    expect(
      Number(laneNote),
      `полоса говорит «${laneNote}», лента — «${counter}»: одно и то же названо двумя числами`,
    ).toBe(Number(total![1]));

    // Промежуточная проверка «сравнивать было что»: одна глава с единственным
    // слайдом сделала бы совпадение тождеством.
    expect(Number(total![1]), 'нужно больше одного слайда, иначе тест пуст').toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
});

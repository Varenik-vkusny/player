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

import { resolveTimeRef, SCHEMA_VERSION, type Project, type Segment } from '@player/core';

/** Момент, на котором сравниваются картинки. Видны и текст, и фигуры. */
const PARITY_AT = 24;

/**
 * Сцена редактора рисует и правит только ОДИН выбранный слайд текущего
 * сегмента (StageView.tsx, `currentSlide`) — она не морфит по всей дорожке,
 * как это делает воспроизведение в плеере. `__transport.seek` двигает только
 * головку плеера на дорожке (переменная вида, см. Editor.tsx), а какой слайд
 * правится — отдельное состояние `currentSlideId`, которое сеанс не трогает
 * (packages/editor/src/state/project.ts). Чтобы получить слайд, чьи states
 * совпадают с тем, что покажет плеер в секунду `seconds`, берём последний
 * слайд, чьё время не позже неё: между соседними слайдами сцена неизменна.
 */
function slideAtOrBefore(segment: Segment, seconds: number): Segment['slides'][number] {
  let chosen = segment.slides[0]!;
  for (const slide of segment.slides) {
    if (resolveTimeRef(slide.at, segment.audio.words) <= seconds) chosen = slide;
  }
  return chosen;
}

/** Первый сегмент текущего проекта редактора — то же, что видит `Editor.tsx`. */
async function firstSegment(page: Page): Promise<Segment> {
  return page.evaluate(() => {
    const project = (window as unknown as { __project: Project }).__project;
    return project.segments[0]!;
  });
}

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

/**
 * Двигает элемент мышью — так же, как это делает автор.
 *
 * `anchor` — точка внутри бокса элемента (доля ширины/высоты, по умолчанию
 * центр), с которой берётся жест. Не всегда можно хватать за центр: если на
 * этом слайде поверх лежит элемент с бо́льшим zIndex, geometry-хиттест
 * (StageView.tsx, hitElementAt) отдаст жест ему. См. использование в тесте
 * «сохранённый файл проходит валидацию…» — там это не выбор по вкусу,
 * а обход конкретного наложения.
 */
async function dragElement(
  page: Page,
  id: string,
  dx: number,
  dy: number,
  anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): Promise<void> {
  const center = await page.evaluate(
    ({ elementId, anchor: a }) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width * a.x, y: rect.top + rect.height * a.y };
    },
    { elementId: id, anchor },
  );
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + dx / 2, center.y + dy / 2);
  await page.mouse.move(center.x + dx, center.y + dy);
  await page.mouse.up();
}

test.describe('круг: правка в редакторе — просмотр в плеере', () => {
  test('сохранённый файл проходит валидацию и содержит правки', async ({ page }) => {
    await openEditor(page);

    // 'card' на первом слайде demo.json ещё не проявился (его кью
    // "opacity 0→1" идёт с 8.7 по 9.2 с — fixtures/projects/demo.json) и
    // потому там `visible: false`: клик сквозь него не попадает
    // (StageView.tsx, hitElementAt фильтрует по isVisible). Встаём на слайд,
    // где он уже виден (после 9.2 с), тем же путём, что и автор — кнопкой
    // панели слайдов.
    const segment = await firstSegment(page);
    const slide = slideAtOrBefore(segment, 10);
    await page.getByTestId(`slide-${slide.id}`).click();
    await expect(page.locator('.ed-stage-host [data-id="card"]')).toBeVisible();

    // Хватаем не за центр 'card', а за его верхний левый угол: декоративный
    // 'dot' геометрически лежит поверх середины карточки (демо-макет,
    // fixtures/projects/demo.json) и на этом слайде ещё не проявился —
    // но StageView.tsx.isVisible() решает, попадает ли элемент в хиттест, по
    // computed opacity, а render.ts (packages/player/src/render.ts:83,98)
    // держит opacity=1 у СКРЫТЫХ элементов тоже и кодирует скрытость через
    // visibility:hidden. Поэтому «невидимый» dot всё равно участвует в
    // геометрическом хиттесте и, будучи выше по zIndex, перехватывает клик
    // по центру карточки. Это защита от точно такого перехвата не работает —
    // похоже на дефект продукта (см. отчёт), но эта проверка не про него,
    // поэтому просто не целимся в перекрытую зону.
    await dragElement(page, 'card', 80, 40, { x: 0.15, y: 0.15 });

    const moved = await page.evaluate((slideId) => {
      const project = (window as unknown as {
        __project: { segments: { slides: { id: string; states: Record<string, { x: number }> }[] }[] };
      }).__project;
      return project.segments[0]!.slides.find((s) => s.id === slideId)!.states['card']?.x;
    }, slide.id);
    expect(moved).not.toBe(1240);

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Сохранить' }).click(),
    ]).then(([event]) => event);

    const file = await download.path();
    if (!file) throw new Error('файл не сохранился');
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      schemaVersion: number;
      segments: { slides: { id: string; states: Record<string, { x: number }> }[] }[];
    };

    // Валидация уже прошла внутри редактора — serializeProject прогоняет
    // текст через loadProject перед выдачей. Здесь проверяется, что в файл
    // попало именно то, что на экране.
    // Текущая версия, а не зашитое число: редактор обязан сохранять в той
    // версии, которую понимает сборка. Зашитое число пережило бы бамп схемы
    // и покраснело бы на ровном месте — так и случилось при переходе на v4.
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.segments[0]!.slides.find((s) => s.id === slide.id)!.states['card']?.x).toBe(moved);
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

  test('проект с крупной вшитой картинкой доезжает из редактора в плеер целиком', async ({
    page,
    context,
  }) => {
    // Канал предпросмотра — IndexedDB, а не localStorage (packages/editor/src/state/save.ts).
    // Причина измерена спайком spikes/s8-quota: на этом origin localStorage
    // рвётся ровно на 5 242 869 символах (10 485 738 байт UTF-16), а data-URI
    // одной вшитой картинки уходит за эту границу сам по себе. Здесь строится
    // проект заведомо больше измеренной границы и проверяется, что он всё
    // равно доезжает целиком, а не обрубается молча.
    const base: { scene: { elements: unknown[] } } = JSON.parse(
      readFileSync(new URL('../fixtures/projects/empty.json', import.meta.url), 'utf8'),
    );

    const LOCAL_STORAGE_BOUNDARY_CHARS = 5_242_869; // spikes/results/s8.json
    const HUGE_IMAGE = `data:image/png;base64,${'A'.repeat(8 * 1024 * 1024)}`;

    const project = {
      ...base,
      scene: { ...base.scene, elements: [
        {
          id: 'huge-image',
          type: 'image',
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          rotation: 0,
          zIndex: 0,
          style: {},
          content: HUGE_IMAGE,
        },
      ] },
    };

    const projectText = JSON.stringify(project);
    expect(projectText.length).toBeGreaterThan(LOCAL_STORAGE_BOUNDARY_CHARS);

    // Своя фикстура не пишется на диск: page.route подменяет ответ на лету,
    // не трогая fixtures/projects (эталоны неприкосновенны, а эта фикстура
    // существует только ради размера).
    await page.route('**/fixtures/big-image.json', (route) =>
      route.fulfill({ contentType: 'application/json; charset=utf-8', body: projectText }),
    );

    await openEditor(page, 'big-image');

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');

    // Старый канал (localStorage) бросил бы QuotaExceededError ещё внутри
    // редактора, до открытия этой вкладки. Дошли до ready — значит канал
    // перенёс проект целиком.
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    await expect(player.locator('.player-stage > *')).toHaveCount(1);

    // Считать элементы недостаточно: пустая строка тоже дала бы один div.
    // Длина того, что реально легло в background-image, доказывает, что
    // строка не обрублена на полпути.
    const backgroundImageLength = await player.evaluate(() => {
      const node = document.querySelector<HTMLElement>('[data-id="huge-image"]');
      if (!node) throw new Error('на сцене плеера нет элемента huge-image');
      return getComputedStyle(node).backgroundImage.length;
    });
    expect(backgroundImageLength).toBeGreaterThan(HUGE_IMAGE.length);
  });

  test('сбой канала предпросмотра виден в редакторе сразу и по-русски', async ({
    page,
    context,
  }) => {
    // Настоящее исчерпание квоты IndexedDB непрактично гонять в каждом
    // прогоне (десятки-сотни МБ, spikes/s8-quota). Здесь проверяется не
    // квота, а требование CLAUDE.md «падать громко»: ЛЮБОЙ сбой канала
    // обязан всплыть в редакторе немедленно, а не привести к открытой
    // вслепую вкладке плеера, которая сообщит о беде не там, где она возникла.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        value: {
          open(): never {
            throw new Error('искусственный сбой IndexedDB для теста');
          },
        },
      });
    });

    await openEditor(page);

    // Обработчик, а не waitForEvent параллельно с click(): window.alert
    // синхронно замораживает JS страницы, и click() не вернётся, пока диалог
    // не закрыт, — значит закрывать его нужно из обработчика событий, а не
    // из кода теста, ожидающего оба промиса разом (это и есть тупик,
    // пойманный при первом прогоне).
    let dialogMessage: string | undefined;
    page.once('dialog', (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });

    await page.getByRole('button', { name: 'Открыть в плеере' }).click();
    await expect.poll(() => dialogMessage).toContain('Не удалось передать проект в плеер');

    // И никакая вторая вкладка при этом не открылась: при сбое канала
    // открывать плеер нечем и незачем — категорически недопустимый исход,
    // которого это и проверяет.
    expect(context.pages()).toHaveLength(1);
  });

  test('инвариант №5: сцена в редакторе и в ванильном хосте совпадает', async ({ page }) => {
    await openEditor(page);
    await page.evaluate((at) => {
      (window as unknown as { __transport: { seek(s: number): void } }).__transport.seek(at);
    }, PARITY_AT);

    // `__transport.seek` двигает только головку плеера на дорожке — сцена
    // редактора рисует ровно ОДИН выбранный слайд (StageView.tsx), а не то,
    // что морфинг посчитал бы на этой секунде. Ванильный хост ниже, наоборот,
    // прогоняет ScenePreview.seek по всему сегменту (apps/playground/src/
    // preview.ts) — то есть настоящую интерполяцию. Чтобы картинки совпали,
    // редактор нужно явно поставить на слайд, чьё состояние и есть тот самый
    // застывший кадр в PARITY_AT (между соседними слайдами сцена неизменна).
    const segment = await firstSegment(page);
    const slide = slideAtOrBefore(segment, PARITY_AT);
    await page.getByTestId(`slide-${slide.id}`).click();
    // Синхронизация со структурной пересборкой сцены (StageView.tsx,
    // структурный useLayoutEffect срабатывает на смену currentSlide.id):
    // 'card' виден только начиная с этого слайда, дальше он не гаснет.
    await expect(page.locator('.ed-stage-host [data-id="card"]')).toBeVisible();

    // Размер области сцены в редакторе задаёт условия сравнения: ванильный
    // хост открывается ровно в таком вьюпорте, тогда масштаб выходит тот же,
    // а значит снимки одного размера.
    const size = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.ed-stage-host');
      if (!host) throw new Error('нет области сцены');
      return { width: host.clientWidth, height: host.clientHeight };
    });

    const fromEditor = await page.locator('[data-testid="stage-scene"]').screenshot();

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

  test('область сцены получает целые размеры', async ({ page }) => {
    // Не про сглаживание текста и не про инвариант №5 сам по себе — про то,
    // что раскладка НАД сценой не имеет права протаскивать дробный пиксель
    // в .ed-stage-host. applyFit считает масштаб от округлённых
    // clientWidth/clientHeight, поэтому дробный getBoundingClientRect —
    // не косметика: это сигнал, что где-то выше сидит CSS-величина,
    // не представимая в сетке 1/64 px, которой Chrome меряет layout
    // (например, `em`-размер, дающий на выходе X.Y8 или X.Y2). Тест
    // сравнивает целые числа, поэтому не зависит от сглаживания шрифтов
    // и не мигает — в отличие от побитового сравнения снимков выше.
    await openEditor(page);

    const rect = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.ed-stage-host');
      if (!host) throw new Error('нет области сцены');
      return host.getBoundingClientRect();
    });

    expect(rect.width, `ширина области сцены дробная: ${rect.width}`).toBe(
      Math.round(rect.width),
    );
    expect(rect.height, `высота области сцены дробная: ${rect.height}`).toBe(
      Math.round(rect.height),
    );
  });
});

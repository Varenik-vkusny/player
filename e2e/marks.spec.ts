/**
 * Метки на дорожке: анимации и гейты.
 *
 * Главное, что здесь проверяется, — инвариант №10: «Метки времени привязаны
 * к словам транскрипта, не к миллисекундам. Секунды — только там, где слова
 * нет». Проверяется по тому, что реально оказалось в проекте, а не по тому,
 * что показал интерфейс: метка, выглядящая правильно и сохранённая в секундах,
 * переживёт замену озвучки ровно до первого сдвига таймингов.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

interface SavedRef {
  kind: 'seconds' | 'word';
  t?: number;
  wordIndex?: number;
  offset?: number;
  anchor?: { text: string; before: string; after: string };
}

const DEMO = JSON.parse(
  readFileSync(new URL('../fixtures/projects/demo.json', import.meta.url), 'utf8'),
) as { audio: { duration: number; words: { text: string; start: number; end: number }[] } };

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  // Готовность страницы и готовность дорожки — разные события: сцена
  // строится сразу, а звук ещё декодируется, и до этого длительность
  // у транспорта нулевая.
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

/** Перемотка нажатием по дорожке — так же, как это делает человек. */
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

async function gatesOf(page: Page): Promise<{ id: string; at: SavedRef }[]> {
  return page.evaluate(
    () =>
      (window as unknown as {
        __project: { segments: { gates: { id: string; at: SavedRef }[] }[] };
      }).__project.segments[0]!.gates,
  );
}

test.describe('метки на дорожке', () => {
  test('метки эталонного проекта видны', async ({ page }) => {
    await openEditor(page);
    // Кью версии 1 миграция превращает в слайды (ADR-015): восемь анимаций
    // demo.json дают 15 слайдов, из которых 14 — метки на дорожке (первый,
    // обязанный стоять на нуле, меткой не считается, `Editor.tsx`, `marks`,
    // `fromSlides = segment.slides.slice(1)`). Гейтов по-прежнему два.
    await expect(page.locator('[data-testid^="mark-slide-"]')).toHaveCount(14);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(2);

    // Оба гейта demo.json стоят на словах — это видно и без раскрытия свойств.
    for (const id of ['gate-choice', 'gate-input']) {
      await expect(page.getByTestId(`mark-gate-${id}`)).toHaveAttribute('data-on-word', '1');
    }
  });

  /**
   * Хвост окна движения (`product.md` §2б [Р], ADR-020). Проверяется
   * геометрией, а не наличием узла: смысл хвоста в том, что он КОНЧАЕТСЯ
   * на метке. Хвост, нарисованный справа от ромба, был бы виден в тесте
   * на существование и рассказывал бы автору ровно обратное.
   */
  test('у слайда виден хвост окна движения, и кончается он на метке', async ({ page }) => {
    await openEditor(page);

    const slideMarks = page.locator('[data-testid^="mark-slide-"]');
    const tails = page.locator('.ed-mark-tail');
    // Хвост есть не у каждого слайда: срез (`transition: cut`) не едет.
    expect(await tails.count()).toBeGreaterThan(0);
    expect(await tails.count()).toBeLessThanOrEqual(await slideMarks.count());

    const first = await tails.first().boundingBox();
    if (!first) throw new Error('хвост не виден');

    // Ромб метки, к которой этот хвост ведёт: его центр обязан лежать
    // на правом краю хвоста, а не на левом.
    const centres = await slideMarks.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return rect.left + rect.width / 2;
      }));
    const right = first.x + first.width;
    const nearest = centres.reduce((best, x) => (Math.abs(x - right) < Math.abs(best - right) ? x : best));

    expect(Math.abs(nearest - right), 'хвост кончается на метке').toBeLessThan(2);
    expect(first.x, 'и начинается раньше неё').toBeLessThan(nearest - 1);
  });

  test('гейт, поставленный на слово, сохраняется ссылкой на слово с якорем', async ({ page }) => {
    await openEditor(page);
    const before = await gatesOf(page);

    // Середина слова — там привязка обязана быть однозначной.
    const word = DEMO.audio.words[12]!;
    const middle = word.start + (word.end - word.start) / 2;
    await seekTrack(page, middle);
    // exact: true — иначе имя совпадает и с кнопкой узла графа (Задача 9):
    // у demo.json заголовок узла «Демо: гейты на словах» тоже содержит
    // подстроку «гейт», и без exact локатор ловил бы оба элемента.
    await page.getByRole('button', { name: '▮ остановка', exact: true }).click();

    const after = await gatesOf(page);
    expect(after).toHaveLength(before.length + 1);

    const added = after.find((gate) => !before.some((old) => old.id === gate.id));
    if (!added) throw new Error('гейт не добавился');

    expect(added.at.kind, 'метка на слове обязана храниться ссылкой, а не секундами').toBe('word');
    expect(added.at.wordIndex).toBe(12);
    // Якорь строится нормализацией: строчные, ё → е, без пунктуации.
    // Собранный руками он не прошёл бы resolveTimeRef.
    expect(added.at.anchor?.text).toBe(
      word.text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, ''),
    );
    expect(added.at.anchor?.before).toBe(
      DEMO.audio.words[11]!.text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, ''),
    );
    // Смещение отсчитывается от начала слова, а не от нуля дорожки.
    expect(added.at.offset).toBeCloseTo(middle - word.start, 1);
  });

  test('метка в паузе между фразами сохраняется секундами', async ({ page }) => {
    await openEditor(page);

    // Ищем самый широкий промежуток между словами: там слова нет,
    // и привязывать не к чему — по инварианту №10 это единственный случай,
    // когда в проекте оказываются секунды.
    let gapAt = 0;
    let widest = 0;
    for (let index = 1; index < DEMO.audio.words.length; index += 1) {
      const gap = DEMO.audio.words[index]!.start - DEMO.audio.words[index - 1]!.end;
      if (gap > widest) {
        widest = gap;
        gapAt = DEMO.audio.words[index - 1]!.end + gap / 2;
      }
    }
    expect(widest, 'в фикстуре нет паузы шире порога привязки — тест бессмыслен').toBeGreaterThan(
      0.6,
    );

    const before = await gatesOf(page);
    await seekTrack(page, gapAt);
    // exact: true — иначе имя совпадает и с кнопкой узла графа (Задача 9):
    // у demo.json заголовок узла «Демо: гейты на словах» тоже содержит
    // подстроку «гейт», и без exact локатор ловил бы оба элемента.
    await page.getByRole('button', { name: '▮ остановка', exact: true }).click();

    const after = await gatesOf(page);
    const added = after.find((gate) => !before.some((old) => old.id === gate.id));
    if (!added) throw new Error('гейт не добавился');

    expect(added.at.kind).toBe('seconds');
    expect(added.at.t).toBeCloseTo(gapAt, 1);
  });

  test('добавление метки не отматывает сцену в начало', async ({ page }) => {
    // Найдено глазами: добавление гейта пересобирает сцену, а свежий
    // предпросмотр стоит на нуле. Эффект перемотки при этом не срабатывает —
    // момент не менялся. Автор видел, как всё, что он настроил, исчезает
    // в ответ на нажатие кнопки.
    await openEditor(page);
    await seekTrack(page, 24);

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(before), 'на 24-й секунде заголовок обязан быть виден').toBeGreaterThan(0.9);

    // exact: true — иначе имя совпадает и с кнопкой узла графа (Задача 9):
    // у demo.json заголовок узла «Демо: гейты на словах» тоже содержит
    // подстроку «гейт», и без exact локатор ловил бы оба элемента.
    await page.getByRole('button', { name: '▮ остановка', exact: true }).click();

    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(after), 'сцена отмоталась в начало после добавления метки').toBeGreaterThan(0.9);
  });

  test('перетаскивание метки меняет её момент в проекте', async ({ page }) => {
    await openEditor(page);

    // gate-choice (слово №32, офсет −0.15 с) не годится: миграция кладёт
    // на то же слово ещё и слайд `node-1-slide-9` (офсет 0), метки почти
    // совпадают по пикселю дорожки, и слайд, будучи позже в DOM (`Editor.tsx`,
    // `marks` — сначала гейты, потом слайды), перехватывает нажатие целиком:
    // `elementFromPoint` в центре гейта возвращает узел слайда, а не гейта.
    // gate-input (слово №89) стоит особняком — ближайшая метка дальше чем
    // на ширину метки, нажатие попадает именно в него.
    const mark = page.getByTestId('mark-gate-gate-input');
    const box = await mark.boundingBox();
    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!box || !lane) throw new Error('метка или полоса не видны');

    const before = (await gatesOf(page)).find((gate) => gate.id === 'gate-input');
    if (!before) throw new Error('гейта нет');

    // Тащим влево: gate-input стоит у самого конца дорожки, и десятая часть
    // вправо увела бы курсор за её пределы.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + lane.width * 0.05, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 - lane.width * 0.1, box.y + box.height / 2);
    await page.mouse.up();

    const after = (await gatesOf(page)).find((gate) => gate.id === 'gate-input');
    if (!after) throw new Error('гейт исчез');

    // Момент обязан измениться, а вид ссылки — остаться осмысленным:
    // куда бы метка ни приехала, она либо на слове с якорем, либо в секундах.
    expect(JSON.stringify(after.at)).not.toBe(JSON.stringify(before.at));
    if (after.at.kind === 'word') {
      expect(after.at.anchor?.text, 'ссылка на слово без якоря невалидна').toBeTruthy();
    } else {
      expect(after.at.t).toBeGreaterThan(0);
    }
  });
});

/**
 * known-bugs §7: метку остановки нельзя было нажать, если на том же слове
 * стоит слайд.
 *
 * Слайд рисуется позже остановки (`Editor.tsx`, `marks` — сначала гейты,
 * потом слайды) и перехватывал нажатие ЦЕЛИКОМ: `elementFromPoint` в центре
 * остановки возвращал узел слайда. Автор физически не мог открыть настройки
 * такой остановки, а случай частый — миграция ставит слайд на каждое слово
 * с кью.
 *
 * Вылечено разведением по вертикали: остановки в свою полосу, слайды в свою.
 * Не z-index'ом — порядок наложения решает, кто сверху, но обе метки
 * продолжали бы занимать один пиксель, и недоступной стала бы просто другая.
 */
test.describe('метки не перекрывают друг друга', () => {
  test('остановку на том же слове, что слайд, можно выбрать нажатием', async ({ page }) => {
    await openEditor(page);

    // demo.json: gate-choice стоит на слове №32, и миграция кладёт на то же
    // слово слайд node-1-slide-9. Ровно тот случай, что был недоступен.
    const gate = page.getByTestId('mark-gate-gate-choice');
    await expect(gate).toBeVisible();

    // Нажатие по ВИДИМОЙ метке, а не вызов обработчика: дефект был именно
    // в том, что до обработчика нажатие не доходило.
    await gate.click();

    await expect(page.getByTestId('mark-panel')).toBeVisible();
    // Открылась панель именно этой остановки, а не соседнего слайда.
    // Идентификатор лежит в значении поля, а не в тексте панели.
    await expect(page.getByTestId('mark-panel').getByRole('textbox', { name: 'Идентификатор' }))
      .toHaveValue('gate-choice');
  });

  test('слайд на том же слове тоже остаётся доступен', async ({ page }) => {
    await openEditor(page);

    // Обратная сторона: разведение не должно было отобрать доступ у слайда.
    const slide = page.getByTestId('mark-slide-node-1-slide-9');
    await expect(slide).toBeVisible();
    await slide.click();

    await expect(page.getByTestId('mark-panel')).toBeVisible();
    await expect(page.getByTestId('mark-panel').getByRole('textbox', { name: 'Идентификатор' }))
      .toHaveValue('node-1-slide-9');
  });
});

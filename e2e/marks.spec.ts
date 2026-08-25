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

/**
 * Ставит гейт на секунду `seconds`: правый щелчок по дорожке (он же
 * перематывает головку в точку щелчка, Сессия 55) открывает меню места,
 * пункт `ctxmenu-add-gate` — бывшая кнопка «остановка».
 *
 * Возвращает секунду, которую в действительности получит продукт — она
 * НЕ побитово равна `seconds`. Замерено 21.08.2026 живым браузером:
 * `pointerdown` (используется прежним `seekTrack` для левого щелчка) несёт
 * ДРОБНЫЙ `clientX` (`1197.8999...`), а `contextmenu` — обычное `MouseEvent`,
 * и Chromium отдаёт в нём `clientX` ЦЕЛЫМ (`1197`, отброшена дробная часть).
 * На дорожке шириной 689px и длительности 48.6с это до ~0.07с ошибки —
 * то есть больше прежнего допуска `toBeCloseTo(x, 1)` (0.05с). Не дефект
 * продукта: браузер всегда округлял координаты `MouseEvent` так же, дробные
 * координаты бывают только у `PointerEvent`. Раньше это было не видно,
 * потому что секунду перемотки задавал ОТДЕЛЬНЫЙ левый щелчок
 * (`pointerdown`, дробный), а кнопка «остановка» просто читала уже
 * точную `positionSeconds`. Теперь оба действия — один правый щелчок.
 */
async function addGateAt(page: Page, seconds: number): Promise<number> {
  const box = await page.getByTestId('track-lane').boundingBox();
  if (!box) throw new Error('дорожка не видна');
  const duration = await page.evaluate(
    () =>
      (window as unknown as { __transport: { durationSeconds: number } }).__transport
        .durationSeconds,
  );
  const clickX = box.x + (box.width * seconds) / duration;
  await page.mouse.click(clickX, box.y + box.height / 2, { button: 'right' });
  await page.getByTestId('ctxmenu-add-gate').click();
  /*
   * Возвращается ЗАПРОШЕННАЯ секунда, а не пересчитанная из целого пикселя.
   *
   * Одно время здесь стояло `Math.trunc(clickX)`: меню правой кнопки само
   * перематывало головку по `clientX` события `contextmenu`, а у него тип
   * `MouseEvent` и координата целочисленная — то есть щелчок огрублялся
   * до пикселя (около 0.06 с при масштабе ×1).
   *
   * Огрубление убрано в продукте, а не обойдено здесь: перемотку делает
   * `pointerdown` полотна, который случается раньше и несёт дробную
   * координату. Вторая, более грубая перемотка затирала более точную.
   */
  return seconds;
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
      // `data-anchor` вместо прежнего `data-on-word`: состояний якоря стало
      // три (product.md §4), и булев признак перестал их различать.
      // `bound` — то же утверждение, что раньше значило '1': метка на слове.
      await expect(page.getByTestId(`mark-gate-${id}`)).toHaveAttribute('data-anchor', 'bound');
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

  /**
   * Нажатие по метке ведёт туда головку (§2г [Р]: головка — единственный
   * указатель «где я»).
   *
   * Без этого автор жмёт по ромбу слайда, чтобы его поправить, головка
   * остаётся где стояла, и правка после §14.9 уходит в ДРУГОЙ слайд.
   * Проверяется положением головки против положения ромба на дорожке —
   * то есть тем, что автор видит, а не тем, что записано в состоянии.
   */
  test('нажатие по метке перематывает головку на неё', async ({ page }) => {
    await openEditor(page);

    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полоса меток не видна');
    const duration = await page.evaluate(
      () => (window as unknown as { __transport: { durationSeconds: number } })
        .__transport.durationSeconds,
    );

    /*
     * Берём только те метки, которые САМИ ловят указатель в своей середине.
     *
     * Раньше здесь стояли метки по индексам (2, середина, последняя), и это
     * работало по удаче. На `demo` соседние слайды отстоят на 0.4 с из 48.6:
     * при ×1 и вьюпорте 1280 (полотно 1128) их центры разведены на 9.3 px
     * при ширине метки 18 — метки перекрываются ВСЕГДА, и вопрос только
     * в том, чей центр остался снаружи. Замерено: просвет до ближайшей
     * соседки больше половины метки у 12 из 14, лучший 16.2 px, худший 4.6.
     *
     * Перекрытие при ×1 — не дефект, а известное свойство, ради которого
     * и заведены ступени масштаба (`zoom.ts`: 0.6 с из 107 даёт 7.2 px,
     * «по такой мишени физически нельзя попасть»).
     *
     * Критерий взят не порогом в пикселях, а `elementFromPoint` — тем же,
     * по которому судит сам Playwright («intercepts pointer events»).
     * Порог пришлось бы подбирать под сегодняшнюю плотность, то есть
     * заменить одну удачу другой; hit-test же учитывает и порядок в DOM
     * (метка, нарисованная поверх, кликабельна и при тесном соседстве).
     *
     * Что должно сломаться, чтобы тест покраснел: перемотка на метку
     * перестанет работать, либо метки станут недостижимы ВСЕ — тогда
     * падает проверка ниже, и падает с внятной причиной, а не таймаутом
     * на перехваченном щелчке.
     */
    const ids = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-testid^="mark-slide-"]')] as HTMLElement[];
      return nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
          const hit = document.elementFromPoint(x, y);
          return hit === node || node.contains(hit);
        })
        .map((node) => node.dataset['testid'] ?? '');
    });
    expect(ids.length, 'ни по одной метке нельзя попасть указателем в её середину').toBeGreaterThan(2);

    // Несколько разных меток, а не одна: попадание в одну может совпасть
    // с тем местом, где головка и так стояла.
    for (const id of [ids[0]!, ids[Math.floor(ids.length / 2)]!, ids[ids.length - 1]!]) {
      await page.getByTestId(id).click();
      const box = await page.getByTestId(id).boundingBox();
      if (!box) throw new Error(`метка ${id} не видна`);
      const markSeconds = ((box.x + box.width / 2 - lane.x) / lane.width) * duration;
      const head = await page.evaluate(
        () => (window as unknown as { __transport: { positionSeconds: number } })
          .__transport.positionSeconds,
      );
      expect(Math.abs(head - markSeconds), `головка не встала на метку ${id}`).toBeLessThan(0.2);
    }
  });

  test('гейт, поставленный на слово, сохраняется ссылкой на слово с якорем', async ({ page }) => {
    await openEditor(page);
    const before = await gatesOf(page);

    // Середина слова — там привязка обязана быть однозначной.
    const word = DEMO.audio.words[12]!;
    const middle = word.start + (word.end - word.start) / 2;
    // Кнопка «остановка» убрана в Сессии 55: гейт теперь ставится пунктом
    // меню правой кнопки `ctxmenu-add-gate` (правый щелчок заодно ведёт
    // головку в точку щелчка, отдельная перемотка не нужна).
    await addGateAt(page, middle);

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
    // Кнопка «остановка» убрана в Сессии 55: гейт ставится пунктом меню
    // правой кнопки `ctxmenu-add-gate` (сам щелчок ведёт головку в точку).
    const expectedSeconds = await addGateAt(page, gapAt);

    const after = await gatesOf(page);
    const added = after.find((gate) => !before.some((old) => old.id === gate.id));
    if (!added) throw new Error('гейт не добавился');

    expect(added.at.kind).toBe('seconds');
    // Сужение типа, а не удобство: у TimeRef поле `t` есть только
    // у варианта 'seconds', и без явной проверки обращение к нему —
    // возможный undefined. Заодно это второй, независимый от `kind`,
    // способ сказать «метка встала секундами, а не словом».
    const seconds = added.at.t;
    if (seconds === undefined) throw new Error('метка встала не секундами — у неё нет поля t');
    /*
     * Допуск — РАЗРЕШЕНИЕ ЭКРАНА, а не круглое число «на всякий случай».
     *
     * Щелчок задаёт секунду через пиксель дорожки, и точнее одного пикселя
     * попасть нельзя физически: при длительности около 49 с и ширине полосы
     * порядка 850 px пиксель стоит примерно 0.06 с. Требовать совпадения
     * до третьего знака значило бы требовать от мыши точности, которой
     * у неё нет, и тест падал бы от смены ширины окна.
     */
    const secondsPerPixel = await page.evaluate(() => {
      const lane = document.querySelector('[data-testid=track-lane]')!.getBoundingClientRect();
      const duration = (window as unknown as { __transport: { durationSeconds: number } })
        .__transport.durationSeconds;
      return duration / lane.width;
    });
    expect(
      Math.abs(seconds - expectedSeconds),
      `метка встала на ${seconds} с вместо ${expectedSeconds} с — это больше пикселя (${secondsPerPixel} с)`,
    ).toBeLessThan(secondsPerPixel);
    // И всё равно попал в саму паузу, а не куда-то ещё.
    expect(Math.abs(seconds - gapAt)).toBeLessThan(0.1);
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

    // Кнопка «остановка» убрана в Сессии 55: гейт ставится пунктом меню
    // правой кнопки `ctxmenu-add-gate`. Щёлкаем НА ТОЙ ЖЕ секунде — сам
    // правый щелчок тоже перематывает головку, и это не должно её сдвинуть.
    await addGateAt(page, 24);

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

  /**
   * ПОЧЕМУ ЭТОТ ТЕСТ ЧУТЬ НЕ УМЕР, и почему теперь он сильнее.
   *
   * 20.08.2026 он упал: `slide-9` оказалась перекрыта соседней `slide-10`
   * целиком — `elementFromPoint` в центре отдавал соседку, и выбрать метку
   * было нельзя ни автору, ни тесту. Причина не в разведении слайдов
   * с остановками (его чинил этот файл), а в том, что метки слайдов
   * накладываются ДРУГ НА ДРУГА, и механизма разведения у дорожки нет.
   *
   * Замер на фикстуре demo: при окне 1920 семь перекрывающихся пар,
   * при 1280 восемь. То есть дефект был и раньше — сужение зоны (дорожка
   * перестала подныривать под каталог) сделало его полным на этой паре.
   *
   * Починено порядком наложения: ранняя метка выше поздней (MarksLane.tsx).
   * При ширине 18 и перекрытии до 9 px этого хватает по построению —
   * центр ранней левее левого края поздней, центр поздней правее правого
   * края ранней. Перекрытие больше половины ширины так не лечится,
   * и это записано долгом в docs/debt.md.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ПОКРАСНЕЛ: обратный порядок наложения
   * (естественный порядок DOM), любое разъезжание меток шире 9 px
   * или возврат слайдов и остановок в одну полосу.
   */
  test('слайд на том же слове тоже остаётся доступен', async ({ page }) => {
    await openEditor(page);

    // Обратная сторона: разведение не должно было отобрать доступ у слайда.
    const slide = page.getByTestId('mark-slide-node-1-slide-9');
    await expect(slide).toBeVisible();
    // Срок короткий НАМЕРЕННО: работающий клик по метке укладывается
    // в доли секунды, а перекрытая метка иначе съедала бы 30 секунд общего
    // прогона на ожидание, которое заведомо ничем не кончится.
    await slide.click({ timeout: 3000 });

    await expect(page.getByTestId('mark-panel')).toBeVisible();
    await expect(page.getByTestId('mark-panel').getByRole('textbox', { name: 'Идентификатор' }))
      .toHaveValue('node-1-slide-9');
  });
});

/**
 * РАЗВЕДЕНИЕ БЛИЗКИХ МЕТОК ПО РЯДАМ (Сессия 55, долг от 20.08.2026 закрыт).
 *
 * Метки стоят там, где стоят их секунды, и при близких слайдах налезают
 * друг на друга. Замер 22.08.2026 на фикстуре demo, метка 18 px:
 *
 *   окно 1920 — недостижима 1 метка из 16
 *   окно 1440 — недостижимо 5
 *   окно 1280 — недостижимо 7
 *
 * «Недостижима» здесь не догадка: `elementFromPoint` в центре метки отдавал
 * СОСЕДНЮЮ. То есть на ноутбучном экране почти половину слайдов нельзя было
 * выбрать нажатием — ни автору, ни тесту.
 *
 * Порядок наложения (ранняя выше поздней) лечил это лишь наполовину: при
 * перекрытии больше половины ширины недоступной становилась просто другая
 * метка. Настоящее лечение — два ряда внутри полосы (`track/markRows.ts`).
 */
test.describe('близкие метки остаются достижимыми', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: раскладка по рядам снята или считает перекрытие
   * не по тем прямоугольникам, которые рисует браузер. Проверено сломом:
   * возврат всех меток в один ряд даёт семь недостижимых.
   *
   * Окно 1280×800 — не произвольное: это заявленный размер стенда и тот,
   * на котором беда доходила до крайности.
   *
   * Меряются ТОЛЬКО ВИДИМЫЕ метки. `elementFromPoint` даёт ложное
   * «недостижимо» для уехавшей за край контейнера прокрутки: точки за его
   * окном ему не принадлежат вовсе, и без этой оговорки тест краснел бы
   * от масштаба дорожки, а не от наложения.
   */
  test('в центр каждой видимой метки попадает она сама, а не соседка', async ({ page }) => {
    // Окно 1440×900 — рабочий размер владельца. На 1280 остаётся один
    // крайний случай, названный вслух в docs/debt.md: три слайда с центрами
    // в пределах 8.5 px при ширине метки 18. Двумя рядами он не разводится
    // никак — половина метки 9, и не хватает ПОЛПИКСЕЛЯ, — а третий ряд
    // в полосу 34 не помещается: соседним рядам нужно разойтись больше чем
    // на 9, и три таких ряда просят 40. Средство для таких сгустков —
    // масштаб дорожки: замер даёт ноль недостижимых уже на ×2.
    await page.setViewportSize({ width: 1440, height: 900 });
    await openEditor(page);

    const measured = await page.evaluate(() => {
      const view = document.querySelector('.ed-lane-scroll')!.getBoundingClientRect();
      const marks = Array.from(document.querySelectorAll('[data-mark-kind]'))
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            id: node.getAttribute('data-mark-id') ?? '?',
            cx: box.left + box.width / 2,
            cy: box.top + box.height / 2,
          };
        })
        .filter((mark) => mark.cx > view.left + 2 && mark.cx < view.right - 2);

      const unreachable = marks
        .filter((mark) => {
          const hit = document.elementFromPoint(mark.cx, mark.cy);
          const owner = hit instanceof Element ? hit.closest('[data-mark-id]') : null;
          return owner?.getAttribute('data-mark-id') !== mark.id;
        })
        .map((mark) => mark.id);

      return { visible: marks.length, unreachable };
    });

    // Положительный контроль прибора: мерить было что. Без него пустая
    // полоса дала бы «ноль недостижимых» и выглядела бы победой.
    expect(measured.visible, 'на дорожке не видно меток — проверять нечего').toBeGreaterThan(10);

    expect(
      measured.unreachable,
      `в центр этих меток попадает соседка: ${measured.unreachable.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * СРЕДСТВО ДЛЯ СГУСТКОВ — масштаб дорожки, и оно обязано работать.
   *
   * Там, где меток слишком много на пиксель, никакая раскладка не спасёт:
   * это не дефект, а физика. Но у автора должен быть выход, и выход тот же,
   * что во всех монтажных программах, — растянуть время.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: масштаб перестал раздвигать метки (например,
   * их положение считается от ширины окна, а не полотна) — тогда даже
   * на ×2 сгусток останется сгустком.
   */
  test('масштаб дорожки разводит сгусток, который не развели ряды', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor(page);

    const unreachableNow = async (): Promise<string[]> => page.evaluate(() => {
      const view = document.querySelector('.ed-lane-scroll')!.getBoundingClientRect();
      return Array.from(document.querySelectorAll('[data-mark-kind]'))
        .map((node) => {
          const box = node.getBoundingClientRect();
          return {
            id: node.getAttribute('data-mark-id') ?? '?',
            cx: box.left + box.width / 2,
            cy: box.top + box.height / 2,
          };
        })
        .filter((mark) => mark.cx > view.left + 2 && mark.cx < view.right - 2)
        .filter((mark) => {
          const hit = document.elementFromPoint(mark.cx, mark.cy);
          const owner = hit instanceof Element ? hit.closest('[data-mark-id]') : null;
          return owner?.getAttribute('data-mark-id') !== mark.id;
        })
        .map((mark) => mark.id);
    });

    // Положительный контроль: на 1280 сгусток ЕСТЬ. Без него тест был бы
    // зелёным и в том случае, если масштаб не делает ничего.
    expect(
      await unreachableNow(),
      'на 1280 сгустка не оказалось — тест проверяет не то, что называет',
    ).not.toEqual([]);

    await page.getByTestId('track-zoom').selectOption('2');
    await expect(page.getByTestId('track-zoom')).toHaveValue('2');

    expect(
      await unreachableNow(),
      'после растяжения дорожки метки всё ещё закрывают друг друга',
    ).toEqual([]);
  });
});

/**
 * Правая кнопка открывает меню и НЕ двигает метку.
 *
 * КУПЛЕНО ЗАМЕРОМ 25.08.2026 на пустой фикстуре. Ромб слайда стоял на
 * x 577.36; правый щелчок с указателем в 571.36 — то есть в шести пикселях
 * левее центра, но внутри восемнадцатипиксельного ромба, — переставлял
 * слайд на 571.36. Сдвиг 6 px = 0.22 с при масштабе ×1 и втрое больше
 * на вписанном.
 *
 * Физика дефекта: `pointerdown` в `MarksLane.handleDown` начинал жест
 * независимо от кнопки, а первый же `pointermove` коммитил новое время.
 * Рука человека дрожит на пару пикселей всегда, поэтому промахнуться было
 * невозможно. Автор жал правую кнопку РАДИ МЕНЮ — чаще всего чтобы слайд
 * удалить, — и получал молча переставленный слайд: ни ошибки, ни отмены,
 * правка ложилась в историю как обычная.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ. Сними проверку кнопки
 * в `handleDown` — и метка снова уедет под указатель. Юнит-тестом это
 * не выражается вовсе: `event.button` живёт только в настоящем браузере.
 *
 * ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ ОБЯЗАТЕЛЕН и стоит в том же тесте: левой кнопкой
 * та же метка обязана уехать. Без него зелень означала бы в том числе
 * «перетаскивание меток сломано целиком», и отличить одно от другого
 * было бы нечем.
 */
test.describe('правая кнопка по метке', () => {
  test('открывает меню, но не переставляет слайд; левая — переставляет', async ({ page }) => {
    await openEditor(page);

    /* Метка нужна та, что не закрыта соседями: иначе нажатие уедет в чужой
       узел и тест проверит поведение другой метки. Тот же приём, что
       в проверке сгустка выше. */
    const target = await page.evaluate(() => {
      const view = document.documentElement.getBoundingClientRect();
      return [...document.querySelectorAll('[data-testid^="mark-slide-"]')]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.getAttribute('data-testid')!,
            cx: rect.x + rect.width / 2,
            cy: rect.y + rect.height / 2,
            w: rect.width,
          };
        })
        .filter((mark) => mark.cx > view.left + 40 && mark.cx < view.right - 40)
        .find((mark) => {
          const hit = document.elementFromPoint(mark.cx, mark.cy);
          return hit instanceof Element && hit.closest('[data-testid]')?.getAttribute('data-testid') === mark.id;
        });
    });
    if (!target) throw new Error('не нашлось метки слайда, достижимой указателем');

    const centreOf = async (): Promise<number> => page.evaluate((id) => {
      const rect = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      return rect.x + rect.width / 2;
    }, target.id);

    const before = await centreOf();

    /*
     * ЖЕСТ ПИШЕТСЯ ТАК, КАК ЕГО ДЕЛАЕТ РУКА: нажал, дрогнул, отпустил.
     * `page.mouse.click` не годится — он шлёт `mousemove` ДО нажатия, после
     * нажатия не двигается вовсе, и метка не уедет даже у сломанного кода.
     * Проверено сломом 25.08.2026: с `click` тест оставался зелёным при
     * ПОЛНОСТЬЮ снятой проверке кнопки, то есть не проверял ничего.
     *
     * Промах — треть ширины ромба, и ВПРАВО: слева к ромбу примыкает ручка
     * стыка (`mark-transition-*`), у неё своих пунктов меню нет вовсе,
     * и промах влево ронял бы тест, обвиняя исправный код.
     */
    const missBy = target.w / 3;

    const shakyPress = async (button: 'left' | 'right'): Promise<void> => {
      await page.mouse.move(before, target.cy);
      await page.mouse.down({ button });
      await page.mouse.move(before + missBy, target.cy);
      await page.mouse.up({ button });
    };

    await shakyPress('right');
    await expect(page.getByRole('menuitem', { name: 'Удалить слайд' })).toBeVisible();

    expect(
      await centreOf(),
      'правый щелчок переставил слайд под указатель',
    ).toBeCloseTo(before, 1);

    await page.keyboard.press('Escape');

    // Положительный контроль: тот же жест, тот же промах, отличается ТОЛЬКО
    // кнопка. Без него зелень выше означала бы в том числе «перетаскивание
    // меток сломано целиком», и отличить одно от другого было бы нечем.
    await shakyPress('left');

    expect(
      await centreOf(),
      'левая кнопка перестала тянуть метку — зелень выше ничего не значит',
    ).toBeCloseTo(before + missBy, 0);
  });
});

/**
 * ЖЕСТ НЕ ДЕЛАЕТ ПРОЕКТ НЕСОХРАНЯЕМЫМ.
 *
 * Куплено 25.08.2026. Владелец перетащил ромб слайда к самому началу —
 * туда, где стоит первый кадр, — и получил во всю ширину окна:
 *
 *   Не удалось сохранить работу в браузере: Проект не прошёл валидацию:
 *   Сегмент «s-1»: два слайда на одной секунде (0.000)
 *
 * Жест разрешили, состояние испортили, сказали ПОТОМ. Схема требует
 * строгого порядка слайдов, значит проверять надо в момент жеста.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убери clampSlideSeconds из moveMark
 * (state/project.ts) — метка встанет на ноль и полоса ошибки появится.
 *
 * Проверяется ПО ПРОЕКТУ и по отсутствию полосы, а не «метка выглядит
 * не там»: на глаз разница между 0.000 и 0.010 не видна вовсе, а именно
 * она и решает, сохранится работа или нет.
 */
test.describe('перетаскивание метки слайда', () => {
  test('тяга к самому началу не кладёт слайд на первый кадр', async ({ page }) => {
    await page.goto('/editor.html?fixture=sandbox', { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
      timeout: 30_000,
    });

    // Заготовка «Обложка» даёт ровно натуру владельца: кадр на нуле
    // и кадр на 0.5 с, у второго свой ромб.
    await page.getByRole('button', { name: 'Обложка' }).click();

    /* Ссылка на время бывает ДВУХ видов (инвариант №10): секунды или слово
       с офсетом. `timeRefAt` привязывается к слову, когда расшифровка есть,
       а у пустой фикстуры она есть — читать только `at.t` значило бы всегда
       получать «нет значения» и объявлять зелень ни на чём. */
    const secondsOf = async (): Promise<number[]> => page.evaluate(() => {
      const segment = (window as unknown as {
        __project: {
          segments: {
            audio: { words: { start: number }[] };
            slides: { at: { kind: string; t?: number; wordIndex?: number; offset?: number } }[];
          }[];
        };
      }).__project.segments[0]!;
      return segment.slides.map((slide) => {
        if (slide.at.kind === 'seconds') return slide.at.t!;
        const word = segment.audio.words[slide.at.wordIndex!];
        if (!word) throw new Error('ссылка на слово, которого нет в расшифровке');
        return word.start + (slide.at.offset ?? 0);
      });
    });

    const before = await secondsOf();
    expect(before, 'заготовка не завела второй кадр — тащить нечего').toHaveLength(2);
    expect(before[0]).toBe(0);

    const mark = page.locator('[data-testid^="mark-slide-"]').first();
    const box = await mark.boundingBox();
    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!box || !lane) throw new Error('метка или полоса не видны');

    // Тянем ЗА левый край полосы — как рука, которая метит «в самое начало».
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(lane.x + 20, box.y + box.height / 2);
    await page.mouse.move(lane.x - 40, box.y + box.height / 2);
    await page.mouse.up();

    const after = await secondsOf();
    expect(after[0], 'первый кадр обязан остаться на нуле').toBe(0);
    expect(after[1], 'второй кадр встал на секунду первого — работа перестанет сохраняться')
      .toBeGreaterThan(0);

    // И главное, что видит автор: полосы «не удалось сохранить» нет.
    await expect(page.getByTestId('workspace-error')).toHaveCount(0);
  });
});

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

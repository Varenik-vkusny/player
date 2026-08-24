/**
 * Буфер обмена слайдов (ADR-025): «слайд переносит состояние, а не момент».
 * Четыре кнопки ленты (`track/SlideStrip.tsx`) убраны в Сессии 55: теперь
 * это пункты меню правой кнопки ПО МЕТКЕ СЛАЙДА (`TrackView.tsx`) —
 * `ctxmenu-slide-duplicate` / `-slide-copy` / `-slide-cut` / `-slide-paste`.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА — проверять СЦЕНУ, а не проект. В прошлой
 * сессии убранный со слайда элемент оставался на холсте: `states` в проекте
 * уже не содержали его, а зритель видел прежнюю картинку. Проверка «в
 * проекте поменялись states» была бы зелёной на сломанном продукте —
 * поймал дефект только тест, смотревший на `.ed-stage-host [data-id]`.
 * Поэтому чтение `window.__project` здесь встречается только как
 * вспомогательное (посчитать элементы части), а несущее утверждение каждого
 * теста — состав видимых `data-id` и видимый текст на сцене.
 *
 * ГДЕ ЖИВУТ ЭТИ ДЕЙСТВИЯ ПОСЛЕ СЕССИИ 55, и почему именно так.
 *
 * Меню правой кнопки делится по тому, НА ЧТО действие действует:
 *
 *   по метке слайда  — «Копировать» и «Вырезать»: они метят в ОБЪЕКТ
 *                      (`state.currentSlideId`);
 *   по пустому месту — «Вставить сюда» и «Дублировать сюда»: они метят
 *                      в МЕСТО (секунду под головкой, `headTimeRef`),
 *                      плюс те же «Копировать»/«Вырезать» для слайда,
 *                      накрывающего эту секунду.
 *
 * Деление куплено дефектом, найденным первым же прогоном после переноса.
 * Сложенные в одно меню метки, вставка и дублирование гасли ВСЕГДА:
 * правый щелчок по метке ведёт головку точно на неё, значит место под
 * головкой заведомо занято ею же. Замер: позиция после щелчка
 * `0.7999999999999999`, оба пункта `aria-disabled="true"` с подсказкой
 * «На 0.80 с уже стоит слайд» — то есть вставить было нельзя никогда
 * и ничем.
 *
 * Второе следствие того же деления: «Копировать» есть и в меню места.
 * Это не дубль, а единственный доступ к ПЕРВОМУ слайду главы — он стоит
 * на нуле и ромба на дорожке не имеет (решение продукта, см. marks.spec.ts),
 * так что щёлкать по нему было бы не по чему.
 */
import { expect, test, type Page } from '@playwright/test';
import { openChapters } from './panels.js';

async function waitTransportReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  // Все действия здесь читают геометрию дорожки (freeSlideSpotSeconds,
  // seekTrack) — без готовой длительности транспорта её не посчитать.
  await waitTransportReady(page);

  // Лента слайдов свёрнута по умолчанию (Сессия 41, решение владельца
  // 15.08.2026 по замеру: лента отнимала у сцены 98 px). Этот файл проверяет
  // КАРТОЧКИ ленты, поэтому раскрывает её явно, а не полагается на то, каким
  // редактор открылся. Проверка видимости здесь несущая, а не вежливость:
  // без неё `stripCards().count()` вернул бы честный ноль, и тесты про
  // «стало на одну карточку больше» падали бы, называя причиной буфер обмена.
  await page.getByTestId('slide-strip-toggle').click();
  await expect(page.getByTestId('slide-strip')).toBeVisible();
}

/**
 * Открывает меню правой кнопки на ЗАДАННОЙ секунде дорожки.
 *
 * Правый щелчок по пустому месту сам ведёт туда головку (Сессия 55,
 * `TrackView.handleTrackContextMenu`), а головка ведёт текущий слайд
 * (`Editor.tsx`, эффект `headSlideRef`). Поэтому одного жеста хватает
 * и чтобы выбрать место, и чтобы открыть его меню.
 *
 * Целится в полосу расшифровки, а не в волну: обе перематывают одинаково,
 * но на волне лежит канвас, а на метках — кнопки, и промах по ним дал бы
 * меню другого предмета.
 */
async function openTrackMenuAt(page: Page, seconds: number): Promise<void> {
  const box = await page.getByTestId('track-words').boundingBox();
  if (!box) throw new Error('полоса расшифровки не видна');
  const duration = await page.evaluate(
    () =>
      (window as unknown as { __transport: { durationSeconds: number } }).__transport
        .durationSeconds,
  );
  await page.mouse.click(box.x + (box.width * seconds) / duration, box.y + box.height / 2, {
    button: 'right',
  });
  await expect(page.getByTestId('context-menu')).toBeVisible();
}

/**
 * Секунда, геометрически свободная от существующих МЕТОК СЛАЙДОВ.
 *
 * Не гейтов: `pasteProblem` (state/slides.ts) сверяется только с
 * `segment.slides` — гейт на пути вставке не мешает. Ищет по видимым ромбам
 * дорожки (`mark-slide-*`), а не по секундам, вычитанным из фикстуры:
 * числа в комментариях гниют (CLAUDE.md), а дорожка не может соврать о том,
 * где стоят её собственные метки. Первый слайд меткой не считается (см.
 * e2e/marks.spec.ts) и в `mark-slide-*` не попадает — граница 0 добавлена
 * явно.
 */
async function freeSlideSpotSeconds(page: Page): Promise<number> {
  const lane = await page.getByTestId('marks-lane').boundingBox();
  if (!lane) throw new Error('полоса меток не видна');
  const duration = await page.evaluate(
    () => (window as unknown as { __transport: { durationSeconds: number } }).__transport.durationSeconds,
  );
  const centres = await page.locator('[data-testid^="mark-slide-"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    }),
  );
  const marks = centres
    .map((x) => ((x - lane.x) / lane.width) * duration)
    .sort((a, b) => a - b);
  const points = [0, ...marks, duration];

  let gapStart = 0;
  let gapSize = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i]! - points[i - 1]!;
    if (gap > gapSize) {
      gapSize = gap;
      gapStart = points[i - 1]!;
    }
  }
  expect(gapSize, 'на дорожке не нашлось свободного промежутка — тест не про то').toBeGreaterThan(0.5);
  return gapStart + gapSize / 2;
}

/** Состав видимой сцены — набор `data-id`, отсортированный для сравнения. */
async function stageIds(page: Page): Promise<string[]> {
  return page.locator('.ed-stage-host [data-id]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-id') ?? '').sort(),
  );
}

function stripCards(page: Page) {
  return page.locator('[data-testid^="strip-card-"]');
}

/**
 * Открывает меню правой кнопки над меткой слайда — единственный вход
 * в «Дублировать»/«Копировать»/«Вырезать»/«Вставить» слайд (Сессия 55,
 * `TrackView.tsx` `menuItems`, ветка `kind === 'slide'`).
 *
 * Помощник оставлен с явным выбором метки ЛЕВЫМ щелчком перед правым.
 * Причина историческая и уже устранённая в продукте: `ContextMenu`
 * закрывался по ЛЮБОМУ событию `scroll` в фазе перехвата, включая плавную
 * прокрутку ленты слайдов, которую запускает смена текущего слайда, — и
 * меню, открытое на дорожке, закрывалось само. Теперь меню закрывается
 * только от прокрутки, которая двигает точку его привязки. Порядок жестов
 * здесь всё равно полезен: он делает шаг «слайд выбран» отдельным
 * и проверяемым, а не спрятанным внутри открытия меню.
 */
async function openSlideMarkMenu(page: Page, mark: ReturnType<Page['locator']>): Promise<void> {
  await mark.click();
  const strip = page.getByTestId('slide-strip');
  if (await strip.count()) {
    await page.evaluate(() => {
      delete (window as unknown as { __stripScrollProbe?: number }).__stripScrollProbe;
    });
    await page.waitForFunction((el) => {
      const w = window as unknown as { __stripScrollProbe?: number };
      const left = (el as HTMLElement).scrollLeft;
      if (w.__stripScrollProbe === left) return true;
      w.__stripScrollProbe = left;
      return false;
    }, await strip.elementHandle(), { timeout: 5_000, polling: 100 });
  }
  await mark.click({ button: 'right' });
  await expect(page.getByTestId('context-menu')).toBeVisible();
}

test.describe('буфер обмена слайдов', () => {
  test('копия внутри части видна на сцене тем же составом элементов', async ({ page }) => {
    await openEditor(page, 'demo');

    // Метка слайда — единственный вход в «Копировать» (задание, раздел
    // «куда что переехало»). Правый щелчок по ней заодно ведёт туда головку.
    const sourceMark = page.locator('[data-testid^="mark-slide-"]').first();
    await openSlideMarkMenu(page, sourceMark);

    const originIds = await stageIds(page);
    expect(originIds.length, 'на исходном слайде нет элементов — сравнивать нечего').toBeGreaterThan(0);
    const cardsBefore = await stripCards(page).count();

    await page.getByTestId('ctxmenu-slide-copy').click();

    // Вставка метит в МЕСТО, а не в объект, поэтому её меню открывается
    // на свободной секунде, а не на метке. Секунда посчитана геометрически
    // по видимым ромбам, а не взята из фикстуры: числа в комментариях гниют,
    // а дорожка не может соврать о том, где стоят её собственные метки.
    const freeAt = await freeSlideSpotSeconds(page);
    await openTrackMenuAt(page, freeAt);
    await expect(
      page.getByTestId('ctxmenu-slide-paste'),
      'на свободной секунде «Вставить слайд здесь» обязана быть доступна',
    ).toBeEnabled();

    await page.getByTestId('ctxmenu-slide-paste').click();

    await expect(stripCards(page), 'слайдов в ленте обязано стать на один больше').toHaveCount(cardsBefore + 1);
    // Несущее утверждение: сцена вставленного слайда несёт РОВНО тот же
    // набор элементов, что и исходный, — не просто «слайд появился».
    expect(await stageIds(page)).toEqual(originIds);
  });

  /**
   * Главный тест задания. Проверяет ADR-025 «слайд переносит состояние,
   * а не момент»: элемент из чужой части обязан физически появиться на
   * сцене целевой части, а не только в её `states`.
   */
  test('вставка между частями: элемент из чужой части приезжает и виден на сцене', async ({ page }) => {
    await openEditor(page, 'repeat');

    // s-a — часть входа (project.entry). Её единственный слайд несёт
    // bg-a/label-a («Кусок A»). У s-a всего один слайд — он же первый,
    // а первый слайд меткой на дорожке не считается (marks.spec.ts).
    // Копировать нечего щёлкнуть — используем то, что видно на сцене,
    // просто чтобы удостовериться в исходном составе перед переключением.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
    await expect(page.locator('.ed-stage-host')).toContainText('Кусок A');
    // ПЕРВЫЙ СЛАЙД ГЛАВЫ РОМБА НА ДОРОЖКЕ НЕ ИМЕЕТ — это решение продукта,
    // а не недосмотр (см. marks.spec.ts). Значит копирование НЕЛЬЗЯ вешать
    // только на метку: у главы с единственным первым слайдом меток ноль,
    // и щёлкнуть было бы не по чему.
    //
    // Проверка этого прямо здесь, положительным контролем: меток правда нет.
    // Дальше слайд копируется через меню ЛЮБОГО места дорожки — правый
    // щелчок ведёт головку, головка ведёт текущий слайд, а текущим здесь
    // может быть только этот единственный.
    await expect(
      page.locator('[data-testid^="mark-slide-"]'),
      'у части с единственным первым слайдом не должно быть меток — иначе тест проверяет не тот случай',
    ).toHaveCount(0);

    await openTrackMenuAt(page, 0.5);
    await expect(
      page.getByTestId('ctxmenu-slide-copy'),
      'единственный слайд главы обязан копироваться, хотя ромба у него нет',
    ).toBeEnabled();
    await page.getByTestId('ctxmenu-slide-copy').click();

    await openChapters(page);
    await page.getByTestId('segment-s-b').click();
    // Дверь глав переключила нижнюю зону на «Ветки» — контекстное меню
    // дорожки (openTrackMenuAt ниже) живёт в виде «Дорожки», возвращаемся.
    await page.getByTestId('view-tracks').click();
    await waitTransportReady(page); // новый сегмент — новый источник звука, транспорт пересоздаётся

    // Родная сцена s-b: bg-b/label-b, «Кусок B» — до вставки её элементы не тронуты.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
    await expect(page.locator('.ed-stage-host')).toContainText('Кусок B');

    const elementsBefore = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { id: string; elements: unknown[] }[] } }).__project
          .segments.find((seg) => seg.id === 's-b')!.elements.length,
    );
    expect(elementsBefore, 's-b обязана начать с двух элементов — иначе тест не про то').toBe(2);

    // Свободное место: у s-b всего один слайд (на нуле), поэтому подойдёт
    // почти любая секунда внутри длительности — посчитанная геометрически,
    // а не подобранная на глаз.
    const freeAt = await freeSlideSpotSeconds(page);
    await openTrackMenuAt(page, freeAt);
    await expect(page.getByTestId('ctxmenu-slide-paste')).toBeEnabled();

    await page.getByTestId('ctxmenu-slide-paste').click();

    // Несущее утверждение: элемент ФИЗИЧЕСКИ нарисован на сцене, а не
    // только записан в states. Именно эту разницу прошлая сессия поймала
    // дефектом: данные меняются, холст — нет.
    await expect(page.locator('.ed-stage-host'), 'текст «Кусок A» обязан быть виден на сцене s-b')
      .toContainText('Кусок A');

    const ids = await stageIds(page);
    expect(
      ids,
      'на вставленном слайде обязано быть ровно bg-a и label-a — родные bg-b/label-b '
        + 'отсутствуют, потому что состояний у них на этом слайде нет (ADR-015)',
    ).toEqual(['bg-a', 'label-a']);

    const elementsAfter = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { id: string; elements: unknown[] }[] } }).__project
          .segments.find((seg) => seg.id === 's-b')!.elements.length,
    );
    expect(elementsAfter, 'у части s-b в проекте обязано стать четыре элемента').toBe(4);
  });

  test('отказ вставки на занятую секунду объяснён видимым текстом, а не только погашенной кнопкой', async ({
    page,
  }) => {
    await openEditor(page, 'demo');

    // Буфер непустой — чтобы причина отказа была ровно про место, а не
    // смешивалась с «Буфер пуст». Копируем первую метку слайда.
    const copySource = page.locator('[data-testid^="mark-slide-"]').first();
    await openSlideMarkMenu(page, copySource);
    await page.getByTestId('ctxmenu-slide-copy').click();

    /*
     * Занятая секунда: целимся по горизонтали в чужую метку, а по вертикали —
     * в полосу расшифровки. Так открывается меню МЕСТА (где живёт «Вставить
     * слайд здесь»), но само место заведомо занято слайдом этой метки.
     *
     * Прямо по метке щёлкать нельзя: там откроется меню ОБЪЕКТА, в котором
     * вставки нет вовсе, — и тест проверял бы отсутствие пункта вместо
     * его причины.
     */
    const otherMark = page.locator('[data-testid^="mark-slide-"]').nth(1);
    const markBox = await otherMark.boundingBox();
    const wordsBox = await page.getByTestId('track-words').boundingBox();
    if (!markBox || !wordsBox) throw new Error('метка или полоса расшифровки не видны');
    await page.mouse.click(
      markBox.x + markBox.width / 2,
      wordsBox.y + wordsBox.height / 2,
      { button: 'right' },
    );
    await expect(page.getByTestId('context-menu')).toBeVisible();

    const paste = page.getByTestId('ctxmenu-slide-paste');
    await expect(paste).toHaveAttribute('aria-disabled', 'true');
    const note = page.getByTestId('ctxmenu-why-slide-paste');
    await expect(note).toBeVisible();
    await expect(note).toContainText('уже стоит слайд');
  });

  /**
   * РЕГРЕССИЯ (найдена и починена в прошлой сессии): «Дублировать» одно
   * время была связана с тем же сигналом, что «Вставить», и гасла при
   * пустом буфере с причиной «Буфер пуст» — то есть автор не мог размножить
   * кадр, пока чего-нибудь не скопирует. `duplicateSlideAt` буфер автора не
   * читает вовсе (работает через свой временный `SlideClipboard`), логика
   * редьюсера была исправна — юнит-тест такой связки не поймал бы.
   *
   * Красный этот тест будет ровно тогда, когда «Дублировать» снова свяжут
   * с состоянием буфера.
   */
  test('«Дублировать» доступна при пустом буфере', async ({ page }) => {
    await openEditor(page, 'demo');
    // Буфер пуст с самого начала страницы: ничего не копировали и не вырезали.

    const freeAt = await freeSlideSpotSeconds(page);
    await openTrackMenuAt(page, freeAt);

    await expect(
      page.getByTestId('ctxmenu-slide-duplicate'),
      'дублирование не читает буфер автора — обязано быть доступно и при пустом буфере',
    ).toBeEnabled();
    await expect(page.getByTestId('ctxmenu-slide-paste')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('ctxmenu-why-slide-paste')).toContainText('Буфер пуст');

    const idsBefore = await stageIds(page);
    const cardsBefore = await stripCards(page).count();

    await page.getByTestId('ctxmenu-slide-duplicate').click();

    await expect(stripCards(page)).toHaveCount(cardsBefore + 1);
    // Дубль — точная копия того, что было на сцене до нажатия.
    expect(await stageIds(page)).toEqual(idsBefore);
  });

  test('вырезание слайда — один шаг истории; отмена возвращает его слайдом и на сцену', async ({ page }) => {
    await openEditor(page, 'demo');

    const cards = stripCards(page);
    const cardsBefore = await cards.count();
    expect(cardsBefore, 'нужно хотя бы два слайда, чтобы вырезать не первый').toBeGreaterThan(1);

    // Второй слайд ленты: не первый и не единственный — cutProblem пуст.
    const target = cards.nth(1);
    const targetTestId = await target.getAttribute('data-testid');
    if (!targetTestId) throw new Error('у карточки слайда нет data-testid');
    // «Вырезать» не читает секунду головки (в отличие от «Вставить»
    // и «Дублировать»): она нацелена на `state.currentSlideId`, поэтому
    // клик по карточке ленты годится сам по себе.
    await target.click();
    // Метка ЭТОГО ЖЕ слайда: id карточки и id метки — один и тот же id слайда.
    const slideId = targetTestId.slice('strip-card-'.length);
    const mark = page.getByTestId(`mark-slide-${slideId}`);

    const targetIds = await stageIds(page);
    expect(targetIds.length, 'у вырезаемого слайда нет элементов — сравнивать нечего').toBeGreaterThan(0);

    await openSlideMarkMenu(page, mark);
    await expect(page.getByTestId('ctxmenu-slide-cut')).toBeEnabled();
    await page.getByTestId('ctxmenu-slide-cut').click();

    await expect(cards, 'слайдов в ленте обязано стать на один меньше').toHaveCount(cardsBefore - 1);

    // Одно нажатие «Отменить» — вырезание обязано быть ОДНИМ шагом истории
    // (буфер и удаление внутри cutSlide — один вызов редьюсера).
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();

    await expect(cards, 'слайд обязан вернуться в ленту').toHaveCount(cardsBefore);

    // Слайд вернулся — выбираем его снова и смотрим на СЦЕНУ, не на проект.
    await page.getByTestId(targetTestId).click();
    expect(await stageIds(page), 'на сцене обязано быть видно содержимое вернувшегося слайда')
      .toEqual(targetIds);
  });
});

/**
 * Срез 1: панель вставки, список элементов, удаление.
 *
 * Ключевой тест здесь — «невидимый элемент выделяется через список»: список
 * существует ровно ради него (docs/superpowers/specs/2026-07-28-editor-
 * authoring-design.md, раздел «Список элементов»). Клик по сцене физически
 * не может выделить элемент, чья анимация появления ещё не отыграла —
 * StageView.isVisible фильтрует попадание по прозрачности отрисованного
 * узла (порог 0.01). Список читает scene.elements напрямую и фильтра не имеет.
 *
 * Каждый тест нажимает по видимой кнопке или строке списка, а не дёргает
 * состояние в обход интерфейса: проверка «вызвался ли колбэк» была бы
 * зелёной при любом дефекте раскладки или порядка сортировки.
 */
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { SCHEMA_VERSION } from '@player/core';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function waitTransportReady(page: Page): Promise<void> {
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

async function elementIdsOf(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __project: { segments: { elements: { id: string }[] }[] } })
        .__project.segments[0]!.elements.map((element) => element.id),
  );
}

test.describe('панель вставки', () => {
  test('кнопка «Текст» создаёт элемент на пустой сцене — он на сцене и сразу выделен', async ({
    page,
  }) => {
    await openEditor(page, 'empty');
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

    // Каталог переехал на рельс (Сессия 30): заготовка видна, только когда
    // открыта её категория. Клик по рельсу — часть жеста автора, а не обход.
    await page.getByTestId('rail-text').click();
    await page.getByTestId('insert-text').click();

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(1);
    // Выделено сразу — редьюсер это делает (addElement), интерфейс обязан показать.
    await expect(page.getByTestId('selection-frame')).toBeVisible();
    const ids = await elementIdsOf(page);
    expect(ids).toEqual(['text-1']);
    await expect(page.getByTestId('selection-readout')).toContainText('text-1');
  });

  test('кнопки «Фигура» и «Картинка» создают элементы соответствующего вида', async ({ page }) => {
    await openEditor(page, 'empty');

    await page.getByTestId('rail-shapes').click();
    await page.getByTestId('insert-shape').click();
    await page.getByTestId('rail-own').click();
    await page.getByTestId('insert-image').click();

    const types = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { elements: { type: string }[] }[] } })
          .__project.segments[0]!.elements.map((element) => element.type),
    );
    expect(types).toEqual(['shape', 'image']);
    // Оба элемента реально нарисованы плеерным рендером — не только в проекте.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
  });

  test('кнопка «Круг» кладёт на холст видимую фигуру со скруглением 50%', async ({ page }) => {
    await openEditor(page, 'empty');
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);

    await page.getByTestId('rail-shapes').click();
    await page.getByTestId('insert-circle').click();

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(1);
    const borderRadius = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ed-stage-host [data-id]')!).borderRadius,
    );
    // Браузер обязан ПОНЯТЬ значение (50%), а не просто хранить строку
    // в данных — это и отличает «фигура рисуется» от «фигура лежит в JSON».
    expect(borderRadius).toBe('50%');
  });

  test('кнопка «Стрелка» кладёт фигуру с непустым clip-path — браузер понял многоугольник', async ({
    page,
  }) => {
    await openEditor(page, 'empty');

    await page.getByTestId('rail-shapes').click();
    await page.getByTestId('insert-arrow').click();

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(1);
    const clipPath = await page.evaluate(
      () => getComputedStyle(document.querySelector('.ed-stage-host [data-id]')!).clipPath,
    );
    expect(clipPath).not.toBe('none');
    expect(clipPath.length).toBeGreaterThan(0);
  });
});

test.describe('список элементов', () => {
  test('элемент, невидимый на текущей секунде, выделяется через список', async ({ page }) => {
    // Схема v3 разводит «звучит дорожка» (transport, seekTrack) и «какой
    // слайд сейчас на сцене» (`state.currentSlideId`) — перемотка дорожки
    // саму сцену не трогает (StageView строит превью ровно одного
    // `currentSlide`, `packages/editor/src/track/TrackView.tsx` вызывает
    // только `transport.seek`). Сцена и так открывается на первом слайде
    // сегмента, а на нём dot ещё не проявился: его кью «opacity 0→1»
    // миграция превращает в `visible: false` (`packages/core/src/
    // migrations.ts`, applyProperty) — семь появляющихся элементов demo.json
    // на нулевом слайде уже невидимы, включая dot. Отдельной перемотки
    // не требуется.
    await openEditor(page, 'demo');

    // «Невидим» — это `visibility`, а не `opacity`: мигрированное состояние
    // хранит `opacity: 1` и прячет элемент только `visibility: hidden`.
    const dotVisibility = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="dot"]')!).visibility,
    );
    expect(dotVisibility, 'точка обязана быть невидимой — иначе тест не про то').toBe('hidden');

    // Клика по сцене здесь нет намеренно: клик там, где стоит dot, выделил бы
    // то, что нарисовано поверх него, а не сам dot (StageView.isVisible).
    await page.getByTestId('element-row-dot').click();

    await expect(page.getByTestId('selection-readout')).toContainText('dot');
    await expect(page.getByTestId('selection-frame')).toBeVisible();
  });

  test('список показывает все элементы сцены, сверху — с наибольшим zIndex', async ({ page }) => {
    await openEditor(page, 'demo');
    // demo.json: 7 элементов. title/lead/footer — zIndex 3, dot/accent — 2, card — 1, bg — 0.
    const rows = page.locator('.ed-elements-list [data-testid^="element-row-"]');
    await expect(rows).toHaveCount(7);

    const order = await rows.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-testid')),
    );
    const indexOf = (id: string): number => order.indexOf(`element-row-${id}`);

    expect(indexOf('title')).toBeLessThan(indexOf('card'));
    expect(indexOf('card')).toBeLessThan(indexOf('bg'));
  });

  test('клик по строке списка выделяет элемент и на сцене видна рамка', async ({ page }) => {
    await openEditor(page, 'demo');
    await page.getByTestId('element-row-card').click();
    await expect(page.getByTestId('selection-readout')).toContainText('card');
    await expect(page.getByTestId('selection-frame')).toBeVisible();
  });
});

test.describe('удаление', () => {
  test('кнопка удаления недоступна, пока ничего не выделено', async ({ page }) => {
    await openEditor(page, 'demo');
    // Область `.ed-delete-row` — кнопка удаления ЭЛЕМЕНТА (Editor.tsx), а не
    // одна из кнопок удаления СЛАЙДА панели `SlidePanel` (`data-testid=
    // "slide-remove-*"`), которых теперь по одной на каждый слайд и у
    // которых тот же текст «Удалить». Без скоупа локатор ловил бы все сразу.
    await expect(page.locator('.ed-delete-row').getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();
  });

  test('удаление элемента с анимациями сообщает о каскаде и оставляет проект, который грузится', async ({
    page,
  }) => {
    await openEditor(page, 'demo');
    // dot — цель двух анимаций в demo.json: c-dot и c-dot-move.
    await page.getByTestId('element-row-dot').click();
    await expect(page.getByTestId('selection-readout')).toContainText('dot');

    await page.locator('.ed-delete-row').getByRole('button', { name: 'Удалить', exact: true }).click();

    // Каскад считается в слайдах, а не в кью: кью в схеме v3 нет (ADR-015),
    // а удаление снимает состояние элемента с каждого слайда, где оно было.
    await expect(page.getByTestId('removal-message')).toContainText('dot');
    await expect(page.getByTestId('removal-message')).toContainText('слайд');
    await expect(page.locator('[data-id="dot"]')).toHaveCount(0);
    await expect(page.getByTestId('selection-readout')).toContainText('ничего не выделено');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Сохранить' }).click(),
    ]).then(([event]) => event);
    const file = await download.path();
    if (!file) throw new Error('файл не сохранился');
    // serializeProject прогоняет текст через loadProject перед выдачей файла
    // (state/save.ts) — если бы каскад не снял осиротевшие состояния слайдов,
    // схема отвергла бы ссылку на несуществующий элемент, и скачивание
    // упало бы раньше, чем этот тест дошёл до чтения файла.
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      schemaVersion: number;
      segments: { elements: { id: string }[]; slides: { states: Record<string, unknown> }[] }[];
    };
    // Текущая версия сборки, а не зашитое число (см. roundtrip.spec.ts).
    expect(saved.schemaVersion).toBe(SCHEMA_VERSION);
    expect(saved.segments[0]!.elements.some((element) => element.id === 'dot')).toBe(false);
    // Кью в v3 нет (ADR-015): каскад снимает состояние элемента с каждого
    // слайда, где оно было, а не запись со своим id.
    expect(saved.segments[0]!.slides.some((slide) => 'dot' in slide.states)).toBe(false);
  });
});

test.describe('создание элемента и позиция сцены', () => {
  test('создание элемента не отматывает сцену в начало', async ({ page }) => {
    // Тот же дефект, что чинился для меток (e2e/marks.spec.ts): создание —
    // структурная правка, StageView пересобирает сцену, а свежий ScenePreview
    // стоит на нуле. Без явного seek(positionRef.current) внутри эффекта
    // сборки заголовок молча исчез бы после нажатия кнопки вставки.
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24);

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(before), 'на 24-й секунде заголовок обязан быть виден').toBeGreaterThan(0.9);

    await page.getByTestId('rail-shapes').click();
    await page.getByTestId('insert-shape').click();

    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(
      Number(after),
      'сцена отмоталась в начало после создания элемента',
    ).toBeGreaterThan(0.9);
  });
});

/** Тащит узел за центр. Несколько шагов: жест, а не один прыжок. */
async function dragElement(page: Page, id: string, dx: number, dy: number): Promise<void> {
  // Селектор уточнён до сцены «правлю»: в редакторе ДВЕ сцены, и `data-id`
  // встречается в документе дважды (Сессия 11).
  const box = await page.locator(`.ed-stage-host [data-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`нет узла ${id} на сцене правки`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

/**
 * Слайды текущей части со СЛЕПКОМ состояний целиком.
 *
 * Целиком, а не по одному элементу: перетаскивание за точку сцены хватает
 * то, что в этой точке ЛЕЖИТ СВЕРХУ, и это не обязательно тот элемент,
 * чей бокс мы мерили. Проверка по одному имени была бы зелёной и тогда,
 * когда правка ушла в чужой слайд.
 */
async function slidesOf(page: Page): Promise<
  { id: string; at: { kind: string; t?: number }; states: string }[]
> {
  return page.evaluate(() => {
    const project = (window as unknown as {
      __project: {
        segments: {
          slides: { id: string; at: { kind: string; t?: number }; states: unknown }[];
        }[];
      };
    }).__project;
    return project.segments[0]!.slides.map((slide) => ({
      id: slide.id,
      at: slide.at,
      states: JSON.stringify(slide.states),
    }));
  });
}

/**
 * §14.9: автор может идти вторым путём — сначала содержимое, потом метка.
 *
 * До этой сессии второй путь ТЕРЯЛСЯ: правка ложилась в слайд, чья метка
 * стоит раньше головки, и молча портила картинку на всём отрезке между
 * метками. Проверяется по проекту, а не по экрану: на экране обе картины
 * выглядят одинаково — правка видна в обоих случаях.
 */
test.describe('слайд рождается при первой правке', () => {
  test('правка на голом месте рождает слайд, вторая правка ложится в него же', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);

    const before = await slidesOf(page);
    const marks = page.locator('[data-testid^="mark-slide-"]');
    const marksBefore = await marks.count();

    await seekTrack(page, 24);
    const head = await page.evaluate(
      () => (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds,
    );

    await dragElement(page, 'title', 60, 40);

    // Слайд родился ровно один, и его метка стоит на головке.
    await expect(marks, 'первая правка на голом месте обязана родить слайд')
      .toHaveCount(marksBefore + 1);
    const afterFirst = await slidesOf(page);
    expect(afterFirst).toHaveLength(before.length + 1);
    const born = afterFirst.find((slide) => !before.some((old) => old.id === slide.id));
    if (!born) throw new Error('новый слайд не найден в проекте');

    // Метка встала на позицию головки. Привязка к слову момент не сдвигает:
    // она хранит смещение от начала слова, а не само начало.
    const bornSeconds = born.at.kind === 'seconds'
      ? born.at.t!
      : await page.evaluate(
        () => (window as unknown as { __transport: { positionSeconds: number } })
          .__transport.positionSeconds,
      );
    expect(Math.abs(bornSeconds - head), 'метка встала не на головку').toBeLessThan(0.01);

    // Главное: НИ ОДИН прежний слайд не тронут. Это и есть §14.9 — до неё
    // правка ложилась в слайд, чья метка стоит раньше головки.
    for (const old of before) {
      const same = afterFirst.find((slide) => slide.id === old.id);
      expect(same?.states, `слайд «${old.id}» изменился, хотя правка шла не в него`)
        .toBe(old.states);
    }

    // И правка действительно записана — на рождённом слайде, а не в никуда.
    const sourceStates = before.map((slide) => slide.states);
    expect(sourceStates, 'на рождённом слайде ничего не изменилось').not.toContain(born.states);

    // Вторая правка при неподвижной головке — в тот же слайд.
    await dragElement(page, 'title', 30, 20);
    await expect(marks, 'слайды не должны плодиться на каждую правку')
      .toHaveCount(marksBefore + 1);
  });

  test('выбор слайда в ленте ведёт головку на его метку', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24);

    // Второй слайд ленты — его метка заведомо раньше 24 с.
    const slides = await slidesOf(page);
    const target = slides[1]!;
    await page.getByTestId(`slide-${target.id}`).click();

    const head = await page.evaluate(
      () => (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds,
    );
    const duration = await page.evaluate(
      () => (window as unknown as { __transport: { durationSeconds: number } }).__transport.durationSeconds,
    );

    // Секунда метки берётся из ГЕОМЕТРИИ дорожки, а не из проекта: метка
    // может быть привязана к слову, и разрешать ссылку тут нечем. Заодно
    // проверяется то, что видит автор, — положение ромба на дорожке.
    const lane = await page.getByTestId('marks-lane').boundingBox();
    const diamond = await page.getByTestId(`mark-slide-${target.id}`).boundingBox();
    if (!lane || !diamond) throw new Error('дорожка или метка не видны');
    const markSecondsOnLane = ((diamond.x + diamond.width / 2 - lane.x) / lane.width) * duration;

    expect(Math.abs(head - markSecondsOnLane), 'головка не встала на метку выбранного слайда')
      .toBeLessThan(0.2);
    expect(head, 'головка осталась там, где была до выбора').toBeLessThan(24);
  });
});

test.describe('перетаскивание картинки на холст', () => {
  test('файл не картинка — падает громко с русским сообщением, элемент не создаётся', async ({
    page,
  }) => {
    await openEditor(page, 'empty');

    const stageBox = await page.locator('.ed-stage-host').boundingBox();
    if (!stageBox) throw new Error('сцена не видна');
    const center = { x: stageBox.x + stageBox.width / 2, y: stageBox.y + stageBox.height / 2 };

    // DataTransfer собирается прямо в браузере: Playwright не даёт
    // синтезировать нативный drag файлов иначе, чем диспетчеризацией событий
    // с уже собранным DataTransfer.
    await page.evaluate(
      ({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        if (!target) throw new Error('нет элемента под курсором');
        const data = new DataTransfer();
        data.items.add(new File(['не картинка'], 'заметка.txt', { type: 'text/plain' }));
        target.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }),
        );
        target.dispatchEvent(
          new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }),
        );
      },
      center,
    );

    await expect(page.getByTestId('image-drop-error')).toContainText('заметка.txt');
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
  });
});

/**
 * Долг §12.4: элемент живёт в ЧАСТИ, а его состояние — на слайде.
 *
 * Раньше автор мог только удалить элемент насовсем: «пусть он появится вот
 * здесь, а раньше его не было» выразить было нечем, хотя ради этого случая
 * и заведено различие «нет в states» против `visible: false`.
 *
 * Тест жмёт по ВИДИМОЙ кнопке и смотрит на сцену. Проверка «в проекте
 * поменялись states» была бы зелёной, даже если бы кнопка ничего не рисовала,
 * а элемент остался бы на холсте — то есть не поймала бы ровно тот дефект,
 * ради которого действие затевалось.
 */
test.describe('элемент на слайде: поместить и убрать', () => {
  test('убрать со слайда — элемент уходит со сцены, но остаётся в списке части', async ({ page }) => {
    await openEditor(page, 'demo');

    const row = page.getByTestId('element-row-title');
    const toggle = page.getByTestId('element-slide-toggle-title');
    await expect(row).toBeVisible();
    await expect(page.locator('.ed-stage-host [data-id="title"]')).toHaveCount(1);

    await toggle.click();

    // Со сцены ушёл...
    await expect(page.locator('.ed-stage-host [data-id="title"]')).toHaveCount(0);
    // ...но из части НЕ удалён: строка на месте и честно говорит, что его
    // нет на этом слайде. Именно этим действие отличается от удаления.
    await expect(row).toBeVisible();
    await expect(row).toContainText('не на слайде');

    await toggle.click();

    await expect(page.locator('.ed-stage-host [data-id="title"]')).toHaveCount(1);
    await expect(row).not.toContainText('не на слайде');
  });
});

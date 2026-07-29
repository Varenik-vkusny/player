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
      (window as unknown as { __project: { nodes: { scene: { elements: { id: string }[] } }[] } })
        .__project.nodes[0]!.scene.elements.map((element) => element.id),
  );
}

test.describe('панель вставки', () => {
  test('кнопка «Текст» создаёт элемент на пустой сцене — он на сцене и сразу выделен', async ({
    page,
  }) => {
    await openEditor(page, 'empty');
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.getByTestId('selection-frame')).toHaveCount(0);

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

    await page.getByTestId('insert-shape').click();
    await page.getByTestId('insert-image').click();

    const types = await page.evaluate(
      () =>
        (window as unknown as { __project: { nodes: { scene: { elements: { type: string }[] } }[] } })
          .__project.nodes[0]!.scene.elements.map((element) => element.type),
    );
    expect(types).toEqual(['shape', 'image']);
    // Оба элемента реально нарисованы плеерным рендером — не только в проекте.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
  });

  test('кнопка «Круг» кладёт на холст видимую фигуру со скруглением 50%', async ({ page }) => {
    await openEditor(page, 'empty');
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);

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
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    // На 24-й секунде demo.json: card видна, dot (её анимация начинается
    // на слове №58) ещё нет. Установлено в e2e/editor.spec.ts.
    await seekTrack(page, 24);

    const dotOpacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="dot"]')!).opacity,
    );
    expect(Number(dotOpacity), 'точка обязана быть невидимой — иначе тест не про то').toBeLessThan(
      0.01,
    );

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
    // exact: true — иначе имя совпадает и с «Удалить узел» панели графа
    // (Задача 9): без exact локатор ловил бы обе кнопки.
    await expect(page.getByRole('button', { name: 'Удалить', exact: true })).toBeDisabled();
  });

  test('удаление элемента с анимациями сообщает о каскаде и оставляет проект, который грузится', async ({
    page,
  }) => {
    await openEditor(page, 'demo');
    // dot — цель двух анимаций в demo.json: c-dot и c-dot-move.
    await page.getByTestId('element-row-dot').click();
    await expect(page.getByTestId('selection-readout')).toContainText('dot');

    await page.getByRole('button', { name: 'Удалить', exact: true }).click();

    await expect(page.getByTestId('removal-message')).toContainText('dot');
    await expect(page.getByTestId('removal-message')).toContainText('2 анимации');
    await expect(page.locator('[data-id="dot"]')).toHaveCount(0);
    await expect(page.getByTestId('selection-readout')).toContainText('ничего не выделено');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Сохранить' }).click(),
    ]).then(([event]) => event);
    const file = await download.path();
    if (!file) throw new Error('файл не сохранился');
    // serializeProject прогоняет текст через loadProject перед выдачей файла
    // (state/save.ts) — если бы каскад не снял осиротевшие cues, скачивание
    // упало бы раньше, чем этот тест дошёл до чтения файла.
    const saved = JSON.parse(readFileSync(file, 'utf8')) as {
      schemaVersion: number;
      nodes: { scene: { elements: { id: string }[]; cues: { id: string }[] } }[];
    };
    expect(saved.schemaVersion).toBe(2);
    expect(saved.nodes[0]!.scene.elements.some((element) => element.id === 'dot')).toBe(false);
    expect(
      saved.nodes[0]!.scene.cues.some((cue) => cue.id === 'c-dot' || cue.id === 'c-dot-move'),
    ).toBe(false);
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

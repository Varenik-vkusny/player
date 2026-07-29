/**
 * Правка текста на холсте (двойной клик) — раздел «Правка текста на холсте»
 * docs/superpowers/specs/2026-07-28-editor-authoring-design.md.
 *
 * Каждый тест нажимает по видимому элементу и набирает настоящую клавиатуру,
 * а не дёргает состояние в обход интерфейса — проверка «сработал ли редьюсер»
 * была бы зелёной при любом дефекте раскладки, масштаба или порядка эффектов
 * (CLAUDE.md, ADR-010).
 */
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

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

async function elementContent(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { nodes: { scene: { elements: { id: string; content: string }[] } }[] };
    }).__project;
    const element = project.nodes[0]!.scene.elements.find((candidate) => candidate.id === elementId);
    if (!element) throw new Error(`в проекте нет элемента ${elementId}`);
    return element.content;
  }, id);
}

/** Каретка сейчас внутри contenteditable-узла на холсте — то же свойство DOM,
 * что читает Editor.tsx для контекста `editingText` (keyboard.ts). */
async function isEditingText(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable,
  );
}

test.describe('правка текста на холсте', () => {
  test('двойной клик по заголовку, набор, Escape — меняет содержимое в проекте и на сцене', async ({
    page,
  }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24); // на 24-й секунде title уже виден (editor-authoring.spec.ts)

    const before = await elementContent(page, 'title');
    const center = await centerOnScreen(page, 'title');

    await page.mouse.dblclick(center.x, center.y);
    expect(await isEditingText(page), 'после двойного клика каретка обязана быть в тексте').toBe(
      true,
    );

    await page.keyboard.press('Control+a');
    await page.keyboard.type('Новый заголовок');
    await page.keyboard.press('Escape');

    expect(await isEditingText(page), 'Escape обязан завершить режим правки').toBe(false);

    const after = await elementContent(page, 'title');
    expect(after).not.toBe(before);
    expect(after).toBe('Новый заголовок');

    // И на сцене — не только в проекте: applyElement применил тот же content.
    await expect(page.locator('[data-id="title"]')).toHaveText('Новый заголовок');
  });

  test('правка текста — один шаг отмены: Ctrl+Z возвращает весь прежний текст целиком', async ({
    page,
  }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    // title анимированно появляется (opacity 0→1) и на нулевой секунде ещё
    // не виден — StageView.handleStageDoubleClick фильтрует попадание по
    // видимости, как и одиночный клик (ADR-010, «Выделяется то, что ВИДНО»).
    await seekTrack(page, 24);
    const before = await elementContent(page, 'title');
    const center = await centerOnScreen(page, 'title');

    await page.mouse.dblclick(center.x, center.y);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Совсем другой и куда более длинный текст');
    await page.keyboard.press('Escape');

    const edited = await elementContent(page, 'title');
    expect(edited).not.toBe(before);
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeEnabled();

    // Один Ctrl+Z обязан вернуть ВЕСЬ исходный текст, а не последнюю
    // набранную букву: набор не дробит правку на дispatch по символам
    // (commitTextEdit в StageView шлёт ровно один replaceElement на весь
    // жест, как и требует срез 2 плана сессии).
    await page.keyboard.press('Control+z');
    await expect.poll(() => elementContent(page, 'title')).toBe(before);
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  });

  test('пока каретка в тексте, Delete не удаляет элемент со сцены', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24); // title виден только после появления — см. комментарий выше
    const center = await centerOnScreen(page, 'title');

    await page.mouse.dblclick(center.x, center.y);
    expect(await isEditingText(page)).toBe(true);

    // Delete здесь — стирание символа ВНУТРИ contenteditable (браузер сам
    // это обрабатывает), а не команда редактора «удалить выделенный
    // элемент»: keyboard.ts в контексте editingText отдаёт Delete целиком
    // вводу и возвращает undefined редактору.
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-id="title"]')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-id="title"]')).toHaveCount(1);
  });

  test('клик мимо коммитит правку так же, как Escape', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24); // title виден только после появления — см. комментарий выше
    const before = await elementContent(page, 'title');
    const center = await centerOnScreen(page, 'title');

    await page.mouse.dblclick(center.x, center.y);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Правка кликом мимо');

    // Клик по строке другого элемента — обычная кнопка вне сцены. Ловится
    // слушателем document в фазе захвата раньше, чем список успеет
    // сменить выделение (см. StageView.beginTextEdit).
    await page.getByTestId('element-row-lead').click();

    expect(await isEditingText(page), 'клик мимо обязан завершить правку текста').toBe(false);
    const after = await elementContent(page, 'title');
    expect(after).not.toBe(before);
    expect(after).toBe('Правка кликом мимо');
    // И выделился именно lead — клик не потерялся под коммитом.
    await expect(page.getByTestId('selection-readout')).toContainText('lead');
  });

  test('двойной клик по фигуре не открывает правку текста', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    // card тоже анимированно появляется — без перемотки двойной клик ничего
    // бы не нашёл вовсе (ADR-010, «Выделяется то, что ВИДНО»), и тест
    // прошёл бы по неверной причине, а не потому что card — не текст.
    await seekTrack(page, 24);
    const center = await centerOnScreen(page, 'card'); // card — shape, не text

    await page.mouse.dblclick(center.x, center.y);
    // Клик реально попал в card, а не мимо — иначе проверка ниже была бы
    // зелёной вхолостую.
    await expect(page.getByTestId('selection-readout')).toContainText('card');

    expect(await isEditingText(page), 'у фигуры нет текста для правки на месте').toBe(false);
  });

  test('правка текста не отматывает сцену в начало', async ({ page }) => {
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24);

    const positionBefore = await page.evaluate(
      () =>
        (window as unknown as { __transport: { positionSeconds: number } }).__transport
          .positionSeconds,
    );
    expect(positionBefore).toBeGreaterThan(20);

    const titleBefore = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(titleBefore), 'на 24-й секунде заголовок обязан быть виден').toBeGreaterThan(0.9);

    const center = await centerOnScreen(page, 'title');
    await page.mouse.dblclick(center.x, center.y);
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Другой заголовок');
    await page.keyboard.press('Escape');

    const positionAfter = await page.evaluate(
      () =>
        (window as unknown as { __transport: { positionSeconds: number } }).__transport
          .positionSeconds,
    );
    expect(positionAfter, 'правка текста отмотала сцену в начало').toBeCloseTo(positionBefore, 5);

    const titleAfter = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(titleAfter), 'правка текста отмотала сцену в начало').toBeGreaterThan(0.9);
  });
});

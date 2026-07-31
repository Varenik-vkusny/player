/**
 * Срез 2 (отмена/повтор) и срез 6 (клавиатура) плана сессии 3.
 *
 * Каждый тест двигает настоящую клавиатуру и мышь, а не подставляет действие
 * в состояние в обход интерфейса — проверка «сработал ли дальше редьюсер»
 * была бы зелёной при любом дефекте раскладки, порядка эффектов или того,
 * какой узел на самом деле получил фокус (CLAUDE.md, ADR-010).
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

async function elementX(page: Page, id: string): Promise<number> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, { x: number }> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId}`);
    return state.x;
  }, id);
}

async function centerOnScreen(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Несколько шагов, а не один: это и есть жест из десятков pointermove,
  // ради которого написана вся коммит-точка среза 2.
  await page.mouse.move(from.x + dx / 3, from.y + dy / 3);
  await page.mouse.move(from.x + (dx * 2) / 3, from.y + (dy * 2) / 3);
  await page.mouse.move(from.x + dx, from.y + dy);
  await page.mouse.up();
}

test.describe('отмена и повтор', () => {
  test('двадцать отмен подряд возвращают ровно те состояния, что были; повтор возвращает отменённое', async ({
    page,
  }) => {
    await openEditor(page, 'two-gates');
    await page.getByTestId('element-row-question').click();
    await expect(page.getByTestId('selection-readout')).toContainText('question');

    // Двадцать самостоятельных шагов — по одному нажатию клавиши на шаг
    // (правило «коммит-точка явная», без угаданной склейки серии).
    const xs: number[] = [await elementX(page, 'question')];
    for (let i = 0; i < 20; i += 1) {
      await page.keyboard.press('ArrowRight');
      xs.push(await elementX(page, 'question'));
    }
    expect(xs).toHaveLength(21);
    expect(new Set(xs).size).toBe(21); // каждый шаг дал новое, различимое значение

    for (let k = 20; k >= 1; k -= 1) {
      await page.keyboard.press('Control+z');
      await expect
        .poll(() => elementX(page, 'question'), `undo #${21 - k}`)
        .toBe(xs[k - 1]);
    }
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();

    for (let k = 1; k <= 20; k += 1) {
      await page.keyboard.press('Control+Shift+z');
      await expect
        .poll(() => elementX(page, 'question'), `redo #${k}`)
        .toBe(xs[k]);
    }
    await expect(page.getByRole('button', { name: 'Повторить' })).toBeDisabled();
  });

  test('перетаскивание элемента — один шаг отмены, а не десятки', async ({ page }) => {
    await openEditor(page, 'two-gates');
    const before = await elementX(page, 'question');

    const center = await centerOnScreen(page, 'question');
    await drag(page, center, 140, 90);

    const afterDrag = await elementX(page, 'question');
    expect(afterDrag, 'жест не сдвинул элемент — тест ничего не проверяет').not.toBe(before);
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeEnabled();

    // Один Ctrl+Z обязан вернуть ИСХОДНОЕ значение целиком, а не один кадр
    // протаскивания из десятков, что шлёт pointermove.
    await page.keyboard.press('Control+z');
    await expect.poll(() => elementX(page, 'question')).toBe(before);

    // И шаг был ровно один: второй раз отменять уже нечего.
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  });

  test('отмена не отматывает сцену в начало', async ({ page }) => {
    // Тот же дефект, что чинился для меток (e2e/marks.spec.ts) и для
    // создания элемента (e2e/editor-authoring.spec.ts) — только теперь
    // на пути отмены: восстановление старого project меняет ссылку на
    // elements, StageView пересобирает сцену, а свежий ScenePreview
    // без явного renderAt встал бы на ноль.
    await openEditor(page, 'demo');
    await waitTransportReady(page);
    await seekTrack(page, 24);

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(before), 'на 24-й секунде заголовок обязан быть виден').toBeGreaterThan(0.9);

    // Структурная правка — добавление элемента, тот же ход, что в
    // editor-authoring.spec.ts.
    await page.getByTestId('insert-shape').click();
    await page.keyboard.press('Control+z');

    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-id="title"]')!).opacity,
    );
    expect(Number(after), 'отмена отмотала сцену в начало').toBeGreaterThan(0.9);
  });
});

test.describe('работа без мыши', () => {
  test('Tab до списка элементов, стрелки на 1 и 10 с Shift, Delete, Escape, Ctrl+Z', async ({
    page,
  }) => {
    await openEditor(page, 'two-gates');

    let reachedRow: string | null = null;
    for (let i = 0; i < 60 && !reachedRow; i += 1) {
      await page.keyboard.press('Tab');
      reachedRow = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const testId = active?.dataset?.['testid'];
        return testId && testId.startsWith('element-row-') ? testId : null;
      });
    }
    if (!reachedRow) throw new Error('Tab не добрался до списка элементов сцены');
    const id = reachedRow.replace('element-row-', '');

    // Активация фокусированной кнопки клавиатурой — обычное поведение
    // <button>, отдельного кода для этого не требуется.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('selection-readout')).toContainText(id);

    const before = await elementX(page, id);
    await page.keyboard.press('ArrowRight');
    expect(await elementX(page, id)).toBe(before + 1);

    await page.keyboard.press('Shift+ArrowRight');
    expect(await elementX(page, id)).toBe(before + 11);

    await page.keyboard.press('Delete');
    await expect(page.locator(`.ed-stage-host [data-id="${id}"]`)).toHaveCount(0);
    await expect(page.getByTestId('selection-readout')).toContainText('ничего не выделено');

    await page.keyboard.press('Control+z');
    await expect(page.locator(`.ed-stage-host [data-id="${id}"]`)).toHaveCount(1);

    await page.getByTestId(`element-row-${id}`).click();
    await expect(page.getByTestId('selection-readout')).toContainText(id);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('selection-readout')).toContainText('ничего не выделено');
  });

  test('модуль клавиатуры не глотает Tab: обход всех элементов списка доходит до конца', async ({
    page,
  }) => {
    // demo.json — семь элементов сцены, значит семь строк списка. Обход
    // табом не должен «застревать» — если бы Tab был съеден, фокус либо
    // завис бы на одном узле, либо ушёл бы мимо списка целиком.
    await openEditor(page, 'demo');

    const seenRows = new Set<string>();
    for (let i = 0; i < 80 && seenRows.size < 7; i += 1) {
      await page.keyboard.press('Tab');
      const testId = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.dataset?.['testid'],
      );
      if (testId?.startsWith('element-row-')) seenRows.add(testId);
    }
    expect(seenRows.size, 'обход табом не дошёл до всех строк списка').toBe(7);
  });
});

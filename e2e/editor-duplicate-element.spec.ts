/**
 * Копия элементов на сцене: Ctrl+D.
 *
 * Каждый тест жмёт НАСТОЯЩИЕ клавиши по НАСТОЯЩЕМУ выделению, сделанному
 * мышью. Проверка «вызвался ли duplicateElements» была бы зелёной при любом
 * дефекте попадания указателя, перехвата события полосой свойств или порядка
 * эффектов — то есть при дефектах ровно того класса, ради которого e2e
 * и заводится.
 *
 * Фикстура `morph`: `mover` и `leaver` стоят на первом слайде далеко друг
 * от друга, промахнуться указателем мимо одного в другой нельзя.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Идентификаторы элементов В ПРОЕКТЕ — то, что уедет в файл. */
async function elementIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const project = (window as unknown as {
      __project: { segments: { elements: { id: string }[] }[] };
    }).__project;
    return project.segments[0]!.elements.map((element) => element.id);
  });
}

async function stateOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, { x: number; y: number }> }[] }[] };
    }).__project;
    const state = project.segments[0]!.slides[0]!.states[elementId];
    if (!state) throw new Error(`в проекте нет состояния элемента ${elementId}`);
    return { x: state.x, y: state.y };
  }, id);
}

/**
 * Кто сейчас выделен — по списку элементов, а не по своему атрибуту.
 *
 * `.ed-element-row[aria-pressed="true"]` — то же наблюдаемое свойство,
 * которым уже проверяет выделение `multi-select.spec.ts`. Заводить ради
 * теста второй признак значило бы проверять признак, а не продукт.
 */
async function selectedIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.ed-element-row[aria-pressed="true"]')).map((node) =>
      ((node as HTMLElement).dataset['testid'] ?? '').replace('element-row-', ''),
    ),
  );
}

async function clickElement(page: Page, id: string, shift = false): Promise<void> {
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
  // Shift зажимается КЛАВИАТУРОЙ вокруг клика: у page.mouse.click полей
  // модификаторов нет, лишний ключ молча выбрасывается.
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(center.x, center.y);
  if (shift) await page.keyboard.up('Shift');
}

test.describe('Ctrl+D — копия элементов', () => {
  test('копия появляется, СМЕЩЕНА от оригинала и выделена вместо него', async ({ page }) => {
    await openEditor(page, 'morph');
    const before = await elementIds(page);

    await clickElement(page, 'mover');
    const original = await stateOf(page, 'mover');
    await page.keyboard.press('Control+d');

    const after = await elementIds(page);
    expect(after).toHaveLength(before.length + 1);

    const copyId = after.find((id) => !before.includes(id))!;
    expect(copyId).toBeDefined();

    // Смещение — несущее свойство, а не украшение: копия, легшая ровно
    // на оригинал, неотличима от «Ctrl+D не сработал».
    const copy = await stateOf(page, copyId);
    expect(copy.x).toBeGreaterThan(original.x);
    expect(copy.y).toBeGreaterThan(original.y);

    // Выделение перешло на копию: автор сейчас же потащит её в сторону.
    expect(await selectedIds(page)).toEqual([copyId]);
  });

  test('копия ДВУХ выделенных — одна отмена возвращает обе', async ({ page }) => {
    await openEditor(page, 'morph');
    const before = await elementIds(page);

    await clickElement(page, 'mover');
    await clickElement(page, 'leaver', true);
    await page.keyboard.press('Control+d');

    expect(await elementIds(page)).toHaveLength(before.length + 2);

    // Несущее: ОДИН Ctrl+Z на ОДИН жест автора. Если копия собрана циклом,
    // здесь останется одна лишняя копия, и тест покраснеет.
    await page.keyboard.press('Control+z');
    expect(await elementIds(page)).toEqual(before);
  });

  test('Ctrl+D в текстовом поле панели НЕ копирует элемент', async ({ page }) => {
    await openEditor(page, 'morph');
    const before = await elementIds(page);

    await clickElement(page, 'mover');
    // Любое текстовое поле панели свойств: фокус в нём означает, что
    // сочетание принадлежит вводу, а не сцене.
    const field = page.locator('input.ed-insp-input:not([readonly])').first();
    await field.focus();
    await page.keyboard.press('Control+d');

    expect(await elementIds(page)).toEqual(before);
  });
});

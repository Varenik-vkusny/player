/**
 * Меню правой кнопки над сценой.
 *
 * Тесты нажимают по ВИДИМОЙ кнопке меню настоящей мышью. Проверка «вызвался
 * ли обработчик» была бы зелёной при перекрытом или неоткрывшемся меню —
 * ровно тот класс дефекта, из-за которого в прошлом кликабельная сцена
 * перехватывала нажатия по кнопкам ответа (CLAUDE.md).
 *
 * Состав и поведение меню сняты с натуры у Canva 11.08.2026 (журнал §8),
 * включая два правила, которые эти тесты и стерегут: правая кнопка
 * по невыделенному его выделяет, а невозможный пункт гаснет, но остаётся.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=morph', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function elementIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const project = (window as unknown as {
      __project: { segments: { elements: { id: string }[] }[] };
    }).__project;
    return project.segments[0]!.elements.map((element) => element.id);
  });
}

async function centerOf(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId}`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, id);
}

async function rightClickElement(page: Page, id: string): Promise<void> {
  const center = await centerOf(page, id);
  await page.mouse.click(center.x, center.y, { button: 'right' });
}

async function leftClickElement(page: Page, id: string): Promise<void> {
  const center = await centerOf(page, id);
  await page.mouse.click(center.x, center.y);
}

test.describe('меню правой кнопки', () => {
  test('открывается по элементу и «Дублировать» из него РАБОТАЕТ', async ({ page }) => {
    await openEditor(page);
    const before = await elementIds(page);

    await rightClickElement(page, 'mover');
    await expect(page.getByTestId('context-menu')).toBeVisible();

    // Нажатие по ВИДИМОЙ кнопке, а не вызов обработчика: перекрытое меню
    // провалит именно этот шаг, и провалит громко.
    await page.getByTestId('ctxmenu-duplicate').click();

    expect(await elementIds(page)).toHaveLength(before.length + 1);
    // Меню закрылось после выбора: оставшееся висеть перекрывало бы сцену.
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
  });

  test('правая кнопка по НЕВЫДЕЛЕННОМУ выделяет его — меню действует на него', async ({ page }) => {
    await openEditor(page);

    // Выделен один, а нажимаем правой по ДРУГОМУ.
    await leftClickElement(page, 'mover');
    await rightClickElement(page, 'leaver');
    await page.getByTestId('ctxmenu-duplicate').click();

    // Несущее. Если правая кнопка выделение не переносит, копия уедет
    // с `mover`, и автор получит копию не того объекта, по которому нажал.
    const ids = await elementIds(page);
    expect(ids.some((id) => id.startsWith('leaver') && id !== 'leaver')).toBe(true);
    expect(ids.some((id) => id.startsWith('mover') && id !== 'mover')).toBe(false);
  });

  test('Escape закрывает меню', async ({ page }) => {
    await openEditor(page);
    await rightClickElement(page, 'mover');
    await expect(page.getByTestId('context-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
  });

  test('щелчок мимо закрывает меню и НИЧЕГО не выполняет', async ({ page }) => {
    await openEditor(page);
    const before = await elementIds(page);

    await rightClickElement(page, 'mover');
    await expect(page.getByTestId('context-menu')).toBeVisible();

    // Далеко от меню и от объектов.
    await page.mouse.click(20, 400);
    await expect(page.getByTestId('context-menu')).toHaveCount(0);
    expect(await elementIds(page)).toEqual(before);
  });

  test('невозможный ход по слоям ГАСНЕТ, но остаётся видимым', async ({ page }) => {
    await openEditor(page);

    // Уводим объект в самый низ стопки — дальше двигать некуда.
    await rightClickElement(page, 'mover');
    await page.getByTestId('ctxmenu-layer-back').click();

    await rightClickElement(page, 'mover');
    const back = page.getByTestId('ctxmenu-layer-back');

    /**
     * Несущее и куплено граблями Сессии 30 §20б: спрятанный пункт автор
     * считает несуществующим. Краснеет, если погашенный пункт убрать
     * из разметки или спрятать через display: none.
     */
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('aria-disabled', 'true');

    /**
     * И при этом он не действует.
     *
     * `force: true` здесь МОДЕЛИРУЕТ ПОЛЬЗОВАТЕЛЯ ТОЧНЕЕ, чем обычный клик,
     * и это не обход проверки. Пункт погашен через `aria-disabled`, а не
     * через атрибут `disabled`: разметка нарочно оставляет его видимым
     * и читаемым вспомогательными технологиями. Живая мышь по такому узлу
     * событие пошлёт — браузеру `aria-disabled` ничего не запрещает.
     * Playwright же отказывается кликать («element is not enabled»), то есть
     * без `force` тест проверял бы отказ ИНСТРУМЕНТА, а не поведение
     * продукта под настоящим щелчком.
     */
    await back.click({ force: true });
    await expect(page.getByTestId('context-menu')).toBeVisible();
  });
});

test.describe('правая кнопка не двигает объект', () => {
  test('нажатие правой и движение мыши НЕ перетаскивает элемент', async ({ page }) => {
    /**
     * `event.button` в StageView не проверялся вовсе, а `pointerdown`
     * приходит и от правой кнопки. Пока меню браузера открывалось само,
     * оно жест обрывало; теперь мы это меню гасим, и жест доживает
     * до движения мыши.
     *
     * Краснеет, если правая кнопка начинает перетаскивание: автор,
     * промахнувшийся мимо пункта меню, УВЁЗ БЫ объект и не понял бы,
     * с чего он сдвинулся.
     */
    await openEditor(page);

    const before = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: { segments: { slides: { states: Record<string, { x: number }> }[] }[] };
      }).__project;
      return project.segments[0]!.slides[0]!.states['mover']!.x;
    });

    const center = await centerOf(page, 'mover');
    await page.mouse.move(center.x, center.y);
    await page.mouse.down({ button: 'right' });
    for (let step = 1; step <= 6; step += 1) {
      await page.mouse.move(center.x + (120 * step) / 6, center.y);
    }
    await page.mouse.up({ button: 'right' });

    const after = await page.evaluate(() => {
      const project = (window as unknown as {
        __project: { segments: { slides: { states: Record<string, { x: number }> }[] }[] };
      }).__project;
      return project.segments[0]!.slides[0]!.states['mover']!.x;
    });

    expect(after).toBe(before);
  });
});

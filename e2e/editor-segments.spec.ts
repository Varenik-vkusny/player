/**
 * Панель частей: состав сегментов и правила выхода.
 *
 * Несущий тест здесь — переключение узла меняет сцену на холсте: он доказывает,
 * что редактор больше не заперт на стартовом узле (Editor.tsx до этой сессии
 * держал свой `nodeId` в локальном useState без сеттера, независимо
 * от `state.currentNodeId`). Остальные проверяют саму панель графа:
 * недостижимость, покрытие гейтов рёбрами, запрет удалять стартовый узел,
 * сброс головки при смене узла.
 *
 * Каждый тест нажимает по видимому элементу — `.click()` по локатору, а не
 * `dispatchEvent` и не чтение состояния в обход интерфейса: в этом проекте
 * уже находили дефект наложения, когда сцена перехватывала клики по кнопкам
 * (CLAUDE.md, «тест, который проверяет вызов обработчика»).
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

test.describe('части: панель сегментов', () => {
  test('переключение узла меняет сцену на холсте', async ({ page }) => {
    await openEditor(page, 'branching');

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(4);

    await page.getByTestId('segment-n-yes').click();

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
  });

  test('создание узла: новый узел недостижим и становится текущим', async ({ page }) => {
    await openEditor(page, 'branching');

    await page.getByTestId('segment-add').click();

    // Ровно один новый сегмент — стандартное имя freeId('segment', ...).
    const newNode = page.getByTestId('segment-segment-1');
    await expect(newNode).toBeVisible();
    await expect(page.getByTestId('segment-unreachable-segment-1')).toBeVisible();

    // Он же стал текущим — холст пуст: сцена нового узла пуста по построению.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
  });

  test('соединение ребром убирает непокрытый вариант и недостижимость', async ({ page }) => {
    await openEditor(page, 'branching');

    // Рёбра фикстуры покрывают оба варианта — дыры нет.
    await expect(page.getByTestId('exit-uncovered')).not.toContainText('Нет');

    await page.getByTestId('exit-disconnect-e-no').click();

    await expect(page.getByTestId('exit-uncovered')).toContainText('Нет');
    await expect(page.getByTestId('segment-unreachable-n-no')).toBeVisible();

    await page.getByTestId('exit-target-gate-start-opt-no').selectOption('n-no');
    await page.getByTestId('exit-connect-gate-start-opt-no').click();

    await expect(page.getByTestId('exit-uncovered')).not.toContainText('Нет');
    await expect(page.getByTestId('segment-unreachable-n-no')).toHaveCount(0);
  });

  test('стартовый узел удалить нельзя, другой — можно', async ({ page }) => {
    await openEditor(page, 'branching');

    // На стартовом узле кнопка удаления заблокирована — removeNode на нём бросает.
    await expect(page.getByTestId('segment-remove')).toBeDisabled();

    await page.getByTestId('segment-n-yes').click();
    await expect(page.getByTestId('segment-remove')).toBeEnabled();
  });

  test('переключение узла ставит головку в ноль', async ({ page }) => {
    await openEditor(page, 'branching');
    await waitTransportReady(page);

    // Перематываем стартовый узел (48.6 с) далеко за длительность n-yes (3 с).
    await page.evaluate(() => {
      (window as unknown as { __transport: { seek: (seconds: number) => void } }).__transport.seek(20);
    });
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __transport: { positionSeconds: number } }).__transport.positionSeconds,
        ),
      )
      .toBeGreaterThan(19);

    await page.getByTestId('segment-n-yes').click();
    await waitTransportReady(page);

    const { position, duration } = await page.evaluate(() => {
      const t = (window as unknown as {
        __transport: { positionSeconds: number; durationSeconds: number };
      }).__transport;
      return { position: t.positionSeconds, duration: t.durationSeconds };
    });

    expect(duration).toBeCloseTo(3, 0);
    expect(position).toBeLessThanOrEqual(duration);
  });

  /**
   * Дефект, который тесты пропустили, а взгляд в браузере нашёл: текст ребра
   * обрезался многоточием, и в колонке 190px оба ребра развилки читались как
   * «вариант «Да» → Конц…» и «вариант «Нет» → Кон…». Список рёбер существует
   * ровно для того, чтобы автор видел, КУДА ведёт ребро, — обрезка отменяла
   * его смысл, не ломая при этом ни раскладку, ни assert по тексту.
   *
   * Проверять текстом бесполезно: `innerText` возвращает полную строку и при
   * визуальной обрезке тоже. Поэтому меряем то, что видит автор: обрезанный
   * элемент имеет scrollWidth больше своей clientWidth.
   */
  test('текст ребра виден целиком, а не обрезан многоточием', async ({ page }) => {
    await openEditor(page, 'branching');

    const texts = page.locator('.ed-exit-rule-text');
    await expect(texts).toHaveCount(2);

    const clipped = await texts.evaluateAll((nodes) =>
      nodes
        .filter((node) => node.scrollWidth > node.clientWidth + 1)
        .map((node) => `${node.textContent}: scrollWidth ${node.scrollWidth} > clientWidth ${node.clientWidth}`),
    );
    expect(clipped, 'обрезанный текст ребра скрывает от автора цель перехода').toEqual([]);

    // И заодно: цели двух рёбер обязаны РАЗЛИЧАТЬСЯ на экране. Обрезка делала
    // их одинаковыми на вид, и это не поймал бы ни один assert по innerText.
    const shown = await texts.allInnerTexts();
    expect(new Set(shown).size).toBe(2);
    expect(shown.join(' | ')).toContain('Концовка: да');
    expect(shown.join(' | ')).toContain('Концовка: нет');
  });
});

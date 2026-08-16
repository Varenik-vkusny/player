/**
 * Вид «Ветки» как ПРОСТРАНСТВО: дерево целиком, езда и масштаб.
 *
 * Решение владельца 16.08.2026: «надо сделать как в фигме — это просто
 * пространство, по которому можно ездить, зажимая колёсико мыши», плюс
 * полноценный масштаб. → `docs/design/branches.md` §5.2
 *
 * ПОЧЕМУ ЭТИ ТЕСТЫ ЖИВУТ В E2E, А НЕ В ЮНИТАХ. Раскладка уже проверена
 * юнитами (`branchLayout.test.ts`) против литералов, посчитанных руками.
 * Повторять её здесь бессмысленно: тест «икс начала ветки равен правому
 * краю плитки-развилки» ТОЖДЕСТВЕН по построению, если сравнивать с тем же
 * выражением, которым это и посчитано. Здесь проверяется ПОПАДАНИЕ —
 * измерением живого DOM, где никакой формулы уже нет.
 */
import { expect, test, type Page } from '@playwright/test';

async function openBranches(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.getByTestId('view-branches').click();
  await expect(page.getByTestId('branches-view')).toBeVisible();
}

test.describe('вид «Ветки»: дерево целиком', () => {
  /**
   * ЭТО ГЛАВНЫЙ ТЕСТ ВИДА, и он назван в плане MVP как единственный
   * непустой способ проверить раскладку: «Проверять надо ПОПАДАНИЕ: икс
   * начала ветки совпадает с иксом метки в DOM».
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: начать дочернюю полосу от ЛЕВОГО края плитки
   * развилки вместо правого (`branchLayout.ts`, правило 3) — измеренные
   * иксы разъедутся на ширину плитки.
   *
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Совпадение краёв — это утверждение
   * о раскладке, ложное для любой другой привязки ветки. Сравниваются
   * ЭКРАННЫЕ координаты после всех преобразований масштаба, то есть то,
   * что видит автор, а не то, что посчитала функция.
   */
  test('обе ветки начинаются ровно под своей меткой — измерено в DOM', async ({ page }) => {
    await openBranches(page, 'split-track');

    const fork = await page.getByTestId('chapter-tile-s-head').boundingBox();
    const left = await page.getByTestId('branch-row-s-left').boundingBox();
    const right = await page.getByTestId('branch-row-s-right').boundingBox();
    expect(fork).not.toBeNull();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();

    const metka = fork!.x + fork!.width;
    // Допуск в один экранный пиксель: масштаб дробный, и округление
    // до целого пикселя браузером — не дефект раскладки.
    expect(Math.abs(left!.x - metka)).toBeLessThanOrEqual(1);
    expect(Math.abs(right!.x - metka)).toBeLessThanOrEqual(1);
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: перестать прятать потомков свёрнутой полосы.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — до нажатия обе ветки видны,
   * и первая половина теста это доказывает (контроль прибора).
   */
  test('сворачивание ветки убирает её подветки, разворачивание возвращает', async ({ page }) => {
    await openBranches(page, 'split-track');

    await expect(page.getByTestId('branch-row-s-left')).toBeVisible();
    await expect(page.getByTestId('branch-row-s-right')).toBeVisible();

    await page.getByTestId('branch-collapse-s-head').click();
    await expect(page.getByTestId('branch-row-s-left')).toHaveCount(0);
    await expect(page.getByTestId('branch-row-s-right')).toHaveCount(0);
    // Сама свёрнутая полоса остаётся: спрятать её значило бы спрятать
    // и кнопку, которой её разворачивают.
    await expect(page.getByTestId('branch-row-s-head')).toBeVisible();

    await page.getByTestId('branch-collapse-s-head').click();
    await expect(page.getByTestId('branch-row-s-left')).toBeVisible();
  });

  /**
   * ЗАХВАТ УКАЗАТЕЛЯ СЪЕДАЕТ КЛИК ПО КНОПКЕ — измерено в этом проекте:
   * `setPointerCapture` на сцене переадресует последующий `click`
   * захватившему узлу, и кнопки внутри холста переставали работать
   * без единой ошибки в консоли.
   *
   * Плитки глав — кнопки, а езда делается ровно этим механизмом. Поэтому
   * проверяется не «езда работает», а то, что ПОСЛЕ неё щелчок по видимой
   * плитке по-прежнему доходит.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: захватывать указатель при ЛЮБОЙ кнопке, а не
   * только при средней, либо не отпускать захват на `pointerup`.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — при захвате левой кнопкой
   * щелчок уйдёт в окно пространства, и крошки не сменятся.
   */
  test('после езды средней кнопкой щелчок по плитке всё ещё работает', async ({ page }) => {
    await openBranches(page, 'split-track');

    const space = await page.getByTestId('branches-space').boundingBox();
    expect(space).not.toBeNull();
    const before = await page.getByTestId('branches-canvas').evaluate((node) => node.style.transform);

    await page.mouse.move(space!.x + space!.width / 2, space!.y + space!.height / 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(space!.x + space!.width / 2 - 60, space!.y + space!.height / 2 - 30, { steps: 4 });
    await page.mouse.up({ button: 'middle' });

    // Контроль прибора: езда СОСТОЯЛАСЬ. Без этой проверки следующая
    // ничего не значит — щелчок работал бы и потому, что ездить не начали.
    const after = await page.getByTestId('branches-canvas').evaluate((node) => node.style.transform);
    expect(after).not.toBe(before);

    await page.getByTestId('chapter-pick-s-tail').click();
    await expect(page.getByTestId('zone-crumbs')).toContainText('После развилки');
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: перестать звать `preventDefault` на колесе
   * (React вешает `onWheel` пассивно, и там это молча не сработает) либо
   * не применять `zoom` из `wheelIntent`.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — подпись процентов обязана
   * ИЗМЕНИТЬСЯ, а не просто существовать.
   */
  test('Ctrl+колесо меняет масштаб, и подпись процентов идёт с ним вместе', async ({ page }) => {
    await openBranches(page, 'split-track');

    const zoomBefore = await page.getByTestId('branches-zoom').textContent();
    const space = await page.getByTestId('branches-space').boundingBox();
    await page.mouse.move(space!.x + space!.width / 2, space!.y + space!.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');

    await expect(page.getByTestId('branches-zoom')).not.toHaveText(zoomBefore ?? '');
  });

  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: «Показать всё» перестаёт считать вписывание
   * от коробки содержимого.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — сначала уезжаем МАСШТАБОМ так,
   * что дерево заведомо не помещается, и только потом просим вписать.
   */
  test('«Показать всё» возвращает дерево в окно после того, как его увели', async ({ page }) => {
    await openBranches(page, 'split-track');

    const space = await page.getByTestId('branches-space').boundingBox();
    await page.mouse.move(space!.x + space!.width / 2, space!.y + space!.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -600);
    await page.mouse.wheel(0, -600);
    await page.keyboard.up('Control');

    await page.getByTestId('branches-fit').click();

    const box = await page.getByTestId('branch-row-s-right').boundingBox();
    expect(box).not.toBeNull();
    // Нижняя ветка целиком внутри окна по вертикали — это и значит «вписано».
    expect(box!.y).toBeGreaterThanOrEqual(space!.y - 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(space!.y + space!.height + 1);
  });
});

test.describe('вид «Ветки»: вилка длительностей и вынос в ветку', () => {
  /**
   * `branches.md` §8: одного числа у объяснения нет, показывается вилка.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: считать длительность одним числом (например,
   * суммой всех глав) — вилка исчезнет или станет неверной.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. `conditions` даёт РАЗНЫЕ концы
   * (8.04 и 8.544 секунды), а `split-track` — совпадающие, и вид обязан
   * различать эти два случая словами.
   */
  test('вилка показывается там, где концы разные, и одно число там, где совпали', async ({ page }) => {
    await openBranches(page, 'conditions');
    await expect(page.getByTestId('branches-range')).toHaveText(/от .* до /);

    await openBranches(page, 'split-track');
    await expect(page.getByTestId('branches-range')).toHaveText(/Длительность/);
  });

  /**
   * Операция целиком, глазами автора: выделил главу, нажал кнопку, увидел
   * ветку, в которую зритель не попадёт, пока её не подключат.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: не смыкать основную линию (глава останется
   * достижимой, пометки сироты не будет) либо не показывать сирот в дереве
   * вовсе (главы ИСЧЕЗНУТ с экрана — тихий дефект, ради которого сироты
   * и заведены).
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет — до нажатия пометки нет, и это
   * проверяется тут же.
   */
  test('«вынести в ветку» отцепляет главу и честно помечает её', async ({ page }) => {
    await openBranches(page, 'conditions');

    await expect(page.getByTestId('branch-orphan-s-count')).toHaveCount(0);

    await page.getByTestId('chapter-pick-s-count').click();
    await expect(page.getByTestId('branches-extract')).toBeEnabled();
    await page.getByTestId('branches-extract').click();

    await expect(page.getByTestId('branch-orphan-s-count')).toBeVisible();
    await expect(page.getByTestId('branch-orphan-s-count')).toContainText('зритель не попадёт');
  });

  /**
   * Отказ показывается СТРОКОЙ, а не только подсказкой при наведении:
   * проект измерял, что на подсказки не смотрят, и однажды это дало три
   * зелёных проверки при пустом экране.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: убрать шестую причину отказа (`extractBranch.ts`
   * спрашивает схему, законен ли результат) — кнопка станет доступной,
   * и вынос дал бы незагружаемый проект.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Соседний тест выше показывает
   * вынос, который РАЗРЕШЁН, на той же фикстуре.
   */
  test('запрещённый вынос гасит кнопку и называет причину видимой строкой', async ({ page }) => {
    await openBranches(page, 'conditions');

    await page.getByTestId('chapter-pick-s-end').click();

    await expect(page.getByTestId('branches-extract')).toBeDisabled();
    await expect(page.getByTestId('branches-extract-why')).toBeVisible();
    await expect(page.getByTestId('branches-extract-why')).toContainText('развилка');
  });
});

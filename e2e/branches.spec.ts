/**
 * Вид «Ветки»: устройство рассказа плитками глав (`branches.md` §3, §5).
 *
 * Несущих свойств здесь два, и оба ломаются тихо:
 *
 *   ХОЛСТ НЕ ГАСНЕТ ни в одном виде. Это решение владельца 13.08.2026
 *   и причина, по которой полноэкранный режим карты отвергнут целиком
 *   (`map.md` отменён). Проверка «переключатель переключился» была бы
 *   зелёной и на реализации, закрывающей холст;
 *
 *   ШИРИНА ПЛИТКИ РАВНА ДЛИТЕЛЬНОСТИ ГЛАВЫ. Ради этого вид и заводился:
 *   автор видит пропорции, не читая цифр. Проверка «плитки разной ширины»
 *   была бы зелёной при любых различных числах, поэтому сверяются ОТНОШЕНИЯ.
 *
 * Цепочка глав строится тем же способом, каким её построит автор: фикстуры
 * проекта ветвятся с первой же главы (проверено прогоном — и `exit-branch`,
 * и `split-track` дают ровно одну главу основной ветки), поэтому цепочку
 * надо СДЕЛАТЬ разрезом, а не искать готовую.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

/** Режет текущую главу в долях её дорожки — так же, как это делает человек. */
async function splitAt(page: Page, ratio: number): Promise<void> {
  const lane = await page.getByTestId('track-lane').boundingBox();
  if (!lane) throw new Error('дорожка не видна');
  await page.mouse.click(lane.x + lane.width * ratio, lane.y + lane.height / 2);
  await expect(page.getByTestId('split-here')).toBeEnabled();
  await page.getByTestId('split-here').click();
}

const segmentsOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as {
      __project: { segments: { id: string; title: string; audio: { duration: number } }[] };
    }).__project.segments.map((segment) => ({
      id: segment.id,
      title: segment.title,
      duration: segment.audio.duration,
    })));

const tilesOf = (page: Page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="chapter-tile-"]')).map((node) => ({
      id: node.dataset['testid']!.replace('chapter-tile-', ''),
      width: node.getBoundingClientRect().width,
    })));

test.describe('нижняя зона: два вида, один переключатель', () => {
  /**
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: любая реализация, прячущая холст под нижнюю зону
   * или закрывающая его на время вида «Ветки».
   *
   * Проверяется не «холст в DOM», а что у него ЕСТЬ ВЫСОТА и сцена в нём
   * видна: узел с нулевой высотой остался бы в DOM и прошёл бы проверку
   * на наличие.
   */
  test('холст не гаснет при переходе в «Ветки» — и это несущее свойство', async ({ page }) => {
    const errors = await openEditor(page, 'exit-branch');

    const before = await page.locator('.ed-stage-host').boundingBox();
    expect(before!.height, 'холст обязан быть виден до переключения').toBeGreaterThan(0);

    await page.getByTestId('view-branches').click();
    await expect(page.getByTestId('branches-view')).toBeVisible();

    const after = await page.locator('.ed-stage-host').boundingBox();
    expect(after!.height, 'холст погас в виде «Ветки»').toBeGreaterThan(0);
    // Сцена не просто есть, а рисуется: элементы фикстуры на месте.
    await expect(page.locator('.ed-stage-host [data-id]').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('переключение обратно возвращает дорожку', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    await page.getByTestId('view-branches').click();
    await expect(page.getByTestId('track-lane')).toHaveCount(0);

    await page.getByTestId('view-tracks').click();
    await expect(page.getByTestId('track-lane')).toBeVisible();
    await expect(page.getByTestId('branches-view')).toHaveCount(0);
  });

  /**
   * Сессия 43 заменила предмет этого теста. Была одна помета «развилка →»
   * на конце единственной показанной полосы — заглушка на время, пока веток
   * не рисовали. Стали настоящие ветки, и у каждой свой хвост.
   *
   * Утверждение при этом усилилось, а не ослабло: раньше проверялось, что
   * лента не обрывается МОЛЧА, теперь — что за развилкой видно, КУДА рассказ
   * расходится, и обе ветки на месте.
   */
  test('за развилкой видны обе ветки, и у каждой свой хвост', async ({ page }) => {
    // exit-branch ветвится с первой же главы: ветка кончается здесь, и автор
    // обязан узнать почему, а не решить, что рассказ на этом всё.
    await openEditor(page, 'exit-branch');
    await page.getByTestId('view-branches').click();

    await expect(page.getByTestId('branch-row-s-right')).toBeVisible();
    await expect(page.getByTestId('branch-row-s-left')).toBeVisible();
    await expect(page.getByTestId('branch-tail-s-right')).toBeVisible();
    await expect(page.getByTestId('branch-tail-s-left')).toBeVisible();
  });
});

test.describe('плитки глав: ширина равна длительности', () => {
  /**
   * ГЛАВНЫЙ ТЕСТ ВИДА.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ: возврат равных ширин из `tileWidths`.
   * ВЕРНО ЛИ ПРИ ЛЮБОЙ РЕАЛИЗАЦИИ: нет. Сверяется ДОЛЯ ширины с ДОЛЕЙ
   * длительности — утверждение, ложное для равных плиток и для любой
   * пропорции, кроме верной. Проверка «ширины различны» была бы зелёной
   * при любых различных числах.
   */
  test('доля ширины плитки совпадает с долей длительности главы', async ({ page }) => {
    const errors = await openEditor(page, 'demo');

    // Строим цепочку из трёх глав двумя разрезами. Доли выбраны разными,
    // чтобы равные ширины отличались от верных заметно.
    await splitAt(page, 0.6);
    await splitAt(page, 0.4);

    const segments = await segmentsOf(page);
    expect(segments.length, 'два разреза обязаны были дать три главы').toBe(3);

    await page.getByTestId('view-branches').click();
    await expect(page.getByTestId('branches-view')).toBeVisible();

    const tiles = await tilesOf(page);
    expect(tiles.length, 'в основной ветке обязаны быть все три главы').toBe(3);

    const byId = new Map(segments.map((segment) => [segment.id, segment]));
    const widthTotal = tiles.reduce((sum, tile) => sum + tile.width, 0);
    const secondsTotal = tiles.reduce((sum, tile) => sum + byId.get(tile.id)!.duration, 0);

    for (const tile of tiles) {
      const widthShare = tile.width / widthTotal;
      const timeShare = byId.get(tile.id)!.duration / secondsTotal;
      expect(
        widthShare,
        `плитка «${tile.id}» занимает ${(widthShare * 100).toFixed(1)} % ширины `
        + `при ${(timeShare * 100).toFixed(1)} % длительности`,
      ).toBeCloseTo(timeShare, 2);
    }

    // Промежуточная проверка «пропорция ЕСТЬ»: при равных длительностях
    // совпадение долей было бы тождеством, и тест ничего не держал бы.
    const shares = tiles.map((tile) => byId.get(tile.id)!.duration);
    expect(Math.max(...shares) / Math.min(...shares), 'главы вышли равными — пропорцию не на чем проверить')
      .toBeGreaterThan(1.2);
    expect(errors).toEqual([]);
  });

  test('щелчок по плитке показывает эту главу на холсте', async ({ page }) => {
    await openEditor(page, 'demo');
    await splitAt(page, 0.5);
    await page.getByTestId('view-branches').click();

    const segments = await segmentsOf(page);
    const second = segments.find((segment) => segment.id !== 'node-1')!;

    await page.getByTestId(`chapter-pick-${second.id}`).click();

    // Холст показывает именно её: текущая глава в состоянии редактора сменилась,
    // а плитка стала выделенной. Проверяется ВИДИМЫЙ признак, а не только
    // состояние: выделение — это то, по чему автор понимает, где он.
    await expect(page.getByTestId(`chapter-tile-${second.id}`)).toHaveClass(/ed-chapter-tile--current/);
    await expect(page.locator('.ed-stage-host [data-id]').first()).toBeVisible();
  });

  test('двойной щелчок переименовывает главу, и имя доезжает до проекта', async ({ page }) => {
    await openEditor(page, 'demo');
    await page.getByTestId('view-branches').click();

    const before = (await segmentsOf(page))[0]!;
    await page.getByTestId(`chapter-pick-${before.id}`).dblclick();

    const input = page.getByTestId(`chapter-rename-${before.id}`);
    await expect(input, 'двойной щелчок обязан открыть правку имени').toBeVisible();
    await input.fill('Введение');
    await input.press('Enter');

    // Имя видно на плитке...
    await expect(page.getByTestId(`chapter-pick-${before.id}`)).toHaveText('Введение');
    // ...и доехало до проекта, а не осталось в поле ввода.
    const after = (await segmentsOf(page)).find((segment) => segment.id === before.id)!;
    expect(after.title, 'имя не доехало до проекта').toBe('Введение');
  });

  test('пустое имя не принимается: плитка без подписи ничего не говорит автору', async ({ page }) => {
    await openEditor(page, 'demo');
    await page.getByTestId('view-branches').click();

    const before = (await segmentsOf(page))[0]!;
    await page.getByTestId(`chapter-pick-${before.id}`).dblclick();
    const input = page.getByTestId(`chapter-rename-${before.id}`);
    await input.fill('   ');
    await input.press('Enter');

    const after = (await segmentsOf(page)).find((segment) => segment.id === before.id)!;
    expect(after.title, 'пробелы приняты за имя').toBe(before.title);
  });
});

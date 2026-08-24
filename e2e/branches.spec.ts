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

/**
 * Режет текущую главу в долях её дорожки — так же, как это делает человек.
 * Кнопка «разделить здесь» убрана в Сессии 55: разрез — пункт меню правой
 * кнопки по пустому месту дорожки (`ctxmenu-split-here`), и правый щелчок
 * сам перематывает головку в точку щелчка.
 */
async function splitAt(page: Page, ratio: number): Promise<void> {
  const lane = await page.getByTestId('track-lane').boundingBox();
  if (!lane) throw new Error('дорожка не видна');
  await page.mouse.click(lane.x + lane.width * ratio, lane.y + lane.height / 2, { button: 'right' });
  await expect(page.getByTestId('ctxmenu-split-here')).toHaveAttribute('aria-disabled', 'false');
  await page.getByTestId('ctxmenu-split-here').click();
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

test.describe('плитки глав: длиннее глава — шире плитка', () => {
  /**
   * ГЛАВНЫЙ ТЕСТ ВИДА.
   *
   * ПРАВИЛО ИЗМЕНЕНО ВЛАДЕЛЬЦЕМ 24.08.2026. Было: ширина плитки прямо
   * пропорциональна длительности, и тест сверял доли. Прямая пропорция
   * ломается на живых проектах с обоих концов — «если в одном проекте
   * плитка час, а в другом пару минут» — поэтому шкала стала корневой:
   *
   *   width = MIN + (MAX − MIN) × √(seconds / longest)
   *
   * Проверять доли больше НЕЛЬЗЯ: они и не должны совпадать, в этом весь
   * смысл правки. Проверяются два свойства, которые правило обязано
   * держать и которые ложны при подмене ширин на равные:
   *
   * Здесь проверяется ОДНО: длиннее глава — шире плитка, строго, для каждой
   * пары. Это то, что автор читает глазами, и это ложно при равных ширинах.
   *
   * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ — два утверждения, которые я написал и убрал,
   * потому что слом оставил их зелёными:
   *
   *   «разброс ширин меньше разброса длительностей» — истинно и при
   *   линейной шкале: сдвиг на минимум сжимает разброс сам по себе;
   *
   *   «самая узкая плитка не уже 34 px» — истинно и при прежнем правиле
   *   «секунды × 10»: главы этой фикстуры по 11–17 секунд, и прежнее
   *   правило давало им 116 и 175 px.
   *
   * Оба были бы декоративными: называют одно, держат другое.
   *
   * ФОРМА ШКАЛЫ И ПОЛ охраняются там, где им и место, — в юнит-тесте
   * `branchLayout.test.ts` литералами, посчитанными руками: 209.0588
   * и 144.7169 (линейная шкала дала бы 169.6 и 88.24) и ровно 34
   * у главы нулевой длительности.
   *
   * ЧТО ДОЛЖНО СЛОМАТЬСЯ ЗДЕСЬ: равные ширины или перепутанный знак.
   * Проверено сломом: подстановка постоянной доли даёт «глава «segment-2»
   * длиннее «node-1» (17.50 против 11.66 с), а плитка у неё не шире».
   */
  test('длиннее глава — шире плитка, для каждой пары', async ({ page }) => {
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
    const measured = tiles.map((tile) => ({
      id: tile.id,
      width: tile.width,
      seconds: byId.get(tile.id)!.duration,
    }));

    // Положительный контроль: длительности РАЗНЫЕ. При равных обе проверки
    // ниже стали бы тождествами и не держали бы ничего.
    const secondsList = measured.map((m) => m.seconds);
    const secondsSpread = Math.max(...secondsList) / Math.min(...secondsList);
    expect(secondsSpread, 'главы вышли равными — сравнивать не на чем')
      .toBeGreaterThan(1.2);

    // Порядок: длиннее глава — шире плитка, для КАЖДОЙ пары.
    for (const a of measured) {
      for (const b of measured) {
        if (a.seconds <= b.seconds) continue;
        expect(
          a.width,
          `глава «${a.id}» длиннее «${b.id}» (${a.seconds.toFixed(2)} против `
          + `${b.seconds.toFixed(2)} с), а плитка у неё не шире: ${a.width} против ${b.width}`,
        ).toBeGreaterThan(b.width);
      }
    }

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
    // Имя читается из ПОДСКАЗКИ плитки: с 25.08.2026 на самой плитке текста
    // нет вовсе, только номер (решение владельца — имя там было третьим
    // повторением одной строки и на узких плитках давало обломок).
    // Полное имя достаётся подсказкой и карточкой по правой кнопке;
    // карточку отдельно охраняет `editor-branch-name.spec.ts`.
    await expect(page.getByTestId(`chapter-pick-${before.id}`))
      .toHaveAttribute('title', /Введение/);
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

/**
 * МЕТКА ГЛАВЫ: автор сам красит плитку и даёт ей знак (схема v16).
 *
 * Решение владельца 25.08.2026: «нужно научить юзера самому отличать плитки
 * как ему надо, чтобы он мог сам красить или не красить и сам давать имена,
 * а мы будем просто такой вот как сейчас дефолт давать».
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ: правка метки перестаёт
 * доходить до проекта; цвет не доезжает до плитки (класс есть, а заливка
 * прежняя — так уже было: базовое правило стояло НИЖЕ цветных и молча
 * их перебивало); знак не заменяет номер. Проверено сломом.
 *
 * Проверяется И проект, И экран. Только проект — и «покрасил» осталось бы
 * зелёным при невидимом цвете; только экран — и правка могла бы не дойти
 * до файла.
 */
test.describe('метка главы: цвет и знак', () => {
  test('автор красит плитку и подписывает её, и это доходит до проекта и до экрана', async ({ page }) => {
    const errors = await openEditor(page, 'showcase');
    await page.getByTestId('view-branches').click();
    await expect(page.getByTestId('branches-view')).toBeVisible();

    // Заранее снимаем метку, чтобы тест не зависел от того, что лежит
    // в фикстуре: он проверяет ДЕЙСТВИЕ автора, а не начальное состояние.
    await page.getByTestId('chapter-pick-s-yes').click({ button: 'right' });
    await expect(page.getByTestId('chapter-card')).toBeVisible();
    await page.getByTestId('chapter-color-none').click();
    await page.getByTestId('chapter-badge-text').fill('');
    await page.getByTestId('chapter-badge-text').blur();

    const cleared = await badgeOf(page, 's-yes');
    expect(cleared, 'метка не снялась — дальше проверялось бы не то').toBeNull();
    const plainFill = await fillOf(page, 's-yes');
    await expect(
      page.getByTestId('chapter-pick-s-yes'),
      'без метки на плитке обязан остаться номер',
    ).toHaveText(/^\d+$/);

    // Красим и подписываем.
    await page.getByTestId('chapter-color-violet').click();
    await page.getByTestId('chapter-badge-text').fill('Ага');
    await page.getByTestId('chapter-badge-text').blur();

    // 1. Доехало до проекта — обе половины сразу, а не по одной.
    const saved = await badgeOf(page, 's-yes');
    expect(saved, 'метка не доехала до проекта').toEqual({ color: 'violet', text: 'Ага' });

    // 2. Доехало до экрана: знак вместо номера.
    await expect(
      page.getByTestId('chapter-pick-s-yes'),
      'знак автора не заменил номер на плитке',
    ).toHaveText('Ага');

    // 3. Доехало до экрана: заливка ДЕЙСТВИТЕЛЬНО сменилась. Сравнение
    // с прежним фоном, а не с записанным цветом: записанный оттенок
    // закрепил бы сегодняшнюю тему как требование.
    const paintedFill = await fillOf(page, 's-yes');
    expect(
      paintedFill,
      `заливка не изменилась: было ${plainFill}, стало ${paintedFill} — класс цвета есть, а цвета нет`,
    ).not.toBe(plainFill);

    expect(errors).toEqual([]);
  });
});

/** Метка главы из живого проекта. `null` — метки нет. */
async function badgeOf(page: Page, id: string): Promise<unknown> {
  return page.evaluate((segmentId) => {
    const project = (window as unknown as {
      __project: { segments: { id: string; badge?: unknown }[] };
    }).__project;
    return project.segments.find((segment) => segment.id === segmentId)?.badge ?? null;
  }, id);
}

/** Вычисленная заливка плитки — то, что видит автор, а не то, что записано. */
async function fillOf(page: Page, id: string): Promise<string> {
  return page.evaluate((segmentId) => {
    const tile = document.querySelector(`[data-testid="chapter-tile-${segmentId}"]`);
    if (!tile) throw new Error(`плитки «${segmentId}» нет на доске`);
    return getComputedStyle(tile).backgroundColor;
  }, id);
}

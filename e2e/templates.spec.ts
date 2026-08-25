/**
 * Срез 3 (заход 2): шаблоны сцены.
 *
 * Нажатие по видимой кнопке — не вызов `applyTemplate` в обход интерфейса:
 * так же, как и остальные e2e этой сессии, тест кликает там, где кликнул бы
 * автор, и проверяет то, что реально появилось на сцене и на дорожке.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('шаблоны сцены', () => {
  test('«Вопрос с вариантами»: элементы и гейт появляются, один Ctrl+Z убирает шаблон целиком', async ({
    page,
  }) => {
    await openEditor(page, 'empty');

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(0);

    await page.getByTestId('template-question').click();

    // Шаблон «question» кладёт три элемента (вопрос + два варианта) и один гейт.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(3);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(1);

    await page.keyboard.press('Control+z');

    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="mark-gate-"]')).toHaveCount(0);
  });

  test('каждая кнопка шаблона добавляет хотя бы один элемент на чистой сцене', async ({ page }) => {
    const ids = ['title', 'title-text', 'two-columns', 'bullets', 'question'];

    for (const id of ids) {
      await openEditor(page, 'empty');
      await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(0);
      await page.getByTestId(`template-${id}`).click();
      const count = await page.locator('.ed-stage-host [data-id]').count();
      expect(count, `шаблон «${id}» обязан добавить хотя бы один элемент`).toBeGreaterThan(0);
    }
  });
});

/**
 * ЗАГОТОВКА КЛАДЁТ ЭЛЕМЕНТЫ НА ВСЕ КАДРЫ ГЛАВЫ, А НЕ НА ПЕРВЫЙ.
 *
 * Куплено жалобой владельца 25.08.2026: «полный бред… до ромбика видно
 * заголовок без подзаголовка, а на ромбике видно и то и то… почему так
 * много нелогичностей».
 *
 * Физика дефекта: `applyTemplate` писала состояния только в `slides[0]`,
 * а кадр появления получал их ПОБОЧНО — он рождается копией предыдущего
 * кадра, и на пустой главе предыдущим оказывался как раз первый. Стоило
 * кадру появиться раньше заготовки, и элементы не доезжали никуда.
 *
 * Замер до починки, глава из трёх кадров (0 / 0.5 / 20), плитка «Заголовок»:
 * `text-3` лёг ТОЛЬКО на кадр 0 — то есть заголовок был виден полсекунды
 * и пропадал навсегда. Второе нажатие ЛЮБОЙ плитки давало то же самое.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ. Верни запись в один `slides[0]` — покраснеют оба
 * теста ниже, каждый на своём пути: повторное нажатие и заготовка поверх
 * уже собранной главы.
 */
test.describe('заготовка поверх уже собранной главы', () => {
  const idsPerSlide = async (page: Page): Promise<string[][]> => page.evaluate(() => {
    const segment = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, unknown> }[] }[] };
    }).__project.segments[0]!;
    return segment.slides.map((slide) => Object.keys(slide.states).sort());
  });

  test('второе нажатие той же плитки: элементы есть на КАЖДОМ кадре', async ({ page }) => {
    await openEditor(page, 'sandbox');

    await page.getByRole('button', { name: 'Обложка' }).click();
    const afterFirst = await idsPerSlide(page);
    expect(afterFirst, 'заготовка не завела второй кадр — проверять нечего').toHaveLength(2);

    await page.getByRole('button', { name: 'Обложка' }).click();
    const afterSecond = await idsPerSlide(page);

    expect(afterSecond, 'кадров стало не два — натура теста другая').toHaveLength(2);
    expect(afterSecond[1], 'на кадре появления не хватает элементов второй заготовки')
      .toEqual(afterSecond[0]);
    // Положительный контроль: элементы правда добавились, а не «сошлись пустыми».
    expect(afterSecond[0]!.length).toBe(afterFirst[0]!.length + 2);
  });

  test('заготовка в главу с кадрами: элемент не пропадает на следующем кадре', async ({ page }) => {
    await openEditor(page, 'sandbox');

    await page.getByRole('button', { name: 'Обложка' }).click();

    // Автор ставит свой кадр дальше по главе — обычное дело.
    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.4, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить слайд здесь' }).click();

    const before = await idsPerSlide(page);
    expect(before, 'кадров должно стать три').toHaveLength(3);

    await page.getByRole('button', { name: 'Заголовок', exact: true }).click();

    const after = await idsPerSlide(page);
    const added = after[0]!.filter((id) => !before[0]!.includes(id));
    expect(added, 'заготовка не добавила ни одного элемента').not.toEqual([]);

    for (const [index, ids] of after.entries()) {
      for (const id of added) {
        expect(ids, `элемент «${id}» пропал на кадре №${index + 1}: он мигнёт и исчезнет`)
          .toContain(id);
      }
    }
  });
});

/**
 * ЭЛЕМЕНТ, ПОЛОЖЕННЫЙ АВТОРОМ, НЕ ИСЧЕЗАЕТ НА СЛЕДУЮЩЕМ КАДРЕ.
 *
 * Тот же закон, что у заготовок выше, в самом ходовом месте — кнопка
 * «Фигура». Замер до починки: глава, собранная плиткой «Обложка» (кадры
 * 0 и 0.5), фигура положена на нуле. Было `first: text-1,text-2,shape-1`
 * и `slide-1: text-1,text-2` — фигура пропадала через полсекунды.
 *
 * «Элемента нет в состояниях кадра» означает «его нет на сцене» (ADR-015),
 * поэтому это был не косметический промах, а исчезновение.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: верни запись в один кадр в `addElement`
 * (state/project.ts) — тест покраснеет на втором кадре.
 */
test('фигура, положенная автором, остаётся на следующем кадре', async ({ page }) => {
  await openEditor(page, 'sandbox');

  await page.getByRole('button', { name: 'Обложка' }).click();

  const before = await page.evaluate(() =>
    (window as unknown as { __project: { segments: { slides: unknown[] }[] } })
      .__project.segments[0]!.slides.length);
  expect(before, 'заготовка не завела второй кадр — исчезать было бы негде').toBe(2);

  await page.getByTestId('rail-shapes').click();
  await page.getByTestId('insert-shape').click();

  const perSlide = await page.evaluate(() =>
    (window as unknown as {
      __project: { segments: { slides: { states: Record<string, unknown> }[] }[] };
    }).__project.segments[0]!.slides.map((slide) => Object.keys(slide.states)));

  const added = perSlide[0]!.filter((id) => id.startsWith('shape'));
  expect(added, 'фигура не добавилась — проверять нечего').toHaveLength(1);
  expect(perSlide[1], 'фигура пропала на втором кадре: автор увидит её полсекунды')
    .toContain(added[0]!);
});

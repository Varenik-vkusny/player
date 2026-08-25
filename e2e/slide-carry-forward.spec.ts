/**
 * Правка катится вперёд — путь автора целиком, в браузере.
 *
 * Юниты рядом (`packages/editor/test/slides.test.ts`) проверяют правило
 * на голых данных. Здесь проверяется ТО ЖЕ САМОЕ на настоящем пути, которым
 * владелец в это и упёрся: плитка «Обложка» → потянуть заголовок мышью.
 *
 * Почему одного юнита мало: между жестом и правилом лежит весь редактор —
 * какой кадр считается текущим, куда смотрит головка, какой патч соберёт
 * жест. Юнит зелен и при том, что жест шлёт правку не в тот кадр.
 */
import { expect, test, type Page } from '@playwright/test';

interface Slide {
  readonly id: string;
  readonly at: { readonly t: number };
  readonly transition: string;
  readonly states: Record<string, { readonly x: number; readonly y: number; readonly visible: boolean }>;
}

async function openSandbox(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=sandbox', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

const slidesOf = async (page: Page): Promise<Slide[]> => page.evaluate(() => {
  const project = (window as unknown as { __project: { segments: { slides: Slide[] }[] } }).__project;
  return project.segments[0]!.slides;
});

test.describe('правка катится вперёд', () => {
  test('заготовка «Обложка»: поднятый заголовок НЕ съезжает обратно на втором кадре', async ({
    page,
  }) => {
    await openSandbox(page);

    await page.getByRole('button', { name: 'Обложка' }).click();

    /*
     * ПРЕДЫДУЩИЙ ШАГ СОСТОЯЛСЯ, и проверить это обязательно: не примени
     * заготовка второй кадр — сползать было бы нечему, и тест остался бы
     * зелёным при полностью выключенном правиле.
     */
    const before = await slidesOf(page);
    expect(before, 'заготовка не завела второй кадр — тесту нечего проверять').toHaveLength(2);
    expect(before[0]!.states['text-1']!.y).toBe(before[1]!.states['text-1']!.y);

    // Второй кадр заготовка завела РАДИ ПОДЗАГОЛОВКА, и это его единственная
    // работа. Если различие пропадёт, кадр станет пустой копией, и правило
    // будет проверяться на бессмысленной натуре.
    expect(before[0]!.states['text-2']!.visible).toBe(false);
    expect(before[1]!.states['text-2']!.visible).toBe(true);

    const title = await page.evaluate(() => {
      const rect = document.querySelector('.ed-stage-scroll [data-id="text-1"]')!.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });

    // Тянем заголовок вверх настоящей мышью: тело элемента ловит контейнер
    // сцены, а не сам узел, поэтому `locator.dragTo` тут не годится.
    await page.mouse.move(title.x, title.y);
    await page.mouse.down();
    await page.mouse.move(title.x, title.y - 60);
    await page.mouse.move(title.x, title.y - 120);
    await page.mouse.up();

    const after = await slidesOf(page);
    const first = after[0]!.states['text-1']!.y;
    const second = after[1]!.states['text-1']!.y;

    expect(first, 'жест не сдвинул заголовок — проверять нечего').toBeLessThan(
      before[0]!.states['text-1']!.y,
    );
    expect(second, 'на втором кадре заголовок остался на старом месте: он съедет туда при показе')
      .toBe(first);

    // Подзаголовок правку не получал — его появление обязано уцелеть.
    expect(after[0]!.states['text-2']!.visible).toBe(false);
    expect(after[1]!.states['text-2']!.visible).toBe(true);
  });

  test('слайд, поставленный автором, рождается мгновенным — хвоста у метки нет', async ({ page }) => {
    await openSandbox(page);

    await page.getByRole('button', { name: 'Обложка' }).click();
    await expect(page.locator('[data-testid^="mark-slide-"]')).toHaveCount(1);

    /*
     * Хвост рисуется только там, где `morphSeconds > 0` (MarksLane), а тот
     * равен нулю ровно при `cut` (`morphSecondsFor`). Значит отсутствие узла
     * хвоста и есть «анимации нет», а не «хвост спрятали стилем».
     *
     * У кадра ЗАГОТОВКИ хвост как раз есть и должен быть: заготовка объявила
     * появление. Он и служит положительным контролем — без него зелень
     * означала бы «хвосты не рисуются вовсе».
     */
    const templateSlide = (await slidesOf(page))[1]!;
    expect(templateSlide.transition, 'кадр заготовки обязан остаться плавным').toBe('morph');
    await expect(page.locator(`[data-testid="mark-tail-${templateSlide.id}"]`)).toBeVisible();

    // Теперь ставим свой кадр: правый щелчок по пустому месту дорожки.
    const lane = await page.getByTestId('marks-lane').boundingBox();
    if (!lane) throw new Error('полосы меток не видно');
    await page.mouse.click(lane.x + lane.width * 0.4, lane.y + lane.height * 0.75, { button: 'right' });
    await page.getByRole('menuitem', { name: 'Поставить слайд здесь' }).click();

    const slides = await slidesOf(page);
    expect(slides, 'слайд не поставился — проверять нечего').toHaveLength(3);
    const mine = slides.find((slide) => slide.id !== 'first' && slide.id !== templateSlide.id)!;

    expect(mine.transition).toBe('cut');
    await expect(page.locator(`[data-testid="mark-tail-${mine.id}"]`)).toHaveCount(0);
  });
});

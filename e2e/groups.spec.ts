/**
 * Группы: рамка вокруг содержимого (Сессия 35).
 *
 * Проверяется здесь, а не юнитом, потому что предмет проверки — КОМПОЗИЦИЯ
 * трансформаций, а её делает CSS. Любая проверка юнитом была бы пересчётом
 * правил CSS своими руками — ровно ловушка «своим парсером свой формат
 * не проверяется».
 *
 * fixtures/projects/groups.json: три слайда.
 *   g-1 → g-2  группа ВДВОЕ растёт, дети растут вместе с ней;
 *   g-2 → g-3  группа ЕДЕТ, а локальные состояния детей побайтово те же.
 *
 * Второй переход — несущий: собственный FLIP ребёнка на нём вырождается
 * в ничто (from и to совпадают), поэтому поехать он может ИСКЛЮЧИТЕЛЬНО
 * вместе с родительским узлом. Плоский рендер здесь неотличим от сломанного.
 *
 * Окна переходов после разворота (ADR-020) кончаются НА метке: к g-2 сцена
 * едет по (0.4, 1.0), к g-3 — по (1.4, 2.0). Метки на 0/1/2 с,
 * transitionSeconds 0.6 задан в самой фикстуре, а не взят по умолчанию.
 */
import { expect, test, type Page } from '@playwright/test';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function openPreview(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto('/preview.html?fixture=groups&t=0&fonts=test', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'страница не должна открываться с ошибками').toEqual([]);
}

/** Ставит предпросмотр на момент и снимает экранный бокс элемента. */
async function rectAt(page: Page, seconds: number, id: string): Promise<Rect> {
  return page.evaluate(([t, elementId]) => {
    (window as unknown as { __preview: { seek(s: number): void } }).__preview.seek(t as number);
    const node = document.querySelector(`[data-id="${elementId as string}"]`);
    if (!(node instanceof HTMLElement)) throw new Error(`нет узла «${elementId as string}»`);
    const box = node.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }, [seconds, id] as const);
}

test.describe('группы', () => {
  /**
   * Дерево в DOM, а не плоский список. Здесь же проверяется обратное:
   * элемент верхнего уровня НЕ попадает внутрь группы — иначе «положить
   * всех подряд в последнюю группу» проходило бы этот тест.
   */
  test('ребёнок лежит внутри узла группы, а сосед верхнего уровня — нет', async ({ page }) => {
    await openPreview(page);

    const nesting = await page.evaluate(() => {
      const box = document.querySelector('[data-id="box"]');
      const kid = document.querySelector('[data-id="kid"]');
      const tag = document.querySelector('[data-id="tag"]');
      const solo = document.querySelector('[data-id="solo"]');
      if (!box || !kid || !tag || !solo) return { ready: false };
      return {
        ready: true,
        kidInside: box.contains(kid),
        tagInside: box.contains(tag),
        soloInside: box.contains(solo),
        kidIsDirectChild: kid.parentElement === box,
      };
    });

    expect(nesting.ready, 'все четыре узла обязаны быть на сцене').toBe(true);
    expect(nesting.kidInside, 'фигура-ребёнок обязана лежать внутри узла группы').toBe(true);
    expect(nesting.tagInside, 'текст-ребёнок обязан лежать внутри узла группы').toBe(true);
    expect(nesting.kidIsDirectChild, 'ребёнок — ПРЯМОЙ потомок группы').toBe(true);
    expect(nesting.soloInside, 'элемент верхнего уровня внутрь группы попасть не может').toBe(false);
  });

  /**
   * МИНА: двойной учёт масштаба.
   *
   * `scaleX` на узле группы пересчитывает всё поддерево, включая `left`
   * ребёнка, а ребёнок уже везёт собственный `scaleX`. В начале перехода
   * ребёнок оказывается ВДВОЕ уже, чем стоял, и ближе к левому краю группы.
   *
   * Тест сравнивает бокс ребёнка на устоявшемся слайде g-1 с его же боксом
   * в первые миллисекунды перехода. Пройдено 0.0167 окна, а с плавностью
   * inOutQuad — 0.056 % пути, то есть меньше десятой доли пикселя. Три
   * пикселя допуска — с огромным запасом; ошибка масштаба даёт разницу
   * в ширине около 66 px.
   */
  test('ребёнок в начале перехода стоит там же, где стоял на прошлом слайде', async ({ page }) => {
    await openPreview(page);

    const still = await rectAt(page, 0.2, 'kid');
    const atStart = await rectAt(page, 0.41, 'kid');

    expect(Math.abs(atStart.width - still.width), 'ширина ребёнка не имеет права скакнуть')
      .toBeLessThan(3);
    expect(Math.abs(atStart.height - still.height), 'высота ребёнка не имеет права скакнуть')
      .toBeLessThan(3);
    expect(Math.abs(atStart.x - still.x), 'ребёнок не имеет права переехать по X')
      .toBeLessThan(3);
    expect(Math.abs(atStart.y - still.y), 'ребёнок не имеет права переехать по Y')
      .toBeLessThan(3);
  });

  /**
   * Несущее свойство выбора «координаты детей — от группы»: группа едет,
   * дети едут с ней, хотя их собственные состояния на обоих слайдах
   * СОВПАДАЮТ. Двигать их некому, кроме родительского узла.
   */
  test('группа едет — дети едут с ней, не меняя своих состояний', async ({ page }) => {
    await openPreview(page);

    const early = await rectAt(page, 1.45, 'kid');
    const late = await rectAt(page, 1.95, 'kid');

    // Группа переезжает на 700 единиц сцены по X при масштабе 2/3 — это
    // около 467 экранных px. Порог 200 берёт заведомо меньше, чтобы тест
    // не зависел от того, сколько именно пути пройдено к 1.95.
    expect(late.x - early.x, 'ребёнок обязан уехать вправо вместе с группой')
      .toBeGreaterThan(200);
    expect(late.y - early.y, 'ребёнок обязан уехать вниз вместе с группой')
      .toBeGreaterThan(60);
    expect(Math.abs(late.width - early.width), 'размер ребёнка при переезде не меняется')
      .toBeLessThan(3);
  });

  /**
   * Конец перехода — точка, где картинка обязана совпасть со снимком слайда.
   * Проверяет вторую половину мины: неверная композиция ошибается на обоих
   * концах, а не только в начале.
   */
  test('к метке ребёнок приезжает ровно в своё место на слайде', async ({ page }) => {
    await openPreview(page);

    const arrived = await rectAt(page, 2.0, 'kid');
    const still = await rectAt(page, 2.4, 'kid');

    expect(Math.abs(arrived.x - still.x)).toBeLessThan(1);
    expect(Math.abs(arrived.y - still.y)).toBeLessThan(1);
    expect(Math.abs(arrived.width - still.width)).toBeLessThan(1);
  });
});

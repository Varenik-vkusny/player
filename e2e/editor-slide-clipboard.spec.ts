/**
 * Буфер обмена слайдов (ADR-025): «слайд переносит состояние, а не момент».
 * Кнопки ленты (`track/SlideStrip.tsx`) — Дублировать · Копировать ·
 * Вырезать · Вставить.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА — проверять СЦЕНУ, а не проект. В прошлой
 * сессии убранный со слайда элемент оставался на холсте: `states` в проекте
 * уже не содержали его, а зритель видел прежнюю картинку. Проверка «в
 * проекте поменялись states» была бы зелёной на сломанном продукте —
 * поймал дефект только тест, смотревший на `.ed-stage-host [data-id]`.
 * Поэтому чтение `window.__project` здесь встречается только как
 * вспомогательное (посчитать элементы части), а несущее утверждение каждого
 * теста — состав видимых `data-id` и видимый текст на сцене.
 */
import { expect, test, type Page } from '@playwright/test';

async function waitTransportReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  // Все действия здесь читают геометрию дорожки (freeSlideSpotSeconds,
  // seekTrack) — без готовой длительности транспорта её не посчитать.
  await waitTransportReady(page);
}

/** Перемотка нажатием по дорожке — так же, как это делает человек (см. e2e/marks.spec.ts). */
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

/**
 * Секунда, геометрически свободная от существующих МЕТОК СЛАЙДОВ.
 *
 * Не гейтов: `pasteProblem` (state/slides.ts) сверяется только с
 * `segment.slides` — гейт на пути вставке не мешает. Ищет по видимым ромбам
 * дорожки (`mark-slide-*`), а не по секундам, вычитанным из фикстуры:
 * числа в комментариях гниют (CLAUDE.md), а дорожка не может соврать о том,
 * где стоят её собственные метки. Первый слайд меткой не считается (см.
 * e2e/marks.spec.ts) и в `mark-slide-*` не попадает — граница 0 добавлена
 * явно.
 */
async function freeSlideSpotSeconds(page: Page): Promise<number> {
  const lane = await page.getByTestId('marks-lane').boundingBox();
  if (!lane) throw new Error('полоса меток не видна');
  const duration = await page.evaluate(
    () => (window as unknown as { __transport: { durationSeconds: number } }).__transport.durationSeconds,
  );
  const centres = await page.locator('[data-testid^="mark-slide-"]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    }),
  );
  const marks = centres
    .map((x) => ((x - lane.x) / lane.width) * duration)
    .sort((a, b) => a - b);
  const points = [0, ...marks, duration];

  let gapStart = 0;
  let gapSize = 0;
  for (let i = 1; i < points.length; i += 1) {
    const gap = points[i]! - points[i - 1]!;
    if (gap > gapSize) {
      gapSize = gap;
      gapStart = points[i - 1]!;
    }
  }
  expect(gapSize, 'на дорожке не нашлось свободного промежутка — тест не про то').toBeGreaterThan(0.5);
  return gapStart + gapSize / 2;
}

/** Состав видимой сцены — набор `data-id`, отсортированный для сравнения. */
async function stageIds(page: Page): Promise<string[]> {
  return page.locator('.ed-stage-host [data-id]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-id') ?? '').sort(),
  );
}

function stripCards(page: Page) {
  return page.locator('[data-testid^="strip-card-"]');
}

test.describe('буфер обмена слайдов', () => {
  test('копия внутри части видна на сцене тем же составом элементов', async ({ page }) => {
    await openEditor(page, 'demo');

    const originIds = await stageIds(page);
    expect(originIds.length, 'на исходном слайде нет элементов — сравнивать нечего').toBeGreaterThan(0);
    const cardsBefore = await stripCards(page).count();

    await page.getByTestId('slide-copy').click();

    const at = await freeSlideSpotSeconds(page);
    await seekTrack(page, at);
    await expect(page.getByTestId('slide-paste')).toBeEnabled();

    await page.getByTestId('slide-paste').click();

    await expect(stripCards(page), 'слайдов в ленте обязано стать на один больше').toHaveCount(cardsBefore + 1);
    // Несущее утверждение: сцена вставленного слайда несёт РОВНО тот же
    // набор элементов, что и исходный, — не просто «слайд появился».
    expect(await stageIds(page)).toEqual(originIds);
  });

  /**
   * Главный тест задания. Проверяет ADR-025 «слайд переносит состояние,
   * а не момент»: элемент из чужой части обязан физически появиться на
   * сцене целевой части, а не только в её `states`.
   */
  test('вставка между частями: элемент из чужой части приезжает и виден на сцене', async ({ page }) => {
    await openEditor(page, 'repeat');

    // s-a — часть входа (project.entry). Её единственный слайд несёт
    // bg-a/label-a («Кусок A»). Копируем его, пока он на экране.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
    await expect(page.locator('.ed-stage-host')).toContainText('Кусок A');
    await page.getByTestId('slide-copy').click();

    await page.getByTestId('segment-s-b').click();
    await waitTransportReady(page); // новый сегмент — новый источник звука, транспорт пересоздаётся

    // Родная сцена s-b: bg-b/label-b, «Кусок B» — до вставки её элементы не тронуты.
    await expect(page.locator('.ed-stage-host [data-id]')).toHaveCount(2);
    await expect(page.locator('.ed-stage-host')).toContainText('Кусок B');

    const elementsBefore = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { id: string; elements: unknown[] }[] } }).__project
          .segments.find((seg) => seg.id === 's-b')!.elements.length,
    );
    expect(elementsBefore, 's-b обязана начать с двух элементов — иначе тест не про то').toBe(2);

    // Свободное место: у s-b всего один слайд (на нуле), поэтому подойдёт
    // почти любая секунда внутри длительности — geometrически посчитанная,
    // а не подобранная на глаз.
    const at = await freeSlideSpotSeconds(page);
    await seekTrack(page, at);
    await expect(page.getByTestId('slide-paste')).toBeEnabled();

    await page.getByTestId('slide-paste').click();

    // Несущее утверждение: элемент ФИЗИЧЕСКИ нарисован на сцене, а не
    // только записан в states. Именно эту разницу прошлая сессия поймала
    // дефектом: данные меняются, холст — нет.
    await expect(page.locator('.ed-stage-host'), 'текст «Кусок A» обязан быть виден на сцене s-b')
      .toContainText('Кусок A');

    const ids = await stageIds(page);
    expect(
      ids,
      'на вставленном слайде обязано быть ровно bg-a и label-a — родные bg-b/label-b '
        + 'отсутствуют, потому что состояний у них на этом слайде нет (ADR-015)',
    ).toEqual(['bg-a', 'label-a']);

    const elementsAfter = await page.evaluate(
      () =>
        (window as unknown as { __project: { segments: { id: string; elements: unknown[] }[] } }).__project
          .segments.find((seg) => seg.id === 's-b')!.elements.length,
    );
    expect(elementsAfter, 'у части s-b в проекте обязано стать четыре элемента').toBe(4);
  });

  test('отказ вставки на занятую секунду объяснён видимым текстом, а не только погашенной кнопкой', async ({
    page,
  }) => {
    await openEditor(page, 'demo');

    // Буфер непустой — чтобы причина отказа была ровно про место, а не
    // смешивалась с «Буфер пуст».
    await page.getByTestId('slide-copy').click();

    // Второй слайд ленты: не первый (у первого своя причина «Начало части
    // занято»), клик по карточке ведёт головку ТОЧНО на его метку
    // (handleSelectSlide → transport.seek(markSeconds(...))).
    await stripCards(page).nth(1).click();

    await expect(page.getByTestId('slide-paste')).toBeDisabled();
    const note = page.getByTestId('slide-clipboard-note');
    await expect(note).toBeVisible();
    await expect(note).toContainText('уже стоит слайд');
  });

  /**
   * РЕГРЕССИЯ (найдена и починена в прошлой сессии): «Дублировать» одно
   * время была связана с тем же сигналом, что «Вставить», и гасла при
   * пустом буфере с причиной «Буфер пуст» — то есть автор не мог размножить
   * кадр, пока чего-нибудь не скопирует. `duplicateSlideAt` буфер автора не
   * читает вовсе (работает через свой временный `SlideClipboard`), логика
   * редьюсера была исправна — юнит-тест такой связки не поймал бы.
   *
   * Красный этот тест будет ровно тогда, когда «Дублировать» снова свяжут
   * с состоянием буфера.
   */
  test('«Дублировать» доступна при пустом буфере', async ({ page }) => {
    await openEditor(page, 'demo');
    // Буфер пуст с самого начала страницы: ничего не копировали и не вырезали.

    const at = await freeSlideSpotSeconds(page);
    await seekTrack(page, at);

    await expect(
      page.getByTestId('slide-duplicate'),
      'дублирование не читает буфер автора — обязано быть доступно и при пустом буфере',
    ).toBeEnabled();
    await expect(page.getByTestId('slide-paste')).toBeDisabled();
    await expect(page.getByTestId('slide-clipboard-note')).toContainText('Буфер пуст');

    const idsBefore = await stageIds(page);
    const cardsBefore = await stripCards(page).count();

    await page.getByTestId('slide-duplicate').click();

    await expect(stripCards(page)).toHaveCount(cardsBefore + 1);
    // Дубль — точная копия того, что было на сцене до нажатия.
    expect(await stageIds(page)).toEqual(idsBefore);
  });

  test('вырезание слайда — один шаг истории; отмена возвращает его слайдом и на сцену', async ({ page }) => {
    await openEditor(page, 'demo');

    const cards = stripCards(page);
    const cardsBefore = await cards.count();
    expect(cardsBefore, 'нужно хотя бы два слайда, чтобы вырезать не первый').toBeGreaterThan(1);

    // Второй слайд ленты: не первый и не единственный — cutProblem пуст.
    const target = cards.nth(1);
    const targetTestId = await target.getAttribute('data-testid');
    if (!targetTestId) throw new Error('у карточки слайда нет data-testid');
    await target.click();

    const targetIds = await stageIds(page);
    expect(targetIds.length, 'у вырезаемого слайда нет элементов — сравнивать нечего').toBeGreaterThan(0);

    await expect(page.getByTestId('slide-cut')).toBeEnabled();
    await page.getByTestId('slide-cut').click();

    await expect(cards, 'слайдов в ленте обязано стать на один меньше').toHaveCount(cardsBefore - 1);

    // Одно нажатие «Отменить» — вырезание обязано быть ОДНИМ шагом истории
    // (буфер и удаление внутри cutSlide — один вызов редьюсера).
    await page.getByRole('button', { name: 'Отменить', exact: true }).click();

    await expect(cards, 'слайд обязан вернуться в ленту').toHaveCount(cardsBefore);

    // Слайд вернулся — выбираем его снова и смотрим на СЦЕНУ, не на проект.
    await page.getByTestId(targetTestId).click();
    expect(await stageIds(page), 'на сцене обязано быть видно содержимое вернувшегося слайда')
      .toEqual(targetIds);
  });
});

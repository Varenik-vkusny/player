/**
 * Видео как ведомая картинка (ADR-028) — в настоящем браузере.
 *
 * Юнит-тесты (`packages/player/test/video.test.ts`) проверяют РЕШЕНИЕ о
 * записи на подставных узлах. Здесь проверяется то, чего они не видят:
 * что решение доходит до живого `<video>`, что шкала выбрана верная и что
 * гейт останавливает картинку.
 *
 * Фикстура `video` устроена так, чтобы главная мина была видима:
 * `audio.offset = 2`, то есть сегмент играет отрезок 2…6 с восьмисекундного
 * файла. При нулевом окне время сегмента и время дорожки совпадают, и
 * ЛЮБАЯ реализация выбора шкалы верна — тест был бы пуст по тождеству
 * (третий вид слепоты, docs/journal/session-36-journal.md §10).
 */
import { expect, test, type Page } from '@playwright/test';

/** Окно дорожки в фикстуре: сегмент начинается на 2-й секунде файла. */
const TRACK_OFFSET = 2;

/** Гейт стоит на 2-й секунде СЕГМЕНТА, то есть на 4-й секунде файла. */
const GATE_AT = 2;

async function openVideoFixture(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?fixture=video', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
  return errors;
}

const positionOf = (page: Page) =>
  page.evaluate(() => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds);

const videoState = (page: Page) =>
  page.evaluate(() => {
    const video = document.querySelector('[data-id="head"] video') as HTMLVideoElement | null;
    if (!video) throw new Error('видео-узел не найден в сцене');
    return { currentTime: video.currentTime, paused: video.paused, src: video.getAttribute('src') ?? '' };
  });

test.describe('видео ведомое', () => {
  test('идёт по шкале ДОРОЖКИ, а не сегмента', async ({ page }) => {
    await openVideoFixture(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    // Промежуточная проверка смотрит на ДРУГОЕ, чем предмет: предмет —
    // положение ВИДЕО, промежуточная — что ПЛЕЕР действительно поехал.
    // Иначе это было бы второе измерение того же самого (журнал С36 §12).
    await page.waitForFunction(
      () => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds > 0.8,
      undefined,
      { timeout: 15_000 },
    );

    const position = await positionOf(page);
    const video = await videoState(page);

    expect(position, 'замер должен попасть между стартом и гейтом').toBeLessThan(GATE_AT - 0.1);
    expect(video.paused, 'видео обязано играть, а не стоять на первом кадре').toBe(false);

    // Вот предмет: медиавремя картинки = время сегмента ПЛЮС окно дорожки.
    // Слом «передали #toSegmentTime вместо clock.position» даёт здесь
    // разницу ровно в TRACK_OFFSET, то есть 2 секунды при допуске 0.35.
    const expected = position + TRACK_OFFSET;
    expect(
      Math.abs(video.currentTime - expected),
      `видео на ${video.currentTime}, а дорожка на ${expected}`,
    ).toBeLessThan(0.35);
  });

  test('на гейте картинка замирает вместе со звуком', async ({ page }) => {
    await openVideoFixture(page);
    await page.getByRole('button', { name: 'Играть' }).click();

    // Промежуточная: гейт ДЕЙСТВИТЕЛЬНО открылся. Смотрит на оверлей —
    // не на видео, то есть не на предмет.
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const first = await videoState(page);
    expect(first.paused, 'на гейте видео обязано стоять').toBe(true);

    await page.waitForTimeout(600);
    const second = await videoState(page);

    // Инвариант №4: гейт останавливает ВСЁ сразу. Замерено, что за 1.2 с
    // остановки видео не уходит ни на миллисекунду.
    expect(
      Math.abs(second.currentTime - first.currentTime),
      'за 600 мс стояния картинка не имеет права уехать',
    ).toBeLessThan(0.05);
  });

  test('после гейта продолжает с той же позиции, а не с начала', async ({ page }) => {
    await openVideoFixture(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await expect(page.locator('#overlay[data-open="1"]')).toBeVisible({ timeout: 15_000 });

    const atGate = await videoState(page);
    // Промежуточная: остановка случилась там, где ожидалась, — иначе
    // «продолжил с той же позиции» проверялось бы от неизвестного места.
    expect(Math.abs(atGate.currentTime - (GATE_AT + TRACK_OFFSET))).toBeLessThan(0.35);

    await page.getByRole('button', { name: 'Дальше' }).click();
    await page.waitForFunction(
      () => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds > 2.4,
      undefined,
      { timeout: 15_000 },
    );

    const after = await videoState(page);
    expect(after.paused, 'после ответа видео обязано снова играть').toBe(false);
    // Перемотки не происходит никогда: продолжение идёт ВПЕРЁД от гейта.
    expect(after.currentTime).toBeGreaterThan(atGate.currentTime);
  });

  test('догоняет звук, если картинка грубо отстала', async ({ page }) => {
    await openVideoFixture(page);
    await page.getByRole('button', { name: 'Играть' }).click();
    await page.waitForFunction(
      () => (window as unknown as { __player: { positionSeconds: number } }).__player.positionSeconds > 0.6,
      undefined,
      { timeout: 15_000 },
    );

    // Имитируем залипший декодер: уводим картинку на секунду назад.
    // Это ровно тот случай, ради которого страховка существует, — за минуту
    // измерений порог не был превышен ни разу естественным путём.
    const knocked = await page.evaluate(() => {
      const video = document.querySelector('[data-id="head"] video') as HTMLVideoElement;
      video.currentTime = video.currentTime - 1;
      return video.currentTime;
    });

    // Промежуточная: сбой СОСТОЯЛСЯ. Без неё «догнал» был бы зелёным и
    // тогда, когда сбить не удалось вовсе (урок Сессии 33: Ctrl+Z оставался
    // зелёным при полностью отключённой вставке).
    const position = await positionOf(page);
    expect(
      knocked,
      'сбой не состоялся — тест ничего не проверил бы',
    ).toBeLessThan(position + TRACK_OFFSET - 0.5);

    await page.waitForTimeout(400);

    const recovered = await videoState(page);
    const nowExpected = (await positionOf(page)) + TRACK_OFFSET;
    expect(
      Math.abs(recovered.currentTime - nowExpected),
      `после сбоя видео на ${recovered.currentTime}, дорожка на ${nowExpected}`,
    ).toBeLessThan(0.35);
  });
});

test.describe('видео в круге', () => {
  test('узел обрезает содержимое, иначе углы кадра вылезают за круг', async ({ page }) => {
    await openVideoFixture(page);

    const box = await page.evaluate(() => {
      const node = document.querySelector('[data-id="head"]') as HTMLElement;
      const style = getComputedStyle(node);
      const video = node.querySelector('video');
      return {
        overflow: style.overflow,
        radius: style.borderRadius,
        hasVideo: video !== null,
        objectFit: video ? getComputedStyle(video).objectFit : null,
      };
    });

    expect(box.hasVideo, 'внутри узла должен быть настоящий <video>').toBe(true);
    // `border-radius` сам по себе потомков не режет — без обрезки прямые
    // углы кадра торчали бы за круг. Слом: снять overflow в рендерере.
    expect(box.overflow).toBe('hidden');
    expect(box.radius).toBe('50%');
    // Кадр 16:9 в круглом боксе: подстраивается кадр, бокс задаёт автор.
    expect(box.objectFit).toBe('cover');
  });
});

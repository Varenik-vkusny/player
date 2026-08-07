/**
 * Тяга дорожки за верхнюю кромку и складывание (задача 2.2).
 *
 * Фикстура — `transitions`, уже существующая (та же, что у track-zoom.spec.ts).
 * Новую фикстуру заводить нельзя (`e2e/fixtures.spec.ts` собирает список
 * `readdirSync`'ом каталога `fixtures/projects/`, и любой новый файл дал бы
 * пять новых скриншотных эталонов).
 *
 * Арифметика высот — из `tiers.ts` (модуль закрыт, значения не менялись):
 * TRANSPORT_H=40, SEPARATOR_H=1, LANE_H: ruler=24, sound=56/32(ужатая),
 * slides=34, stops=34, words=28, marks=40.
 *   minHeightOf('full')    = 40+24+56+34+34+28+4×1 = 220  (= TRACK_DEFAULT_H)
 *   minHeightOf('compact') = 40+24+32+34+34+28+4×1 = 196
 *   minHeightOf('dense')   = 40+24+32+34+34  +3×1 = 167  (расшифровки нет)
 *   minHeightOf('minimal') = 40+24+32+40      +2×1 = 138  (= TRACK_MIN_H)
 * Числа посчитаны отсюда, а НЕ импортированы из tiers.ts для сборки порогов
 * тестов ниже — иначе неверная константа подтверждала бы сама себя (грабля
 * Сессии 25: один юнит проверял COLLAPSE_PULL через саму константу).
 * Драги нарочно берутся с запасом относительно этих чисел.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => (window as unknown as { __transport?: { state: string } }).__transport?.state === 'ready',
    null,
    { timeout: 30_000 },
  );
}

/** Настоящий жест мышью по ручке: несколько промежуточных pointermove, не один клик. */
async function dragHandle(page: Page, deltaY: number): Promise<void> {
  const handle = await page.getByTestId('track-resize-handle').boundingBox();
  if (!handle) throw new Error('ручка тяги не видна');
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + deltaY / 2);
  await page.mouse.move(x, y + deltaY);
  await page.mouse.up();
}

test.describe('тяга дорожки за кромку: e2e', () => {
  /**
   * Что должно сломаться: `handleResizeMove` перестанет вызывать
   * `setTrack(resolveDrag(...))` (например, если жест останется только
   * прочитанным, но не применённым), или `resolveDrag` перестанет расти
   * при положительной дельте. Проверка ВИДИМАЯ — по наличию/отсутствию
   * полосы расшифровки в DOM (`bodyLanesOf`), а не по внутреннему состоянию
   * React, которое тест не видит и не должен видеть.
   */
  test('тяга вверх увеличивает дорожку и меняет ступень', async ({ page }) => {
    await openEditor(page, 'transitions');

    // Старт — TRACK_DEFAULT_H (220, ступень 'full'): расшифровка видна.
    await expect(page.getByTestId('track-words')).toHaveCount(1);

    // Вниз на 40px: 220 → 180, ступень 'dense' (167..195) — расшифровка
    // пропадает из DOM (bodyLanesOf('dense') её не включает).
    await dragHandle(page, 40);
    await expect(page.getByTestId('track-words'), 'на ступени dense расшифровка обязана исчезнуть').toHaveCount(0);

    // Вверх на 60px: 180 → 240 (с запасом выше порога full=220) —
    // расшифровка обязана вернуться.
    await dragHandle(page, -60);
    await expect(page.getByTestId('track-words'), 'тяга вверх обязана вернуть расшифровку').toHaveCount(1);
  });

  /**
   * Что должно сломаться: применение только части возвращённого
   * `resolveDrag()` (например, высота обновилась, а `collapsed` — нет, или
   * наоборот) — тогда транспорт и полосы остались бы в DOM с урезанной
   * высотой вместо корешка, либо корешок появился бы без часов.
   * Драг — 300px вниз, с большим запасом относительно порога складывания
   * (220 − (138−24) = 106), чтобы не зависеть от точного числа порога.
   */
  test('тяга далеко вниз складывает дорожку: видны часы, высота корешка 28px', async ({ page }) => {
    await openEditor(page, 'transitions');

    await dragHandle(page, 300);

    const collapsedRoot = page.getByTestId('track-collapsed');
    await expect(collapsedRoot).toBeVisible();

    const clock = page.getByTestId('track-clock');
    await expect(clock).toBeVisible();
    await expect(clock).toHaveText(/^\d{2}:\d{2}\.\d \/ \d{2}:\d{2}\.\d$/);

    const box = await collapsedRoot.boundingBox();
    if (!box) throw new Error('корешок не виден');
    expect(box.height, 'высота корешка обязана быть РОВНО 28px').toBe(28);

    // Транспорт и полосы — не просто визуально спрятаны, а НЕ смонтированы:
    // жест перемотки не должен оставаться доступным под корешком.
    await expect(page.locator('.ed-transport')).toHaveCount(0);
    await expect(page.locator('.ed-lanes')).toHaveCount(0);

    // Разворот кнопкой возвращает дорожку к прежнему виду.
    await page.getByTestId('track-expand').click();
    await expect(page.getByTestId('track-collapsed')).toHaveCount(0);
    await expect(page.locator('.ed-transport')).toBeVisible();
  });

  /**
   * Что должно сломаться: `onDoubleClick` на ручке отвязан от
   * `handleResizeDoubleClick`, либо обработчик не переключает `collapsed`
   * (например, если случайно вызывает `resolveDrag` от нулевой дельты вместо
   * простого тумблера).
   */
  test('двойной щелчок по ручке сворачивает и разворачивает дорожку', async ({ page }) => {
    await openEditor(page, 'transitions');
    await expect(page.getByTestId('track-collapsed')).toHaveCount(0);

    await page.getByTestId('track-resize-handle').dblclick();
    await expect(page.getByTestId('track-collapsed')).toBeVisible();

    await page.getByTestId('track-resize-handle').dblclick();
    await expect(page.getByTestId('track-collapsed')).toHaveCount(0);
    await expect(page.locator('.ed-transport')).toBeVisible();
  });

  /**
   * Что должно сломаться: голова линейки продолжает показывать пустую
   * строку на сжатой ступени (счётчик не подключён), либо показывает «0»
   * на полной ступени вместо пустой строки (не различает «скрывать нечего»
   * от «спрятано ноль» — tiers.ts различает их намеренно через `undefined`).
   * Число «2» — не из константы, а из состава полос tiers.ts: на 'full' их
   * пять (ruler/sound/slides/stops/words), на 'minimal' — три
   * (ruler/sound/marks), 5 − 3 = 2.
   */
  test('скрытая полоса называет себя: счётчик в голове линейки и текст в title', async ({ page }) => {
    await openEditor(page, 'transitions');

    const note = page.getByTestId('hidden-lanes-note');
    // На полной высоте скрывать нечего — голова линейки ПУСТАЯ, не «0».
    await expect(note).toHaveText('');
    await expect(note).toHaveAttribute('title', '');

    // 220 → 140: ступень 'minimal' (>= TRACK_MIN_H=138, ниже порога dense=167).
    await dragHandle(page, 80);

    await expect(
      note,
      'на ступени minimal скрыты 2 полосы: слайды/остановки слиты в одну, расшифровки нет',
    ).toHaveText('2');
    await expect(note).toHaveAttribute(
      'title',
      'Слайды и остановки слиты, расшифровка скрыта — потяните дорожку выше',
    );
  });

  /**
   * Что должно сломаться: ступень 'minimal' (слитая полоса меток — ровно
   * сегодняшнее поведение продукта, `.ed-mark-slide` и `.ed-mark-gate`
   * в одном полотне) недостижима или ломается при достижении — например,
   * если `marksBodyHeight('minimal')` разошлась бы с тем, что реально
   * рисует MarksLane, метки страницы вылезли бы за пределы своего тела
   * или пропали из DOM.
   */
  test('ступень minimal достижима: слитая полоса меток жива', async ({ page }) => {
    await openEditor(page, 'transitions');

    await dragHandle(page, 80); // 220 → 140, ступень 'minimal'

    // Голова полосы называется «Слайды и остановки» — ветка laneTitle
    // case 'marks', раньше недостижимая (тир всегда был 'full' до 2.2).
    await expect(page.locator('.ed-lane-head-title', { hasText: 'Слайды и остановки' })).toBeVisible();

    // Тело меток — то же полотно .ed-marks, что и на полной высоте: метки
    // слайдов и гейтов остаются в DOM и кликабельны.
    await expect(page.locator('[data-testid^="mark-slide-"]').first()).toBeVisible();
  });
});

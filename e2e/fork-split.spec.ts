/**
 * Развилка в редакторе: переключатель типа остановки и разрез повествования.
 *
 * Автор не должен знать про `correctId`, `exit` и «правила выхода». Он видит
 * две остановки — вопрос и развилку — и одно действие: разделить рассказ.
 * Правила выхода появляются сами.
 *
 * Нажимается ВИДИМАЯ кнопка панели, а не зовётся действие редьюсера: разрез
 * исправен и при панели, которая его не показывает, а автору от исправного
 * разреза без кнопки толку нет. Ровно этот класс дефекта уже находили —
 * гейт, чью метку невозможно нажать (known-bugs §7).
 *
 * fixtures/projects/exit-branch.json: одна остановка-развилка на второй
 * секунде, слайд только на нуле — метка остановки ничем не перекрыта.
 */
import { expect, test, type Page } from '@playwright/test';

import { loadProject } from '@player/core';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Состав частей проекта прямо из состояния редактора. */
const segmentsOf = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as {
      __project: { segments: { id: string; audio: { offset: number; duration: number } }[] };
    }).__project.segments.map((segment) => ({
      id: segment.id,
      offset: segment.audio.offset,
      duration: segment.audio.duration,
    })));

async function selectFork(page: Page): Promise<void> {
  await page.getByTestId('mark-gate-g-ask').click();
  await expect(page.getByTestId('mark-panel')).toBeVisible();
}

test.describe('панель остановки говорит про вопрос и развилку', () => {
  test('панель называется «Остановка», а не внутренним словом', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    await expect(page.getByTestId('mark-panel')).toContainText('Остановка');
    // «Гейт» — слово схемы. В интерфейсе его быть не должно (product.md §2).
    await expect(page.getByTestId('mark-panel')).not.toContainText('Гейт');
  });

  test('остановка без верного ответа показана как развилка', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // exit-branch хранит correctId: null — это развилка, и панель обязана
    // показать именно её, а не «вопрос, у которого почему-то нет верного».
    await expect(page.getByTestId('stop-kind')).toBeVisible();
    await expect(page.getByTestId('fork-hint')).toBeVisible();
  });

  test('у развилки не предлагают выбрать правильный вариант', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // Ровно та ложь, которую версия 4 убрала из данных: показывать её
    // на экране значило бы вернуть обратно.
    await expect(page.getByTestId('gate-option-correct-0')).toHaveCount(0);
  });

  test('переключение в «вопрос» возвращает выбор верного варианта', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    // По значению, а не по подписи: подпись — текст для человека, её правят
    // ради ясности, и тест не должен от этого краснеть.
    await page.getByLabel('Что это за остановка', { exact: true }).selectOption('question');

    await expect(page.getByTestId('gate-option-correct-0')).toBeVisible();
    await expect(page.getByTestId('fork-hint')).toHaveCount(0);
  });
});

test.describe('разрез повествования по развилке', () => {
  test('кнопка разреза делит часть: появляются ветки и продолжение', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);

    const before = await segmentsOf(page);
    expect(before.map((s) => s.id)).toEqual(['s-ask', 's-right', 's-left']);

    await page.getByTestId('gate-split').click();

    const after = await segmentsOf(page);
    // Исходная часть, две ветки, продолжение — и прежние две концовки.
    expect(after.length).toBe(before.length + 3);
  });

  test('продолжение звучит со своего окна того же файла', async ({ page }) => {
    await openEditor(page, 'exit-branch');
    await selectFork(page);
    await page.getByTestId('gate-split').click();

    const after = await segmentsOf(page);
    const head = after.find((segment) => segment.id === 's-ask')!;
    // Развилка стоит на второй секунде: голова кончается там, продолжение
    // с неё начинается. Файл при этом не режется — меняются только окна.
    expect(head.duration).toBeCloseTo(2, 3);
    const tail = after.find((segment) => segment.offset > 0);
    expect(tail, 'у продолжения ненулевое смещение окна').toBeTruthy();
    expect(tail!.offset).toBeCloseTo(2, 3);
  });

  test('разрезанный проект остаётся валидным и сохраняется', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openEditor(page, 'exit-branch');
    await selectFork(page);
    await page.getByTestId('gate-split').click();

    // Проект прогоняется через НАСТОЯЩУЮ загрузку, а не через флаг на window:
    // «спросить страницу, всё ли хорошо» — это проверка, которая зелена
    // и тогда, когда спрашивать нечего.
    const raw = await page.evaluate(() =>
      JSON.parse(JSON.stringify((window as unknown as { __project: unknown }).__project)));
    expect(() => loadProject(raw), 'разрезанный проект обязан грузиться').not.toThrow();

    const project = loadProject(raw);
    // Каждая ветка доводит зрителя дальше, а не в тупик: достижимость —
    // не то же самое, что целостность ссылок.
    const head = project.segments.find((segment) => segment.id === 's-ask')!;
    expect(head.exit.rules.length).toBe(2);
    for (const rule of head.exit.rules) {
      const branch = project.segments.find((segment) => segment.id === rule.goto);
      expect(branch, `ветка «${rule.goto}» существует`).toBeTruthy();
      expect(branch!.exit.default, `ветка «${rule.goto}» ведёт в продолжение`).not.toBeNull();
    }

    expect(errors, 'разрез не должен ронять редактор').toEqual([]);
  });
});

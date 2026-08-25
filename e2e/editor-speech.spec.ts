/**
 * Текст озвучки куска: автор вводит его в редакторе, и он живёт на куске.
 *
 * Два случая:
 *
 *   набор сохраняется — автор печатает в поле, текст попадает в
 *   `project.segments[0].speech`, а не куда-то ещё (ADR-022: поле на куске,
 *   не на дорожке);
 *
 *   разрез без расшифровки не молчит — у куска есть текст озвучки, но нет
 *   расшифровки, и разрез по развилке рождает продолжение БЕЗ текста.
 *   Автор обязан узнать об этом сразу, а не когда-нибудь потом
 *   (ADR-022, `state/split.ts: speechLossWarning`).
 *
 * fixtures/projects/exit-branch.json: часть «s-ask» без расшифровки
 * (`audio.words: []`), с развилкой-выбором `g-ask` на второй секунде —
 * из 2.904 секунды окна продолжению достаётся ~0.9 с, это выше зазора
 * `MIN_TAIL_SECONDS`, значит продолжение действительно родится.
 */
import { expect, test, type Page } from '@playwright/test';
import { openChapters, splitChapterAtGate } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });

  /**
   * Панель озвучки свёрнута по умолчанию с Сессии 34 (холсту доставалось
   * 84 px из 800, а этой панели — 135). Тест делает то же, что автор:
   * разворачивает её, прежде чем печатать.
   *
   * Раскрытие проверяется, а не подразумевается: сломайся кнопка — и все
   * тесты файла падали бы на «поле не найдено», то есть на следствии,
   * а причину пришлось бы искать. Здесь причина названа сразу.
   */
  await page.getByTestId('audio-source-toggle').click();
  await expect(page.getByTestId('speech-input')).toBeVisible();
}

test.describe('текст озвучки: ввод и сохранение', () => {
  test('автор вводит текст озвучки, и он попадает в проект', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    const input = page.getByTestId('speech-input');
    await input.fill('Часы это позиция в дорожке.');
    await input.blur();

    const speech = await page.evaluate(
      () => (window as unknown as { __project: { segments: { speech?: string }[] } })
        .__project.segments[0]!.speech,
    );
    expect(speech).toBe('Часы это позиция в дорожке.');
  });

  test('пустой ввод стирает текст, а не оставляет пустую строку', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    const input = page.getByTestId('speech-input');
    await input.fill('Что-то было сказано.');
    await input.blur();
    await input.fill('   ');
    await input.blur();

    const speech = await page.evaluate(
      () => (window as unknown as { __project: { segments: { speech?: string }[] } })
        .__project.segments[0]!.speech,
    );
    expect(speech).toBeUndefined();
  });
});

test.describe('разрез без расшифровки: автор узнаёт о потере текста', () => {
  test('есть текст озвучки, нет расшифровки — предупреждение видно после разреза', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    await page.getByTestId('speech-input').fill('Кусок, который мы ещё не расшифровали.');
    await page.getByTestId('speech-input').blur();

    // До разреза предупреждения нет — терять пока нечего.
    await expect(page.getByTestId('speech-split-warning')).toHaveCount(0);

    await page.getByTestId('mark-gate-g-ask').click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();
    await splitChapterAtGate(page, 'mark-gate-g-ask');

    // Предупреждение живёт в панели «Главы» (Editor.tsx, panelId === 'chapters'),
    // а после разреза открыта осталась «Метка» — дверь та же, что у списка глав.
    await openChapters(page);
    const warning = page.getByTestId('speech-split-warning');
    await expect(warning).toBeVisible();
    // Словами автора: «кусок» через «продолжение», «текст озвучки», «расшифровка».
    // Слов схемы («speech», «audio.words») в этом тексте нет.
    await expect(warning).toContainText('текста озвучки');
    await expect(warning).toContainText('расшифровки');
    await expect(warning).not.toContainText('speech');
  });

  test('текста озвучки не было вовсе — разрез проходит молча', async ({ page }) => {
    await openEditor(page, 'exit-branch');

    await page.getByTestId('mark-gate-g-ask').click();
    await expect(page.getByTestId('mark-panel')).toBeVisible();
    await splitChapterAtGate(page, 'mark-gate-g-ask');

    await expect(page.getByTestId('speech-split-warning')).toHaveCount(0);
  });
});

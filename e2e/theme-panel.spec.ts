/**
 * Панель темы (Сессия 23, `docs/design/theme-panel.md`).
 *
 * `demo.json` несёт `card.style.background = var(--scene-surface, #1b2430)`
 * (правка Сессии 22) — ссылку на роль темы, а не сырой цвет. Это ЕДИНСТВЕННОЕ
 * место в эталонных фикстурах, где смена роли темы вообще видна на холсте,
 * и ровно поэтому тесты читают вычисленный стиль настоящего узла сцены,
 * а не значение поля панели: панель могла бы честно показывать новое
 * значение при полностью оторванном холсте (ГЛАВНАЯ ловушка задачи,
 * `StageView.tsx` — `structureKey` не несёт тему намеренно, применяет её
 * отдельный эффект).
 *
 * `<input type="color">` не открыть в Playwright — это системный диалог,
 * а не веб-код. Симулируем закрытие пикера тем же приёмом, что и
 * `e2e/style.spec.ts`: `.value` через дескриптор прототипа плюс настоящее
 * событие `input`, ровно как это делает браузер сам.
 */
import { expect, test, type Page } from '@playwright/test';

const WORK_DB = 'player-workspace';
const WORK_STORE = 'work';
const WORK_KEY = 'current';

interface StoredWork {
  readonly text: string;
  readonly savedAt: number;
  readonly origin: string;
}

async function openEditor(page: Page, query = ''): Promise<void> {
  await page.goto(`/editor.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  // Тема уехала в каталог слева (Сессия 30) и открывается своей категорией
  // на рельсе. Открытие входит в подготовку, а не в проверку: предмет всех
  // тестов файла — сама тема, а не то, как до неё добраться.
  await page.getByTestId('rail-theme').click();
}

/**
 * Одно движение пипетки — «живое» событие `input` без блюра. Несколько
 * последовательных значений в одном вызове `dragThemeColor` — тот же жест,
 * какой в жизни даёт таскание пипетки по палитре: десятки `input` между
 * открытием и закрытием системного пикера.
 */
async function dragThemeColor(page: Page, label: string, hexSteps: readonly string[]): Promise<void> {
  const input = page.getByLabel(label, { exact: true });
  for (const hex of hexSteps) {
    // eslint-disable-next-line no-await-in-loop
    await input.evaluate((node, value) => {
      const el = node as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, hex);
  }
  // Закрытие пикера — точка коммита жеста панели темы (isLiveEvent).
  await input.evaluate((node) => (node as HTMLElement).blur());
}

async function cardBackgroundColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-id="card"]');
    if (!node) throw new Error('нет узла card на сцене');
    return getComputedStyle(node).backgroundColor;
  });
}

async function readSlot(page: Page): Promise<StoredWork | undefined> {
  return page.evaluate(
    async ([db, store, key]) => {
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(db as string, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<StoredWork | undefined>((resolve, reject) => {
          const tx = opened.transaction(store as string, 'readonly');
          const req = tx.objectStore(store as string).get(key as string);
          req.onsuccess = () => resolve(req.result as StoredWork | undefined);
          req.onerror = () => reject(req.error);
        });
      } finally {
        opened.close();
      }
    },
    [WORK_DB, WORK_STORE, WORK_KEY] as const,
  );
}

test.describe('панель темы', () => {
  test('смена «Плашки» перекрашивает card на холсте', async ({ page }) => {
    await openEditor(page, '?fixture=demo');

    // #1b2430 — значение по умолчанию ThemeSchema, до всякой правки.
    expect(await cardBackgroundColor(page)).toBe('rgb(27, 36, 48)');

    await dragThemeColor(page, 'Плашка', ['#ff00aa']);

    await expect.poll(() => cardBackgroundColor(page)).toBe('rgb(255, 0, 170)');
  });

  test('Ctrl+Z возвращает прежний цвет ОДНИМ шагом, а не сотней', async ({ page }) => {
    await openEditor(page, '?fixture=demo');
    const before = await cardBackgroundColor(page);

    // Жест из четырёх движений пипетки — не четыре отдельных шага истории.
    await dragThemeColor(page, 'Плашка', ['#111111', '#222222', '#333333', '#00ff88']);
    await expect.poll(() => cardBackgroundColor(page)).toBe('rgb(0, 255, 136)');
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeEnabled();

    await page.keyboard.press('Control+z');
    await expect.poll(() => cardBackgroundColor(page)).toBe(before);

    // И шаг был ровно один: отменять больше нечего.
    await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  });

  test('значение переживает перезагрузку страницы (автосохранение)', async ({ page }) => {
    await openEditor(page, '?fixture=demo');

    await dragThemeColor(page, 'Плашка', ['#123456']);
    await expect.poll(() => cardBackgroundColor(page)).toBe('rgb(18, 52, 86)');

    // Ждём не «сколько-нибудь миллисекунд», а появления самой записи в слоте —
    // пауза автосохранения (AUTOSAVE_PAUSE_MS) деталь реализации.
    await expect
      .poll(async () => (await readSlot(page))?.text.includes('#123456') ?? false, { timeout: 10_000 })
      .toBe(true);

    // Без ?fixture= — «утро»: проект обязан прийти из слота, а не заново
    // из фикстуры (та же развилка, что в editor-workspace.spec.ts).
    await openEditor(page);
    await expect.poll(() => cardBackgroundColor(page)).toBe('rgb(18, 52, 86)');
  });
});

/**
 * Круг «сохранил вечером — продолжил утром» (Сессия 16).
 *
 * До этой сессии редактор ВСЕГДА открывал фикстуру, а «Сохранить» означало
 * выгрузку файла на диск. Работу можно было унести, но вернуть её в редактор
 * было нечем: обновил вкладку — начал заново.
 *
 * Юнитами это не проверяется вовсе. Окружение юнит-тестов — `node` без DOM
 * и без `indexedDB` (`vitest.config.ts`), а проверять хранилище собственной
 * заглушкой значило бы дать писателю и читателю одну и ту же возможную
 * ошибку. Поэтому весь слой — здесь, в живом Chromium.
 *
 * Хранилище читается и пишется НАПРЯМУЮ, своими константами, а не функциями
 * из `@player/editor`. Это намеренно: тест обязан проверять контракт хранения,
 * а не соглашаться с тем, что наш же модуль сам себе записал.
 *
 * Каждый тест нажимает по видимому элементу, а не зовёт обработчик:
 * проверка «вызвался ли обработчик» была бы зелёной и при невидимой кнопке.
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

interface ProjectView {
  readonly meta: { readonly title: string };
  readonly segments: readonly { readonly elements: readonly { readonly id: string }[] }[];
}

async function openEditor(page: Page, query = ''): Promise<void> {
  await page.goto(`/editor.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function readProject(page: Page): Promise<ProjectView> {
  return page.evaluate(() => (window as unknown as { __project: ProjectView }).__project);
}

/**
 * Ждёт перезагрузку, которую редактор запускает сам (открытие файла, сброс
 * битого слота).
 *
 * Ждать одну лишь метку готовности здесь нельзя: на СТАРОМ документе она уже
 * стоит, и проверка отвечает «готово» до того, как переход вообще случился, —
 * а дальше тест обращается к уничтоженному контексту. Поэтому старый документ
 * помечается, и ждём документ БЕЗ метки и с готовностью: такое сочетание
 * бывает только у нового.
 */
async function reloadedByEditor(page: Page, action: () => Promise<void>): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __old?: true }).__old = true;
  });
  await action();
  await page.waitForFunction(
    () =>
      (window as unknown as { __old?: true }).__old === undefined &&
      document.documentElement.dataset['ready'] === '1',
    null,
    { timeout: 30_000 },
  );
}

async function readSlot(page: Page): Promise<StoredWork | undefined> {
  return page.evaluate(
    async ([db, store, key]) => {
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(db, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise<StoredWork | undefined>((resolve, reject) => {
          const tx = opened.transaction(store, 'readonly');
          const request = tx.objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result as StoredWork | undefined);
          request.onerror = () => reject(request.error);
        });
      } finally {
        opened.close();
      }
    },
    [WORK_DB, WORK_STORE, WORK_KEY] as const,
  );
}

async function writeSlot(page: Page, record: StoredWork): Promise<void> {
  await page.evaluate(
    async ([db, store, key, value]) => {
      const opened = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(db as string, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(store as string);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = opened.transaction(store as string, 'readwrite');
          tx.objectStore(store as string).put(value, key as string);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        opened.close();
      }
    },
    [WORK_DB, WORK_STORE, WORK_KEY, record] as const,
  );
}

/** Сколько элементов в первой части — по этому числу видно, доехала ли правка. */
function elementCount(project: ProjectView): number {
  return project.segments[0]!.elements.length;
}

test.describe('слот работы: сохранил вечером — продолжил утром', () => {
  test('правка переживает перезагрузку вкладки', async ({ page }) => {
    await openEditor(page, '?fixture=demo');
    const before = elementCount(await readProject(page));

    await page.getByTestId('insert-text').click();
    expect(elementCount(await readProject(page))).toBe(before + 1);

    // Ждём не «сколько-нибудь миллисекунд», а появления самой записи: пауза
    // автосохранения — деталь реализации, и тест, привязанный к её длине,
    // покраснел бы от смены константы, ничего при этом не поймав.
    await expect
      .poll(async () => (await readSlot(page))?.text.length ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);

    // Без ?fixture= — то самое «утро»: адрес тот же, что после обычного F5
    // по закладке, и проект обязан прийти из слота, а не из фикстуры.
    await openEditor(page);
    expect(elementCount(await readProject(page))).toBe(before + 1);
  });

  test('явная фикстура сильнее непустого слота', async ({ page }) => {
    await openEditor(page, '?fixture=demo');
    const before = elementCount(await readProject(page));

    await page.getByTestId('insert-text').click();
    await expect
      .poll(async () => (await readSlot(page))?.text.includes('"text-'), { timeout: 10_000 })
      .toBe(true);

    // Это не удобство, а страховка: все существующие e2e открывают редактор
    // с ?fixture=, и если бы слот их перебивал, они бы получали чужой проект.
    await openEditor(page, '?fixture=demo');
    expect(elementCount(await readProject(page))).toBe(before);
  });

  test('«Открыть файл» приносит проект с диска', async ({ page }) => {
    await openEditor(page, '?fixture=demo');
    expect((await readProject(page)).meta.title).toBe('Демо: гейты на словах');

    // Открытие файла перезагружает вкладку на свой же адрес без параметров.
    await reloadedByEditor(page, async () => {
      await page.getByTestId('open-file-input').setInputFiles('fixtures/projects/repeat.json');
    });

    expect((await readProject(page)).meta.title).toBe(
      'Повтор куска: молчащая остановка и виновница',
    );
    expect((await readSlot(page))?.origin).toBe('repeat.json');
  });

  test('негодный файл виден автору, а редактор остаётся живым', async ({ page }) => {
    await openEditor(page, '?fixture=demo');

    await page.getByTestId('open-file-input').setInputFiles({
      name: 'сломанный.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{ это не json'),
    });

    const error = page.getByTestId('workspace-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('сломанный.json');

    // Редактор жив: правка по-прежнему проходит. Иначе «внятная ошибка»
    // означала бы разбитый редактор с подписью.
    await page.getByTestId('insert-text').click();
    expect(elementCount(await readProject(page))).toBeGreaterThan(0);
  });

  test('битый слот виден автору и не запирает редактор навсегда', async ({ page }) => {
    await openEditor(page, '?fixture=demo');
    await writeSlot(page, {
      text: '{"это":"не проект"}',
      savedAt: Date.now(),
      origin: 'испорченная работа',
    });

    await openEditor(page);

    const error = page.getByTestId('editor-load-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText('испорченная работа');

    // Выход из тупика. Без него автор при каждом открытии видел бы одну
    // и ту же ошибку и не мог бы сделать ничего.
    await reloadedByEditor(page, async () => {
      await page.getByTestId('forget-work').click();
    });
    expect((await readProject(page)).meta.title).toBe('Демо: гейты на словах');
  });

  test('вторая вкладка предупреждает и не пишет', async ({ page, context }) => {
    await openEditor(page, '?fixture=demo');
    await page.getByTestId('insert-text').click();
    await expect
      .poll(async () => (await readSlot(page))?.text.length ?? 0, { timeout: 10_000 })
      .toBeGreaterThan(0);
    const slotBefore = await readSlot(page);

    const second = await context.newPage();
    await openEditor(second, '?fixture=demo');

    // Надпись должна быть ВИДНА, а не просто присутствовать в разметке:
    // верное состояние при невидимом элементе — это ровно тот дефект,
    // из-за которого автор молча затирает свою работу.
    await expect(second.getByTestId('workspace-readonly')).toBeVisible();
    await expect(second.getByTestId('open-file')).toBeDisabled();

    // Правка во второй вкладке проходит на экране, но в слот не попадает.
    await second.getByTestId('insert-text').click();
    await second.getByTestId('insert-shape').click();
    await second.waitForTimeout(1500);

    const slotAfter = await readSlot(second);
    expect(slotAfter?.text).toBe(slotBefore?.text);
    expect(slotAfter?.savedAt).toBe(slotBefore?.savedAt);

    await second.close();
  });
});

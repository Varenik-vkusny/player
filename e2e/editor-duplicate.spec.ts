/**
 * Копия куска — жёсткая копия (product.md §7). Несущая проверка здесь —
 * не то, что список сегментов подрос на один (это уже покрыто юнит-тестом
 * на `duplicateSegment`), а то, что копия, сделанная НАСТОЯЩИМ кликом,
 * доводит проект до реального сохранения и открытия в плеере.
 *
 * `problems(project)` в юнит-тесте (`packages/editor/test/duplicate.test.ts`)
 * проверяет ту же функцию схемы, что и сохранение, но не сам путь
 * «редактор → канал предпросмотра → плеер». Несущее ограничение задачи —
 * что копия остановки переименовывает `recordAs` и переписывает правила
 * выхода, которые на него смотрят: если бы каскад был неполным, схема
 * отказала бы РОВНО в этот момент — при открытии в плеере, — а не раньше.
 * Юнит-тест это уже ловит через problems(), но здесь — весь путь глазами
 * пользователя, как требует CLAUDE.md («зелёный юнит-тест ничего не
 * говорит о том, что видит пользователь»).
 *
 * Фикстура — `branching` (мигрирует со схемы v2): узел `n-start` несёт
 * остановку-выбор с двумя вариантами и правилами выхода на оба варианта.
 * Копия ИМЕННО этого узла — тот случай, где каскад переименования обязан
 * отработать полностью, а не просто скопировать пустой кусок.
 *
 * Каждый тест нажимает по видимому элементу — `.click()` по локатору,
 * а не `dispatchEvent` (CLAUDE.md, «тест, который проверяет вызов
 * обработчика — не поведенческий тест»).
 */
import { expect, test, type Page } from '@playwright/test';

interface ProjectView {
  readonly entry: string;
  readonly segments: readonly {
    readonly id: string;
    readonly gates: readonly { readonly recordAs: string }[];
    readonly exit: { readonly rules: readonly { readonly when: readonly { readonly variable: string }[] }[] };
  }[];
}

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function readProject(page: Page): Promise<ProjectView> {
  return page.evaluate(() => (window as unknown as { __project: ProjectView }).__project);
}

test.describe('копия куска', () => {
  test('кнопка добавляет кусок в список, а автор остаётся на оригинале', async ({ page }) => {
    await openEditor(page, 'branching');

    const before = await readProject(page);
    expect(before.segments).toHaveLength(3);

    // n-start — стартовый узел фикстуры, он уже текущий при открытии.
    await expect(page.getByTestId('segment-n-start')).toHaveAttribute('aria-current', 'true');

    await page.getByTestId('segment-duplicate').click();

    const after = await readProject(page);
    expect(after.segments).toHaveLength(before.segments.length + 1);

    // Копия встала СРАЗУ ПОСЛЕ оригинала — автор ищет её глазами там,
    // где нажал.
    expect(after.segments[0]!.id).toBe('n-start');
    const copyId = after.segments[1]!.id;
    expect(copyId).not.toBe('n-start');
    expect(after.segments.map((s) => s.id).filter((id) => id === 'n-yes')).toHaveLength(1);
    expect(after.segments.map((s) => s.id).filter((id) => id === 'n-no')).toHaveLength(1);

    // Автор не просил перевести себя на копию: оригинал остаётся выделенным.
    await expect(page.getByTestId('segment-n-start')).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId(`segment-${copyId}`)).not.toHaveAttribute('aria-current', 'true');

    // Несущее ограничение задачи: копия остановки не может писать в ту же
    // переменную, что оригинал, — иначе схема отвергла бы проект.
    const original = after.segments.find((s) => s.id === 'n-start')!;
    const copy = after.segments.find((s) => s.id === copyId)!;
    expect(copy.gates).toHaveLength(1);
    expect(copy.gates[0]!.recordAs).not.toBe(original.gates[0]!.recordAs);

    // И правила выхода копии смотрят на ЕЁ переменную, а не на переменную
    // оригинала — иначе они не сработали бы никогда (ветка недостижима).
    for (const rule of copy.exit.rules) {
      for (const condition of rule.when) {
        expect(condition.variable).toBe(copy.gates[0]!.recordAs);
      }
    }

    // Круг правок 1 (владелец): список кусков ПОКАЗЫВАЕТ заголовок
    // (SegmentPanel.tsx: `titleOf(segment)` — текст кнопки), и оригинал
    // с копией обязаны читаться по-разному, а не как два «Выбор» подряд.
    const originalLabel = await page.getByTestId('segment-n-start').innerText();
    const copyLabel = await page.getByTestId(`segment-${copyId}`).innerText();
    expect(originalLabel).toBe('Выбор');
    expect(copyLabel).not.toBe(originalLabel);
    expect(copyLabel).toBe('Выбор — копия');
  });

  test('копия куска сохраняется и открывается в плеере — весь путь, а не только problems()', async ({
    page,
    context,
  }) => {
    await openEditor(page, 'branching');

    await page.getByTestId('segment-duplicate').click();
    const after = await readProject(page);
    expect(after.segments).toHaveLength(4);

    const [player] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: 'Открыть в плеере' }).click(),
    ]);
    await player.waitForLoadState('load');

    // Плеер валидирует проект сам (main.ts: loadProject бросает громко).
    // Дошли до ready — каскад переименования переменной отработал полностью,
    // а не только по видимости в редакторе.
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    // Ошибка main.ts рисуется <pre> прямо в body — её обязано не быть.
    await expect(player.locator('body > pre')).toHaveCount(0);

    // «Сохранить и перезагрузить страницу» — самая честная проверка из
    // возможных: канал предпросмотра (IndexedDB) отдаёт РОВНО то, что легло
    // при сохранении, и loadProject прогоняется заново на чистой загрузке,
    // а не на уже смонтированном плеере.
    await player.reload();
    await expect(player.locator('#state')).toHaveText('ready', { timeout: 30_000 });
    await expect(player.locator('body > pre')).toHaveCount(0);
  });
});

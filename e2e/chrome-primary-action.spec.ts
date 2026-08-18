/**
 * Главное действие видно (Задача 2 переноса облика).
 *
 * До правки шапка держала шесть одинаковых кнопок в ряд с равными зазорами:
 * «Сохранить» ничем не отличалась от «Открыть файл» и «Импорт презентации».
 * Автор не мог найти глазами то единственное действие, ради которого
 * шапка и существует.
 *
 * ПОЧЕМУ ЗДЕСЬ НЕТ НИ ОДНОГО ИМЕНИ КЛАССА: проверка вида класса — тест
 * реализации, а не облика. Класс можно проставить и не оформить, и тест
 * останется зелёным при полностью одинаковых кнопках. Поэтому кнопки
 * ищутся по видимой подписи, а сравниваются ВЫЧИСЛЕННЫЕ значения.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ:
 *   1) снять вид «главная» с «Сохранить» — она сольётся с соседкой;
 *   2) убрать пространство между группами — шапка снова станет рядом.
 */
import { test, expect, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();
}

/** Прямоугольник и фон кнопки, найденной по видимой подписи. */
async function readButton(page: Page, label: string) {
  return page.evaluate((text) => {
    const all = Array.from(document.querySelectorAll('.ed-header button'));
    const el = all.find((b) => (b.textContent ?? '').trim() === text);
    if (!el) throw new Error(`нет кнопки с подписью ${text}`);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left, right: r.right, bg: cs.backgroundColor, fg: cs.color };
  }, label);
}

test.describe('главное действие', () => {
  test('«Сохранить» отличается фоном от соседней кнопки', async ({ page }) => {
    await openEditor(page);

    const save = await readButton(page, 'Сохранить');
    const neighbour = await readButton(page, 'Открыть файл');
    const undo = await readButton(page, 'Отменить');

    // Сравниваются РАЗНЫЕ узлы, а не значение с самим собой.
    expect(
      save.bg,
      `«Сохранить» неотличима от «Открыть файл»: обе ${save.bg}`,
    ).not.toBe(neighbour.bg);
    expect(
      save.bg,
      `«Сохранить» неотличима от «Отменить»: обе ${save.bg}`,
    ).not.toBe(undo.bg);

    // Заполненная кнопка обязана быть именно ЗАПОЛНЕННОЙ, а не белой
    // с цветной рамкой: иначе «отличается» выполняется формально.
    expect(save.bg, 'фон «Сохранить» прозрачен').not.toBe('rgba(0, 0, 0, 0)');
  });

  test('шапка разбита на группы ПРОСТРАНСТВОМ, а не только цветом', async ({ page }) => {
    await openEditor(page);

    const undo = await readButton(page, 'Отменить');
    const redo = await readButton(page, 'Повторить');
    const save = await readButton(page, 'Сохранить');
    const open = await readButton(page, 'Открыть файл');
    const importPptx = await readButton(page, 'Импорт презентации');
    const player = await readButton(page, 'Открыть в плеере');

    const withinFirst = Math.round(redo.left - undo.right);
    const betweenFirstSecond = Math.round(save.left - redo.right);
    const withinSecond = Math.round(open.left - save.right);
    const betweenSecondThird = Math.round(player.left - importPptx.right);

    expect(
      betweenFirstSecond,
      `зазор между группами (${betweenFirstSecond}) не больше зазора внутри группы (${withinFirst})`,
    ).toBeGreaterThan(withinFirst);
    expect(
      betweenSecondThird,
      `зазор перед последней группой (${betweenSecondThird}) не больше зазора внутри группы (${withinSecond})`,
    ).toBeGreaterThan(withinSecond);
  });
});

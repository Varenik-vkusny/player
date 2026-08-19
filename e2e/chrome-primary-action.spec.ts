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
 * **19.08.2026 главное действие сменилось: «Сохранить» -> «Открыть
 * в плеере».** Тест перенацелен, а не подогнан: он по-прежнему сравнивает
 * ВЫЧИСЛЕННЫЕ значения двух разных узлов и по-прежнему требует заливки,
 * а не цветной рамки. Изменилось только то, какая кнопка объявлена главной,
 * и это решение облика (замер натуры: у Канвы и КапКута залитая кнопка
 * стоит в правом верхнем углу и означает «отдать работу зрителю»).
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ:
 *   1) снять вид «главная» с «Открыть в плеере» — она сольётся с соседкой;
 *   2) объявить главными две кнопки сразу — «Сохранить» перестанет
 *      отличаться от неё, и первое же сравнение упадёт;
 *   3) убрать пространство между группами — шапка снова станет рядом.
 */
import { test, expect, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();
}

/**
 * Прямоугольник и фон кнопки, найденной по подписи.
 *
 * Подпись ищется и в видимом тексте, и в `aria-label`: с 20.08.2026
 * история правок в шапке — ЗНАЧКИ (у обеих натур она значками), и подпись
 * у них живёт только в aria-label. Прибор, знавший один способ, объявил бы
 * «нет кнопки с подписью Отменить» — то есть соврал бы об отсутствии
 * кнопки, которая на экране стоит.
 */
async function readButton(page: Page, label: string) {
  return page.evaluate((text) => {
    const all = Array.from(document.querySelectorAll('.ed-header button'));
    const el = all.find(
      (b) => (b.textContent ?? '').trim() === text || b.getAttribute('aria-label') === text,
    );
    if (!el) throw new Error(`нет кнопки с подписью ${text}`);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: r.left, right: r.right, bg: cs.backgroundColor, fg: cs.color };
  }, label);
}

test.describe('главное действие', () => {
  test('главная кнопка отличается фоном от соседней', async ({ page }) => {
    await openEditor(page);

    const primary = await readButton(page, 'Открыть в плеере');
    const neighbour = await readButton(page, 'Сохранить');
    const undo = await readButton(page, 'Отменить');

    // Сравниваются РАЗНЫЕ узлы, а не значение с самим собой.
    expect(
      primary.bg,
      `«Открыть в плеере» неотличима от «Сохранить»: обе ${primary.bg}`,
    ).not.toBe(neighbour.bg);
    expect(
      primary.bg,
      `«Открыть в плеере» неотличима от «Отменить»: обе ${primary.bg}`,
    ).not.toBe(undo.bg);

    // Заполненная кнопка обязана быть именно ЗАПОЛНЕННОЙ, а не белой
    // с цветной рамкой: иначе «отличается» выполняется формально.
    expect(primary.bg, 'фон главной кнопки прозрачен').not.toBe('rgba(0, 0, 0, 0)');

    // Главная — ОДНА. Две залитые кнопки рядом означают, что главной нет
    // ни одной; проверка стоит здесь, потому что при переносе облика
    // соблазн залить «Сохранить» заодно был вполне живым.
    expect(
      neighbour.bg,
      '«Сохранить» тоже залита: главных кнопок в шапке две',
    ).toBe('rgba(0, 0, 0, 0)');
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

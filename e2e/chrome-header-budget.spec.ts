/**
 * Бюджет шапки: огрызок хуже отсутствия.
 *
 * Перемерено 19.08.2026 (Сессия 51). При окне 1280 содержимому шапки нужно
 * 1520 px, то есть не хватает 240. Раньше нехватку разбирали ужиманием всех
 * подряд, и получалось вот что:
 *
 *   счётчик «2 элемента · 1 остановка» — ШИРИНА 9 px, то есть «2.»
 *   строка выделения «ничего не выделено» — ШИРИНА 8 px, то есть «Н»
 *
 * Пустое место автор пролистывает глазом, а «2.» читается как обрезанное
 * что-то, и понять, что там было, нельзя. Это тот же класс, что записан
 * в измерениях проекта строкой «видимость не равна наличию».
 *
 * Проверяется ГЕОМЕТРИЯ, а не «нажимается ли»: Playwright сам прокручивает
 * вложенный контейнер и честно нажмёт кнопку, от которой видно два пикселя.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=exit-branch', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Что шапка отдала автору: по каждому её ребёнку — показан ли и не срезан ли. */
const headerParts = (page: Page) =>
  page.evaluate(() => {
    const head = document.querySelector<HTMLElement>('.ed-header');
    if (!head) throw new Error('шапки нет');
    const right = head.getBoundingClientRect().right;
    const part = (node: HTMLElement) => {
      const box = node.getBoundingClientRect();
      return {
        cls: node.className,
        width: Math.round(box.width),
        // Сколько нужно тексту. У пустого (display: none) оба нуля.
        needs: node.scrollWidth,
        clipped: box.right > right + 0.5,
        shown: box.width > 0,
      };
    };
    return {
      children: (Array.from(head.children) as HTMLElement[]).map(part),
      buttons: (Array.from(head.querySelectorAll('button')) as HTMLElement[]).map(part),
    };
  });

for (const width of [1280, 1440]) {
  test.describe(`шапка при окне ${width}`, () => {
    test.use({ viewport: { width, height: 800 } });

    /**
     * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятое `flex: 0 0 auto` у `.ed-actions`. Кнопки
     * начнут ужиматься, и нажать половину кнопки будет нельзя — а сама она
     * о том, что обрезана, не скажет ничего.
     */
    test('ни одна кнопка не обрезана и не ужата', async ({ page }) => {
      await openEditor(page);
      const { buttons } = await headerParts(page);

      expect(buttons.length).toBeGreaterThan(4); // контроль на сам прибор
      const broken = buttons.filter((b) => b.clipped || b.needs > b.width + 1);
      expect(broken, `обрезанные кнопки шапки: ${JSON.stringify(broken)}`).toEqual([]);
    });

    /**
     * ЧТО ДОЛЖНО СЛОМАТЬСЯ: возвращённая сжимаемость строки выделения.
     *
     * Спрятать её тоже нельзя, и это важнее: `toContainText` читает ТЕКСТ,
     * а не картинку, и десять существующих e2e остались бы ЗЕЛЁНЫМИ при
     * пустом месте на экране. Поэтому проверяется и показана, и не срезана.
     */
    test('строка выделения показана целиком, а не огрызком', async ({ page }) => {
      await openEditor(page);
      const { children } = await headerParts(page);

      const selection = children.find((c) => c.cls.includes('ed-selection'));
      expect(selection, 'строки выделения нет среди детей шапки').toBeDefined();
      expect(selection!.shown, 'строка выделения не показана').toBe(true);
      expect(selection!.needs).toBeLessThanOrEqual(selection!.width + 1);
      expect(selection!.clipped).toBe(false);
    });

    /**
     * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снятый запрос к контейнеру, прячущий счётчик.
     * Он немедленно вернётся в виде «2.» — показанным и срезанным сразу.
     *
     * Проверка «ИЛИ целиком, ИЛИ никак» намеренно допускает оба исхода:
     * на широком окне счётчик показан, на узком его нет, и оба состояния
     * правильные. Запрещено ровно третье — огрызок.
     */
    test('счётчик показан целиком либо отсутствует, но не огрызком', async ({ page }) => {
      await openEditor(page);
      const { children } = await headerParts(page);

      const counter = children.find((c) => c.cls.includes('ed-muted'));
      expect(counter, 'счётчика нет среди детей шапки').toBeDefined();
      const whole = counter!.shown && counter!.needs <= counter!.width + 1;
      const absent = !counter!.shown;
      expect(whole || absent, `счётчик огрызком: ${JSON.stringify(counter)}`).toBe(true);
    });
  });
}

/**
 * На широком окне счётчик обязан ВЕРНУТЬСЯ. Без этой проверки предыдущая
 * была бы зелена и у реализации, которая спрятала счётчик навсегда, —
 * то есть тихо убрала бы из продукта то, что в макете есть.
 *
 * Это положительный контроль на сам прибор: он доказывает, что проверка
 * «целиком либо никак» видит разницу между двумя своими исходами.
 */
test.describe('шапка при окне 1920', () => {
  test.use({ viewport: { width: 1920, height: 800 } });

  test('на широком окне счётчик показан целиком', async ({ page }) => {
    await openEditor(page);
    const { children } = await headerParts(page);

    const counter = children.find((c) => c.cls.includes('ed-muted'))!;
    expect(counter.shown).toBe(true);
    expect(counter.needs).toBeLessThanOrEqual(counter.width + 1);
  });
});

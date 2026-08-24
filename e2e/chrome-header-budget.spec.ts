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
     * ГРАММАТИКА ШАПКИ (19.08.2026, перенос облика с натуры).
     *
     * Замер живой Канвы: во всей её шапке ОДИН кегль (14), ОДНА
     * насыщенность (600), ОДНО скругление (12) и ОДНА высота органа (40),
     * а различие несут только заливка и место. У нас до переноса было
     * три кегля (12/14/11), два скругления (6/4) и три разных цвета
     * обводки — то есть система восемью способами сообщала, что органы
     * разные, и ни одним, чем именно.
     *
     * Проверяются ВЫЧИСЛЕННЫЕ значения, а не имена классов: класс можно
     * проставить и не оформить, и такая проверка осталась бы зелёной при
     * полном разнобое на экране.
     *
     * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ:
     *   1) любому органу шапки задать свою высоту, кегль или скругление;
     *   2) вернуть кнопкам видимую рамку — она снова начнёт нести
     *      различие наравне с заливкой;
     *   3) снять правила .ed-header .ed-btn целиком — кнопки вернутся
     *      к панельным 28 px при поле выбора в 40.
     */
    test('все органы шапки одной высоты, кегля и скругления', async ({ page }) => {
      await openEditor(page);

      const organs = await page.evaluate(() => {
        const head = document.querySelector<HTMLElement>('.ed-header');
        if (!head) throw new Error('шапки нет');
        return (Array.from(head.querySelectorAll('button, select')) as HTMLElement[])
          .filter((el) => el.getBoundingClientRect().width > 4)
          .map((el) => {
            const cs = getComputedStyle(el);
            return {
              text: (el.textContent ?? '').trim().slice(0, 20) || el.tagName,
              height: Math.round(el.getBoundingClientRect().height),
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              radius: cs.borderTopLeftRadius,
            };
          });
      });

      // Контроль на сам прибор: без него пустой список прошёл бы всё ниже.
      expect(organs.length, 'органов в шапке не найдено').toBeGreaterThan(4);

      const uniq = (key: 'height' | 'fontSize' | 'fontWeight' | 'radius') => [
        ...new Set(organs.map((o) => String(o[key]))),
      ];
      expect(uniq('height'), `высоты органов разошлись: ${JSON.stringify(organs)}`).toHaveLength(1);
      expect(uniq('fontSize'), `кегли разошлись: ${JSON.stringify(organs)}`).toHaveLength(1);
      expect(uniq('fontWeight'), `насыщенности разошлись: ${JSON.stringify(organs)}`).toHaveLength(1);
      expect(uniq('radius'), `скругления разошлись: ${JSON.stringify(organs)}`).toHaveLength(1);

      // Натурные числа названы прямо: иначе тест зелен и у шапки, все органы
      // которой одинаково неверны.
      expect(organs[0]!.height, 'высота органа не 40, как у натуры').toBe(40);
      expect(organs[0]!.fontSize, 'кегль не 14px, как у натуры').toBe('14px');
      expect(organs[0]!.radius, 'скругление не 12px, как у натуры').toBe('12px');
    });
  });
}

/**
 * ГЛАВНОЕ ДЕЙСТВИЕ СТОИТ В УГЛУ, и это положительный контроль на всё выше.
 *
 * Проверки грамматики требуют, чтобы органы были ОДИНАКОВЫ, и сами по себе
 * были бы зелены у шапки, где все кнопки серые и ни одна не выделена.
 * Здесь спрашивается обратное: ровно одна кнопка обязана отличаться заливкой,
 * и стоять она обязана последней, у правого края.
 *
 * Замер натуры (Канва, окно 1879): «Поделиться» x=1754 w=117, то есть её
 * правый край в 16 px от края окна — ровно поле шапки. У КапКута там же
 * «Export». Совпало у двух независимых продуктов, значит это закон, а не
 * их вкусовщина.
 */
test.describe('шапка при окне 1920', () => {
  test.use({ viewport: { width: 1920, height: 800 } });

  test('ровно одна кнопка залита, и она в правом углу', async ({ page }) => {
    await openEditor(page);

    const filled = await page.evaluate(() => {
      const head = document.querySelector<HTMLElement>('.ed-header');
      if (!head) throw new Error('шапки нет');
      const headRight = head.getBoundingClientRect().right;
      const all = (Array.from(head.querySelectorAll('button')) as HTMLElement[]).filter(
        (el) => el.getBoundingClientRect().width > 4,
      );
      const painted = all.filter(
        (el) => getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)',
      );
      const last = all[all.length - 1]!;
      return {
        total: all.length,
        painted: painted.map((el) => (el.textContent ?? '').trim()),
        lastText: (last.textContent ?? '').trim(),
        gapToEdge: Math.round(headRight - last.getBoundingClientRect().right),
      };
    });

    expect(filled.total, 'кнопок в шапке не найдено').toBeGreaterThan(4);
    expect(
      filled.painted,
      `залитых кнопок не одна: ${JSON.stringify(filled.painted)}`,
    ).toHaveLength(1);
    expect(filled.painted[0], 'залита не последняя кнопка').toBe(filled.lastText);
    expect(filled.gapToEdge, 'главная кнопка не прижата к краю').toBeLessThanOrEqual(20);
  });
});

/**
 * Три уровня поверхности вместо одного (Задача 1 переноса облика).
 *
 * Корень «сырого html», найденный в объявлениях ролей: фон приложения
 * и фон панели ОБА были #ffffff, разделённые волосяной линией. Глубины
 * не было вовсе — экран читался как один лист бумаги с линиями.
 *
 * ПОЧЕМУ ЗАМЕР В ЖИВОМ БРАУЗЕРЕ, А НЕ ЧТЕНИЕ styles.ts: роль может быть
 * переопределена ниже по файлу или перекрыта правилом с большей
 * специфичностью, и текст объявления тогда врёт правдоподобно. Спрашиваем
 * у браузера то, что видит автор.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ:
 *   1) вернуть --ui-surface-base белым (земля сливается с панелями);
 *   2) убрать padding/gap у .ed-main (панели снова смыкаются встык,
 *      земли не видно нигде, хотя цвет у неё «правильный»);
 *   3) убрать скругление или тень у панелей (плита вместо карточки).
 *
 * Второй пункт — несущий. Одного лишь ЦВЕТА земли недостаточно: если
 * панели укрывают её целиком, автор не увидит никакой разницы, а тест
 * на один только цвет остался бы зелёным. Поэтому здесь меряется
 * ГЕОМЕТРИЯ просвета, а не объявление.
 */
import { test, expect, type Page } from '@playwright/test';

/** Панели середины: шесть прямых детей .ed-main дают четыре видимых листа. */
const PANELS = ['.ed-rail', '.ed-catalog', '.ed-stage-cell', '.ed-side'] as const;

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();
}

test.describe('три уровня поверхности', () => {
  test('земля под панелями отличается от самих панелей по цвету', async ({ page }) => {
    await openEditor(page);

    const got = await page.evaluate((panels) => {
      const bg = (sel: string): string => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`нет узла ${sel}`);
        return getComputedStyle(el).backgroundColor;
      };
      return { ground: bg('.ed-root'), panels: panels.map((s) => ({ sel: s, bg: bg(s) })) };
    }, PANELS);

    // Земля обязана отличаться от КАЖДОЙ панели. Сравниваются вычисленные
    // значения РАЗНЫХ узлов — не одно и то же число с самим собой.
    for (const p of got.panels) {
      expect(p.bg, `панель ${p.sel} слилась с землёй: обе ${got.ground}`).not.toBe(got.ground);
    }
  });

  test('земля ВИДНА: между панелями и вокруг них есть просвет', async ({ page }) => {
    await openEditor(page);

    const gaps = await page.evaluate((panels) => {
      const box = (sel: string): DOMRect => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`нет узла ${sel}`);
        return el.getBoundingClientRect();
      };
      const main = box('.ed-main');
      const rects = panels.map((s) => ({ sel: s, r: box(s) }));
      const left = rects.reduce((a, b) => (a.r.left < b.r.left ? a : b));
      const right = rects.reduce((a, b) => (a.r.right > b.r.right ? a : b));
      const top = Math.min(...rects.map((x) => x.r.top));
      // Просветы между соседними по горизонтали панелями.
      const sorted = [...rects].sort((a, b) => a.r.left - b.r.left);
      const between: { pair: string; gap: number }[] = [];
      for (let i = 0; i + 1 < sorted.length; i += 1) {
        between.push({
          pair: `${sorted[i]!.sel} → ${sorted[i + 1]!.sel}`,
          gap: Math.round(sorted[i + 1]!.r.left - sorted[i]!.r.right),
        });
      }
      const sideTop = Math.min(
        ...rects.filter((x) => x.sel !== '.ed-stage-cell').map((x) => x.r.top),
      );
      const stage = rects.find((x) => x.sel === '.ed-stage-cell')!;
      return {
        above: Math.round(sideTop - main.top),
        aboveStage: Math.round(stage.r.top - main.top),
        leftInset: Math.round(left.r.left - main.left),
        rightInset: Math.round(main.right - right.r.right),
        between,
        top,
      };
    }, PANELS);

    expect(gaps.above, `над боковыми панелями земли не видно: ${gaps.above} px`).toBeGreaterThan(0);
    expect(gaps.leftInset, `слева земли не видно: ${gaps.leftInset} px`).toBeGreaterThan(0);
    expect(gaps.rightInset, `справа земли не видно: ${gaps.rightInset} px`).toBeGreaterThan(0);
    for (const b of gaps.between) {
      expect(b.gap, `панели сомкнулись встык: ${b.pair} = ${b.gap} px`).toBeGreaterThan(0);
    }

    /**
     * А вот КОЛОНКА СЦЕНЫ обязана остаться прижатой по вертикали, и это
     * закреплено тестом нарочно, чтобы следующий заход не «доделал облик
     * до макета» по невнимательности.
     *
     * Замерено при переносе облика: вертикальный отступ у середины отнимает
     * у холста 20 px высоты, и на окне 660 px с открытым видом «Ветки»
     * холст падает до 161 px при гарантированном полу 180 (до правки — 181).
     * Запаса по высоте у сцены ровно один пиксель. Поэтому зазор берётся
     * только по горизонтали, а парение листа даёт собственный зазор холста
     * со светлой подложкой, а не поле вокруг колонки.
     */
    expect(
      gaps.aboveStage,
      `колонка сцены отступила сверху на ${gaps.aboveStage} px — это отнимает высоту у холста, ` +
        'см. track-zone-budget и branches-zone-budget',
    ).toBe(0);
  });

  test('панели — карточки: у них есть скругление и тень', async ({ page }) => {
    await openEditor(page);

    const looks = await page.evaluate((panels) => {
      return panels.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`нет узла ${sel}`);
        const cs = getComputedStyle(el);
        return {
          sel,
          radius: Number.parseFloat(cs.borderTopLeftRadius),
          shadow: cs.boxShadow,
        };
      });
    }, PANELS);

    for (const l of looks) {
      expect(l.radius, `у ${l.sel} нет скругления`).toBeGreaterThan(0);
      expect(l.shadow, `у ${l.sel} нет тени`).not.toBe('none');
    }
  });
});

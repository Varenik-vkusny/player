/**
 * ОХРАНА НА КОНТРАСТ ТЕКСТА ХРОМА.
 *
 * Правило: весь текст хрома редактора имеет контраст не ниже 4.5 : 1
 * к фону, НА КОТОРОМ ОН РЕАЛЬНО ЛЕЖИТ.
 *
 * Источник: WCAG 2.2, Success Criterion 1.4.3 Contrast (Minimum), уровень AA
 * — https://www.w3.org/TR/WCAG22/#contrast-minimum
 * Порог 4.5 : 1 для обычного текста и 3 : 1 для крупного (не меньше 24 px,
 * либо не меньше 18.66 px при насыщенности 700+). Формула относительной
 * яркости — https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 *
 * ЗАЧЕМ ОНА ЗАВЕДЕНА ИМЕННО СЕЙЧАС. Перенос облика перекрашивает весь
 * редактор, и без этой охраны «перекрасили» и «перекрасили ЧИТАЕМО» —
 * события неразличимые. Пиксельные эталоны здесь не помогают: их допуск
 * per-pixel 0.1 по YIQ, то есть равномерный сдвиг оттенка проходит как
 * «ноль различий» (находка Н-01 Сессии 49).
 *
 * ПОЧЕМУ ФОН ВЫЧИСЛЯЕТСЯ, А НЕ БЕРЁТСЯ ИЗ РОЛИ. Роль говорит, что задумано;
 * читаемость решает то, что реально лежит под буквами. Узел почти всегда
 * прозрачен, и настоящий фон приходит от предка — иногда не первого.
 * Поэтому фон здесь СОБИРАЕТСЯ подъёмом по предкам со смешиванием альфы,
 * а не читается с самого узла.
 *
 * ИСКЛЮЧЕНИЯ, И КАЖДОЕ ИЗ ИСТОЧНИКА, А НЕ ИЗ УДОБСТВА:
 *   - погашенные органы — SC 1.4.3 прямо выводит из-под правила текст
 *     неактивных элементов управления (Incidental);
 *   - нерисуемые узлы (нулевой размер, display/visibility) — контраст
 *     того, чего не видно, величина без смысла;
 *   - СЦЕНА (.ed-stage-host) — это работа автора, а не хром: её цвета
 *     выбирает автор, и требовать от них наш порог значило бы диктовать
 *     ему оформление.
 */
import { test, expect, type Page } from '@playwright/test';
import { openLayers } from './panels.js';

/** Пороги WCAG 2.2 SC 1.4.3, уровень AA. */
const NORMAL = 4.5;
const LARGE = 3;

/**
 * Сколько текстовых узлов охрана обязана НАЙТИ, чтобы её «чисто» что-то
 * значило. Без этого числа сломанный обходчик — не тот корень, опечатка
 * в селекторе, ранний выход — отдаёт пустой список и докладывает зелёное:
 * «нарушений нет» и «я ничего не смотрел» выглядят одинаково.
 */
const MIN_NODES = 30;

interface Offender {
  text: string;
  cls: string;
  color: string;
  bg: string;
  size: number;
  large: boolean;
  ratio: number;
}

interface AuditResult {
  results: Offender[];
  selfCheck: { blackOnWhite: number; whiteOnWhite: number };
}

async function audit(page: Page): Promise<AuditResult> {
  return page.evaluate(() => {
    interface Rgba {
      r: number;
      g: number;
      b: number;
      a: number;
    }

    const parseColor = (s: string): Rgba | null => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const p = m[1]!.split(',').map((x) => Number.parseFloat(x.trim()));
      return { r: p[0]!, g: p[1]!, b: p[2]!, a: p.length > 3 ? p[3]! : 1 };
    };

    /** Наложение слоя с альфой на непрозрачную подложку. */
    const over = (fg: Rgba, bg: Rgba): Rgba => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });

    const luminance = (c: Rgba): number => {
      const f = (v: number): number => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };

    const ratio = (a: Rgba, b: Rgba): number => {
      const la = luminance(a);
      const lb = luminance(b);
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    };

    /** Фон копится подъёмом по предкам до первого непрозрачного слоя. */
    const backgroundOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      let node: Element | null = el;
      while (node) {
        const c = parseColor(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0) {
          layers.push(c);
          if (c.a === 1) break;
        }
        node = node.parentElement;
      }
      let base: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i]!, base);
      return base;
    };

    const results: Offender[] = [];
    const root = document.querySelector('.ed-root');
    if (!root) throw new Error('нет .ed-root');

    for (const el of Array.from(root.querySelectorAll('*'))) {
      if (el.closest('.ed-stage-host')) continue;
      if (el.closest('[disabled], [aria-disabled="true"]')) continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility !== 'visible') continue;
      const box = el.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;

      // Только СВОЙ текст узла: иначе одна и та же надпись меряется столько
      // раз, сколько над ней предков, и число узлов раздувается впустую.
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => (n.textContent ?? '').trim())
        .join('')
        .trim();
      if (own.length === 0) continue;

      const fg = parseColor(cs.color);
      if (!fg) continue;
      const bg = backgroundOf(el);

      // Прозрачность предков гасит текст так же, как своя собственная.
      let opacity = 1;
      let node: Element | null = el;
      while (node) {
        opacity *= Number.parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }

      const effective = over({ ...fg, a: fg.a * opacity }, bg);
      const size = Number.parseFloat(cs.fontSize);
      const weight = Number.parseInt(cs.fontWeight, 10) || 400;

      results.push({
        text: own.slice(0, 40),
        cls: Array.from(el.classList).join('.'),
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        size,
        large: size >= 24 || (size >= 18.66 && weight >= 700),
        ratio: Math.round(ratio(effective, bg) * 100) / 100,
      });
    }

    // САМОПРОВЕРКА ПРИБОРА: два случая с известным заранее ответом.
    // Чёрное на белом — ровно 21:1, белое на белом — ровно 1:1. Сломанный
    // счётчик завалится здесь, а не промолчит на настоящих узлах.
    const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
    const white: Rgba = { r: 255, g: 255, b: 255, a: 1 };

    return {
      results,
      selfCheck: {
        blackOnWhite: Math.round(ratio(black, white) * 100) / 100,
        whiteOnWhite: Math.round(ratio(white, white) * 100) / 100,
      },
    };
  });
}

const VIEWS: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'дорожки', open: async () => {} },
  {
    name: 'ветки',
    open: async (page: Page) => {
      await page.getByTestId('view-branches').click();
      await expect(page.getByTestId('branches-view')).toBeVisible();
    },
  },
];

for (const view of VIEWS) {
  test(`контраст текста хрома, вид «${view.name}»`, async ({ page }) => {
    await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
    await expect(page.locator('[data-testid="stage-scene"]')).toBeVisible();
    // Выделение поднимает полосу свойств: без него её текст в обход охраны.
    await openLayers(page);
    await page.getByTestId('element-row-title').click();
    await view.open(page);

    const { results, selfCheck } = await audit(page);

    // 1. Прибор считает верно.
    expect(selfCheck.blackOnWhite, 'счётчик контраста сломан').toBe(21);
    expect(selfCheck.whiteOnWhite, 'счётчик контраста сломан').toBe(1);

    // 2. Прибор что-то СМОТРЕЛ.
    expect(
      results.length,
      `обходчик нашёл всего ${results.length} текстовых узлов — это не «чисто», это «не смотрел»`,
    ).toBeGreaterThanOrEqual(MIN_NODES);

    // 3. Собственно правило.
    const bad = results.filter((r) => r.ratio < (r.large ? LARGE : NORMAL));
    const report = bad
      .map((r) => `  «${r.text}» .${r.cls}: ${r.ratio}:1 (${r.color} на ${r.bg}, ${r.size}px)`)
      .join('\n');
    expect(
      bad.map((r) => r.cls),
      `текст хрома ниже порога WCAG 2.2 SC 1.4.3 — ${bad.length} из ${results.length}:\n${report}`,
    ).toEqual([]);
  });
}

/**
 * Карточка слайда в ленте дорожки: видно ли на ней то, что на ней написано,
 * и видно ли, какая карточка сейчас выбрана.
 *
 * ФАЙЛ ПЕРЕНАЦЕЛЕН В СЕССИИ 55. Раньше он мерил ЧИП СЛАЙДА в правой колонке;
 * колонка удалена, панель слайдов удалена вместе с ней как дубликат ленты.
 * Утверждения не изменились ни на слово — изменился только орган, который
 * их обязан держать.
 *
 * ЧТО БЫЛО ИЗМЕРЕНО 18.08.2026 и ради чего файл написан, — оставлено здесь
 * целиком, потому что урок не про чип, а про класс дефекта:
 *
 * Подпись вида перехода («Срез» / «Морфинг») — 11 px, цвет rgb(91,100,114)
 * на фоне rgb(107,107,107). Отношение яркостей 1.12:1 при пороге 4.5:1.
 * Это не «бледновато»: на экране слова НЕТ.
 *
 * ОТКУДА ВЗЯЛСЯ ТАКОЙ ФОН — корень, а не следствие. Правила `.ed-slide-button`
 * в проекте не было НИ ОДНОГО. Кнопка чипа осталась голой кнопкой браузера,
 * а `apps/playground/editor.html` объявляет `:root { color-scheme: dark }` —
 * значит её лицо это тёмный системный ButtonFace, rgb(107,107,107). Поверх
 * него роль --ui-content-fg-secondary, рассчитанная на светлую панель.
 * Оформление при этом БЫЛО НАПИСАНО и цело — но висело на `<li>`, а класс
 * на кнопке внутри не значил ничего.
 *
 * ТОТ ЖЕ ПРОМАХ УБИВАЛ ЦЕЛУЮ ВОЗМОЖНОСТЬ: правило красило текущий слайд
 * по `aria-pressed`, а разметка ставила `aria-current`, и не на тот узел.
 * У всех 15 строк фон был одинаков — автор не видел, какой слайд выбран,
 * и ни один тест этого не проверял.
 *
 * ПРО КЕГЛЬ теста нет намеренно: общепринятого нижнего предела кегля
 * не существует ни в WCAG, ни в других источниках — там нормируется
 * контраст и масштабируемость, а не число пикселей. Придумать порог
 * самому значило бы выдать своё мнение за источник.
 */
import { expect, test, type Page } from '@playwright/test';

import { openSlideStrip } from './panels.js';

test.use({ viewport: { width: 1280, height: 800 } });

/** Относительная яркость по WCAG 2.2. */
function luminance([r, g, b]: readonly number[]): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

/** Отношение контраста по WCAG 2.2. */
function contrast(fg: readonly number[], bg: readonly number[]): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function parse(color: string): readonly number[] {
  const parts = (color.match(/[\d.]+/g) ?? []).map(Number);
  if (parts.length < 3) throw new Error(`не цвет: ${color}`);
  // Полупрозрачный цвет сюда попадать не должен: собственный фон ищется
  // подъёмом по предкам до первого НЕПРОЗРАЧНОГО (см. paintedOn ниже).
  // Придёт rgba с альфой — значит подъём сломан, и молчать об этом нельзя.
  if (parts.length > 3 && parts[3] !== 1) throw new Error(`полупрозрачный цвет: ${color}`);
  return parts.slice(0, 3);
}

/**
 * Открывает редактор И РАЗВОРАЧИВАЕТ ЛЕНТУ СЛАЙДОВ.
 *
 * Лента свёрнута по умолчанию — решение владельца 15.08.2026 по замеру:
 * развёрнутая отнимает у сцены 98 px. Пока она свёрнута, карточек нет
 * в DOM вовсе, и мерить было бы нечего.
 */
async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  await openSlideStrip(page);
}

/**
 * Цвет текста и цвет того, на чём он ЛЕЖИТ. Фон берётся подъёмом по
 * предкам до первого непрозрачного — иначе у прозрачного узла получилось
 * бы сравнение цвета с самим собой, то есть зелёное при любой реализации.
 */
async function painted(
  page: Page,
  selector: string,
): Promise<{ color: string; background: string; fontSize: string; from: string }> {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) throw new Error(`нет узла ${sel}`);
    const own = getComputedStyle(node);
    let walker: Element | null = node;
    while (walker) {
      const background = getComputedStyle(walker).backgroundColor;
      const parts = (background.match(/[\d.]+/g) ?? []).map(Number);
      const opaque = parts.length >= 3 && (parts.length < 4 || parts[3] === 1);
      if (opaque) {
        return {
          color: own.color,
          background,
          fontSize: own.fontSize,
          from: (walker.className || '').toString().split(' ')[0] || walker.tagName,
        };
      }
      walker = walker.parentElement;
    }
    throw new Error(`у ${sel} нет непрозрачного фона ни у одного предка`);
  }, selector);
}

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: карточка слайда
 * снова остаётся голой кнопкой браузера, либо подпись перекрашивают в роль,
 * не подходящую к её фону. На коде до починки чипа — 1.12 против 4.5.
 */
test('карточка слайда: подпись читается на своём фоне', async ({ page }) => {
  await openEditor(page);

  /**
   * ДВЕ КАРТОЧКИ, А НЕ ОДНА, и это куплено сломом 18.08.2026: проверка,
   * смотревшая только на текущий орган, пропускала беду у всех остальных.
   *
   * ЧЕМ КОНТРОЛЬ ОХВАТА ОТЛИЧАЕТСЯ ОТ ПРЕЖНЕГО. У чипа состояния различались
   * ФОНОМ, и контроль требовал, чтобы фоны двух проб были разными. У карточки
   * ленты подпись лежит на своей плашке (`--ui-surface-overlay`), одинаковой
   * в обоих состояниях, — замер 23.08.2026 дал обеим rgb(35,42,51). Требовать
   * тут разных фонов значило бы требовать от органа того, чем он не устроен,
   * и тест был бы красным на исправном коде.
   *
   * Поэтому контроль охвата спрашивает другое и по существу то же: что проба
   * действительно взята из ДВУХ РАЗНЫХ состояний — одна карточка текущая,
   * другая нет. Иначе «две пробы» были бы одной, снятой дважды.
   */
  const cases = [
    { sel: '[data-testid="strip-card-node-1-slide-1"] .ed-slide-strip-cap', name: 'текущая карточка' },
    { sel: '[data-testid="strip-card-node-1-slide-2"] .ed-slide-strip-cap', name: 'обычная карточка' },
  ] as const;

  for (const probe of cases) {
    await expect(
      page.locator(probe.sel),
      `${probe.name}: подписи нет на экране — мерить нечего`,
    ).toBeVisible();
  }

  const seen: string[] = [];
  for (const probe of cases) {
    const label = await painted(page, probe.sel);
    seen.push(label.background);
    const ratio = contrast(parse(label.color), parse(label.background));
    expect(
      Number(ratio.toFixed(2)),
      `${probe.name}: подпись ${label.color} на ${label.background} (фон от .${label.from}), кегль ${label.fontSize} — отношение ${ratio.toFixed(2)}:1 при пороге WCAG 2.2 SC 1.4.3 = 4.5:1`,
    ).toBeGreaterThanOrEqual(4.5);
  }

  // Положительный контроль охвата: пробы взяты из РАЗНЫХ состояний.
  const states = await page.evaluate(() => [
    document.querySelector('[data-testid="strip-card-node-1-slide-1"]')
      ?.classList.contains('ed-slide-strip-card-current'),
    document.querySelector('[data-testid="strip-card-node-1-slide-2"]')
      ?.classList.contains('ed-slide-strip-card-current'),
  ]);
  expect(states, 'обе пробы из одного состояния — охвачена половина ленты').toEqual([true, false]);
});

/**
 * ПОЛОЖИТЕЛЬНЫЙ КОНТРОЛЬ ПРИБОРА, а не второе утверждение о карточке.
 *
 * Мерится соседний текст той же зоны, про который известно, что он читается
 * (имя полосы в голове дорожки). Покрасней он вместе с тестом выше — значит
 * сломан ЗАМЕР, а не карточка, и чинить надо прибор.
 *
 * Раньше эту роль играло время на чипе (`.ed-slide-time`, 5.33:1). В ленте
 * времени на карточке нет — там подпись того, что изменилось на слайде, —
 * поэтому контролем взят другой заведомо читаемый текст той же зоны.
 */
test('замер исправен: заведомо читаемый текст той же зоны проходит порог', async ({ page }) => {
  await openEditor(page);

  const control = await painted(page, '.ed-lane-head');
  const ratio = contrast(parse(control.color), parse(control.background));
  expect(
    Number(ratio.toFixed(2)),
    `контрольный текст: ${control.color} на ${control.background} — ${ratio.toFixed(2)}:1. `
    + 'Красный здесь означает сломанный прибор, а не сломанную карточку',
  ).toBeGreaterThanOrEqual(4.5);
});

/**
 * НЕСУЩИЙ ТЕСТ. Что должно сломаться, чтобы он покраснел: выделение текущей
 * карточки перестаёт рисоваться — например, правило вешают на признак,
 * которого в разметке нет. Ровно это и было у чипа: правило красило по
 * `aria-pressed`, разметка ставила `aria-current`, и у всех 15 строк фон
 * выходил один и тот же.
 *
 * ЧТО ИМЕННО МЕРИТЬ — не самоочевидно, и первая попытка мерила НЕ ТО.
 * Я взял фон, потому что фоном различался чип; замер 23.08.2026 показал
 * у выбранной карточки и у соседней один и тот же rgb(30,36,44), и тест
 * покраснел на исправном коде. Карточка показывает выбор иначе: рамкой
 * (--ui-action-selected-line), полной непрозрачностью против 0.78
 * у соседей, подъёмом и тенью.
 *
 * Меряются рамка и непрозрачность — ДВА носителя, а не один: убери правило
 * `.ed-slide-strip-card-current` целиком, и покраснеют оба. Сравнение идёт
 * с СОСЕДЯМИ, а не с записанными числами: записанное закрепило бы
 * сегодняшний оттенок как требование, тогда как требование — «видно, какая
 * выбрана».
 */
test('карточка слайда: видно, какой слайд сейчас выбран', async ({ page }) => {
  await openEditor(page);

  const paint = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="strip-card-"]')];
    if (cards.length < 2) throw new Error(`карточек в ленте ${cards.length} — сравнивать не с чем`);
    const current = cards.filter((card) => card.classList.contains('ed-slide-strip-card-current'));
    if (current.length !== 1) {
      throw new Error(`текущих карточек ${current.length}, а должна быть ровно одна`);
    }
    const look = (card: Element): { border: string; opacity: string } => {
      const style = getComputedStyle(card);
      return { border: style.borderTopColor, opacity: style.opacity };
    };
    return {
      current: look(current[0]!),
      others: cards.filter((card) => card !== current[0]).map(look),
    };
  });

  // Положительный контроль: соседние карточки ДЕЙСТВИТЕЛЬНО есть.
  expect(paint.others.length, 'соседних карточек нет — сравнивать не с чем').toBeGreaterThan(0);

  for (const other of paint.others) {
    expect(
      paint.current.border,
      `рамка выбранной ${paint.current.border} не отличается от соседней ${other.border}`,
    ).not.toBe(other.border);
    expect(
      paint.current.opacity,
      `непрозрачность выбранной ${paint.current.opacity} не отличается от соседней ${other.opacity}`,
    ).not.toBe(other.opacity);
  }
});

/**
 * КАРТОЧКА ЛЕНТЫ — ВТОРАЯ ДВЕРЬ К СЛАЙДУ, наравне с ромбом на дорожке.
 *
 * Заведено 25.08.2026 по слову владельца: «важно, чтобы я мог нажать
 * на карточку слайда во вкладке „Слайды“ и тоже мог удалить его, нажав
 * правой кнопкой, а то сейчас я именно на ромбик обязан нажать».
 *
 * У ПЕРВОГО кадра главы ромба нет вовсе (решение продукта: он не переход,
 * а начало), так что карточка — его единственная дверь. Раньше меню там
 * не открывалось, и автор не мог даже УЗНАТЬ, почему первый кадр
 * не удаляется.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ: снять onContextMenu с карточки (`SlideStrip.tsx`)
 * или не отрисовывать меню в `Editor.tsx` — оба теста ниже покраснеют.
 */
/**
 * Правый щелчок по карточке ленты — С ПРЕДВАРИТЕЛЬНОЙ ПРОКРУТКОЙ.
 *
 * Лента прокручивается, и карточка может стоять за краем. Инструмент
 * докручивает её сам, ПЛАВНО, и события прокрутки продолжают приходить
 * ещё несколько сотен миллисекунд — а меню закрывается, когда под ним
 * что-то прокрутилось (`ContextMenu`, разбор Сессии 55). Замер 25.08.2026:
 * меню у карточки за краем открывалось и тут же захлопывалось.
 *
 * Живому автору это не мешает — он жмёт по той карточке, которую видит,
 * и никакой прокрутки при этом не происходит. Но прибор обязан дать
 * прокрутке улечься, иначе он покраснеет на исправном коде.
 */
async function rightClickCard(page: Page, slideId: string): Promise<void> {
  const card = page.getByTestId(`strip-card-${slideId}`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const box = await card.boundingBox();
  if (!box) throw new Error(`карточки «${slideId}» не видно`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
}

test.describe('меню правой кнопки по карточке ленты', () => {
  const slideIdsOf = async (page: Page): Promise<string[]> => page.evaluate(() =>
    (window as unknown as { __project: { segments: { slides: { id: string }[] }[] } })
      .__project.segments[0]!.slides.map((slide) => slide.id));

  test('слайд удаляется с карточки, не трогая ромб', async ({ page }) => {
    await openEditor(page);

    const before = await slideIdsOf(page);
    expect(before.length, 'в главе меньше двух кадров — удалять нечего').toBeGreaterThan(1);
    const target = before[1]!;

    await rightClickCard(page, target);

    const remove = page.getByRole('menuitem', { name: 'Удалить слайд' });
    await expect(remove, 'меню по карточке не открылось').toBeVisible();
    await remove.click();

    const after = await slideIdsOf(page);
    expect(after, 'кадр не удалился').not.toContain(target);
    expect(after.length).toBe(before.length - 1);
  });

  test('у первого кадра меню открывается и НАЗЫВАЕТ причину отказа', async ({ page }) => {
    await openEditor(page);

    const first = (await slideIdsOf(page))[0]!;
    // У первого кадра ромба на дорожке нет — проверяем это, иначе тест
    // охранял бы дверь, которая и так не единственная.
    await expect(page.getByTestId(`mark-slide-${first}`)).toHaveCount(0);

    await rightClickCard(page, first);

    const remove = page.getByRole('menuitem', { name: /Удалить слайд/ });
    await expect(remove).toBeVisible();
    await expect(remove, 'первый кадр предложили удалить').toHaveAttribute('aria-disabled', 'true');
    await expect(remove, 'причина отказа не названа — автор останется в тупике')
      .toContainText('держит начало главы');
  });
});

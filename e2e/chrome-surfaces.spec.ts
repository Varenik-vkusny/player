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

  test('земля ВИДНА вокруг листа сцены', async ({ page }) => {
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
        // Просвет земли по бокам ЛИСТА СЦЕНЫ — там, где глубина несёт смысл.
        // Мерится от соседней колонны, а не от края окна: у окна колонны
        // теперь стоят впритык, и отступ от него был бы всегда нулевым.
        stageInsetLeft: Math.round(
          stage.r.left -
            Math.max(
              ...rects.filter((x) => x.r.right <= stage.r.left + 1).map((x) => x.r.right),
            ),
        ),
        stageInsetRight: Math.round(
          Math.min(
            ...rects.filter((x) => x.r.left >= stage.r.right - 1).map((x) => x.r.left),
          ) - stage.r.right,
        ),
        between,
        top,
      };
    }, PANELS);

    /*
     * СЕССИЯ 53 ПЕРЕПИСАЛА ЭТИ ОЖИДАНИЯ, и это не подгонка под зелень.
     *
     * Владелец посмотрел готовый каталог и сказал: «выглядит всё ещё
     * не как в Канве». Разбор показал, что расходились не плитки, а корпус:
     * рейка и каталог были нарисованы ПАРЯЩИМИ КАРТОЧКАМИ с зазором 10 px
     * и скруглением, тогда как у натуры это КОЛОННЫ впритык — панель Канвы
     * стоит на x = 72 при ширине рейки 72, то есть зазор ровно ноль.
     *
     * Прежние ожидания («между панелями есть просвет») закрепляли ровно
     * то, на что пожаловался владелец: зелёный тест защищал дефект как
     * требование. Поэтому здесь меняется МЕХАНИЗМ, а не намерение.
     * Намерение прежнее и проверяется по-прежнему: три уровня поверхности
     * обязаны быть различимы. Только различает их теперь линия между
     * колоннами и просвет вокруг листа сцены, а не воздух вокруг каждой.
     *
     * Земля осталась видимой там, где она несёт смысл, — вокруг листа
     * сцены: холст обязан читаться как лист на столе.
     */
    expect(
      gaps.stageInsetLeft,
      `слева от листа сцены земли не видно: ${gaps.stageInsetLeft} px`,
    ).toBeGreaterThan(0);
    expect(
      gaps.stageInsetRight,
      `справа от листа сцены земли не видно: ${gaps.stageInsetRight} px`,
    ).toBeGreaterThan(0);

    // А колонны обязаны стоять ВПРИТЫК — это и есть натура. Ноль, а не
    // «больше нуля»: любой зазор здесь возвращает вид парящих карточек.
    for (const b of gaps.between) {
      if (b.pair.includes('.ed-stage-cell')) continue;
      expect(
        b.gap,
        `между колоннами появился зазор — вернулся вид карточек: ${b.pair} = ${b.gap} px`,
      ).toBe(0);
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

  /**
   * Лист сцены остаётся карточкой, а колонны — колоннами.
   *
   * Переписано Сессией 53 вместе с тестом выше и по той же причине:
   * прежнее ожидание «у ВСЕХ четырёх есть скругление и тень» закрепляло
   * вид парящих карточек, на который пожаловался владелец.
   *
   * Guard не ослаблен, а перенацелен. Колонны у нас все светлые — ровно
   * как у натуры, — и если убрать линию между ними, две белые колонны
   * сольются в одно белое поле, а НИ ОДИН тест на цвет этого не заметит:
   * цвета-то верные. Поэтому здесь меряется наличие видимой границы
   * у каждой колонны и сохранность карточного вида у листа сцены.
   */
  test('лист сцены — карточка, колонны разделены линией', async ({ page }) => {
    await openEditor(page);

    /*
     * 20.08.2026: проверка перенацелена с `.ed-stage-cell` на сам лист.
     *
     * Она называлась «лист сцены — карточка», а мерила `.ed-stage-cell` —
     * то есть КОЛОНКУ холста, а не лист. Пока у колонки были скругление
     * и тень, разница не проявлялась, и тест выглядел правильным.
     *
     * Замер натуры показал, что колонка карточкой быть не должна: у Канвы
     * панель каталога и область полотна стыкуются встык, radius 0,
     * shadow none, а окно собрано мозаикой. Карточкой у неё остаётся ЛИСТ —
     * белый прямоугольник с мягкой тенью (замер: rgba(64,87,109,0.3)
     * 0 4px 32px -14px, скругление 0).
     *
     * Поэтому парение теперь спрашивается у `.ed-scene-backdrop` — узла
     * ровно по кадру, который и есть лист, — а скругление не требуется
     * вовсе: у натуры его нет. Проверка стала точнее: раньше она была бы
     * зелёной у окна, где карточка — колонка, а лист плоский, то есть
     * ровно наоборот против натуры.
     */
    const sheet = await page.evaluate(() => {
      const el = document.querySelector('.ed-scene-backdrop');
      if (!el) throw new Error('нет узла .ed-scene-backdrop — лист не найден');
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, bg: cs.backgroundColor };
    });
    expect(sheet.shadow, 'лист сцены перестал парить: тени нет').not.toBe('none');
    expect(sheet.bg, 'у листа нет своего фона — он часть инварианта №5').not.toBe('rgba(0, 0, 0, 0)');

    const looks = await page.evaluate((panels) => {
      return panels.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`нет узла ${sel}`);
        const cs = getComputedStyle(el);
        // Ширина той границы, которой колонна отделена от соседа.
        const sideWidths = [
          Number.parseFloat(cs.borderLeftWidth),
          Number.parseFloat(cs.borderRightWidth),
        ];
        const sideColors = [cs.borderLeftColor, cs.borderRightColor];
        return {
          sel,
          radius: Number.parseFloat(cs.borderTopLeftRadius),
          shadow: cs.boxShadow,
          maxSideBorder: Math.max(...sideWidths),
          sideColors,
        };
      });
    }, PANELS);

    // Колонка холста, наоборот, карточкой быть НЕ должна: у натуры области
    // окна стыкуются встык. Проверка обратная прежней и намеренно.
    const stage = looks.find((l) => l.sel === '.ed-stage-cell')!;
    expect(stage.radius, 'у колонки холста появилось скругление — окно снова стало набором карточек').toBe(0);
    expect(stage.shadow, 'у колонки холста появилась тень — окно снова стало набором карточек').toBe('none');

    for (const l of looks) {
      if (l.sel === '.ed-stage-cell') continue;
      expect(
        l.maxSideBorder,
        `у колонны ${l.sel} нет боковой линии — она сольётся с соседней колонной`,
      ).toBeGreaterThan(0);
      // Линия нулевой прозрачности — это отсутствие линии, и цвет тут
      // проверяется отдельно от ширины: объявить ширину и оставить
      // прозрачный цвет значит пройти проверку ширины впустую.
      expect(
        l.sideColors.some((c) => c !== 'rgba(0, 0, 0, 0)'),
        `у колонны ${l.sel} боковая линия прозрачна`,
      ).toBe(true);
    }
  });
});

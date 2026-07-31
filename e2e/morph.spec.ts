/**
 * Морфинг между слайдами: элемент ЕДЕТ, а не мигает.
 *
 * Скриншотные эталоны фикстур ловят «на секунде T картинка не та». Здесь
 * проверяется то, чего снимок увидеть не может: что между двумя моментами
 * было ДВИЖЕНИЕ. Сломанный морфинг, применяющий конечное состояние скачком,
 * даёт на любой отдельной секунде правильную картинку — и все снимки
 * остаются зелёными.
 *
 * Шаг покадровый и намеренно мелкий. На большом скачке времени движок
 * форсирует рендер, и реализация, которая молчит при мелких шагах, выглядит
 * исправной (обжигались на этом в S1, разбор — ADR-009).
 *
 * fixtures/projects/morph.json: три слайда; `mover` едет и растёт, `label`
 * проявляется из `visible: false` на своём месте, `leaver` уходит,
 * `comer` приходит.
 *
 * Окна перехода после разворота (ADR-020) кончаются на метке: к слайду
 * `m-2` (метка 1.0 с) сцена едет по (0.4, 1.0), к `m-3` (метка 2.0 с) —
 * по (1.4, 2.0). Метки стоят на 0/1/2 с, длительность перехода 0.6 с.
 */
import { expect, test, type Page } from '@playwright/test';

/** Матрица трансформации узла — то, что реально применил браузер. */
async function matrixOf(page: Page, id: string): Promise<string> {
  return page.evaluate((elementId) => {
    const node = document.querySelector(`[data-id="${elementId}"]`);
    if (!(node instanceof HTMLElement)) return 'нет узла';
    return getComputedStyle(node).transform;
  }, id);
}

/** Горизонтальное смещение из матрицы. Для `none` — ноль. */
function translateX(matrix: string): number {
  if (matrix === 'none') return 0;
  const parts = matrix.slice(matrix.indexOf('(') + 1, -1).split(',').map(Number);
  // matrix(a, b, c, d, tx, ty) — шестой член и есть сдвиг по X.
  return parts.length === 6 ? parts[4]! : 0;
}

async function openPreview(page: Page, seconds: number): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/preview.html?fixture=morph&t=${seconds}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
}

/** Ставит предпросмотр на момент и возвращает смещение `mover`. */
async function shiftAt(page: Page, seconds: number): Promise<number> {
  await page.evaluate((t) => {
    (window as unknown as { __preview: { seek(s: number): void } }).__preview.seek(t);
  }, seconds);
  return translateX(await matrixOf(page, 'mover'));
}

test.describe('морфинг между слайдами', () => {
  /**
   * Кадр за кадром через окно перехода. Проверяется ДВИЖЕНИЕ:
   * значений должно быть много разных, и ни одного скачка во всю дистанцию.
   */
  test('элемент едет покадрово, а не применяется скачком', async ({ page }) => {
    await openPreview(page, 0);

    const shifts: number[] = [];
    // Переход к слайду m-2 идёт по (0.4, 1.0), и обход начинается ВНУТРИ
    // окна: ровно на 0.4 сцена ещё стоит на снимке, смещение там ноль,
    // и первый же шаг выглядел бы прыжком во всю дистанцию.
    // Шаг 16.7 мс — кадр при 60 Гц.
    for (let ms = 405; ms <= 1000; ms += 17) {
      shifts.push(await shiftAt(page, ms / 1000));
    }

    const distinct = new Set(shifts.map((value) => value.toFixed(2)));
    expect(distinct.size, 'переход обязан пройти через много промежуточных положений')
      .toBeGreaterThan(20);

    const steps = shifts.slice(1).map((value, index) => Math.abs(value - shifts[index]!));
    const total = Math.abs(shifts[0]! - shifts[shifts.length - 1]!);
    expect(total, 'элемент обязан сместиться заметно').toBeGreaterThan(100);
    // Ни один кадр не покрывает больше пятой части пути: это и есть разница
    // между «едет» и «применилось мгновенно».
    expect(Math.max(...steps)).toBeLessThan(total / 5);
  });

  /**
   * Разворот проверяется здесь: конечное состояние наступает НА метке,
   * а не через 0.6 с после неё. До ADR-020 на секунде 1.000 элемент стоял
   * ещё в снимке предыдущего слайда — метка обещала снимок и врала.
   */
  test('переход заканчивается ровно на метке слайда, без рывка', async ({ page }) => {
    await openPreview(page, 0);

    const almost = await shiftAt(page, 0.99);
    const onMark = await shiftAt(page, 1.0);

    expect(Math.abs(almost), 'к концу окна смещение почти нулевое').toBeLessThan(2);
    expect(onMark, 'на метке слайда трансформация приведена к схемной').toBe(0);
  });

  /**
   * Картинка обязана зависеть ТОЛЬКО от момента, но не от того, каким путём
   * к нему пришли. Иначе скриншотные эталоны перестают что-либо охранять:
   * их снимают одним обходом, а зритель ходит другим.
   */
  test('момент не зависит от истории: обход вперёд и назад совпадает', async ({ page }) => {
    await openPreview(page, 0);

    const moments = [0.5, 0.7, 0.9, 1.5, 1.8];
    const forward: number[] = [];
    for (const t of moments) forward.push(await shiftAt(page, t));

    const backward: number[] = [];
    for (const t of [...moments].reverse()) backward.push(await shiftAt(page, t));
    backward.reverse();

    for (let i = 0; i < moments.length; i++) {
      expect(backward[i], `момент ${moments[i]} с обязан выглядеть одинаково`)
        .toBeCloseTo(forward[i]!, 3);
    }
  });

  /**
   * ADR-015, самая дорогая пара случаев. `visible: false → true` — это
   * ЕДЕТ: позиция известна, элемент проявляется на своём месте. Отсутствие
   * в `states` — ПРИХОДИТ: ехать неоткуда, и проявляется он с задержкой,
   * пока совпавшие ещё едут.
   */
  test('скрытый проявляется с самого начала перехода, а пришедший — во второй половине', async ({ page }) => {
    await openPreview(page, 0);

    const opacity = async (id: string): Promise<number | null> => page.evaluate((elementId) => {
      const node = document.querySelector(`[data-id="${elementId}"]`);
      if (!(node instanceof HTMLElement)) return null;
      return Number(getComputedStyle(node).opacity);
    }, id);

    // Первый переход (0.4, 1.0), четверть пути: скрытый `label` уже проявляется.
    await shiftAt(page, 0.55);
    const labelEarly = await opacity('label');
    expect(labelEarly, 'скрытый элемент проявляется сразу').toBeGreaterThan(0);
    expect(labelEarly).toBeLessThan(1);

    // Второй переход (1.4, 2.0), четверть пути: пришедший `comer` ещё не начал.
    await shiftAt(page, 1.55);
    expect(await opacity('comer'), 'пришедший ждёт, пока совпавшие едут').toBe(0);

    // Второй переход, три четверти: теперь проявляется.
    await shiftAt(page, 1.85);
    const comerLate = await opacity('comer');
    expect(comerLate).toBeGreaterThan(0);
    expect(comerLate).toBeLessThan(1);

    // И финиширует ровно на метке — требование §2б, а не следствие.
    await shiftAt(page, 2.0);
    expect(await opacity('comer'), 'приходящий финиширует на метке').toBe(1);
  });

  /**
   * Уходящий обязан оставаться в документе, пока гаснет. Если убрать его
   * сразу, он исчезнет мгновенно — то есть уход выродится в срез.
   */
  test('уходящий гаснет в документе и покидает его только в конце перехода', async ({ page }) => {
    await openPreview(page, 0);

    const countLeaver = () => page.locator('[data-id="leaver"]').count();

    await shiftAt(page, 1.5);
    expect(await countLeaver(), 'на переходе уходящий ещё в документе').toBe(1);

    await shiftAt(page, 2.1);
    expect(await countLeaver(), 'после метки уходящего в документе нет').toBe(0);
  });
});

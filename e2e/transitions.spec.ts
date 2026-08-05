/**
 * Восемь приёмов перехода: покрытие того, чего скриншотный эталон не видит.
 *
 * `e2e/fixtures.spec.ts` снимает transitions.json на пяти долях дорожки и
 * доказывает только «картинка на секунде T верна». Сломанный переход,
 * применяющий конечное состояние скачком, даёт на любой отдельной секунде
 * правильную картинку — и все пять эталонов остаются зелёными (шапка
 * `e2e/morph.spec.ts`, куплено ошибкой S1). Здесь проверяется то, чего снимок
 * не видит: что внутри окна перехода картинка ОТЛИЧАЕТСЯ от покоя, что срез
 * не проходит через промежуточные значения, что элемент `moves` (совпавший
 * на обоих слайдах) участвует в приёмах, двигающих сцену целиком, — именно
 * эту роль три приёма из восьми сначала игнорировали (журнал Сессии 22,
 * §12.1), и скриншот такой дефект не ловит: на любой отдельной секунде
 * «ничего не подвинулось» выглядит так же, как «подвинулось то, что нужно».
 *
 * Расписание — из `docs/design/transitions-fixture.md` §3, проверено
 * прогоном контроллера. Свойства приёмов — из `TECHNIQUE_PROPS`
 * (`packages/player/src/morph.ts:35`), а не из чтения `buildMorph`:
 * инвариант №8 — свойство ПРИЁМА, а не кода, который его играет.
 */
import { expect, test, type Page } from '@playwright/test';

/** Окна переходов фикстуры — из спецификации §3, числа не пересчитываются. */
const WINDOWS = {
  morph: { start: 7.00, end: 8.00, mark: 8.00 },
  dissolve: { start: 11.75, end: 13.35, mark: 13.35 },
  slide: { start: 16.80, end: 18.00, mark: 18.00 },
  scale: { start: 23.10, end: 24.70, mark: 24.70 },
  blur: { start: 29.00, end: 30.00, mark: 30.00 },
  wipe: { start: 35.85, end: 37.85, mark: 37.85 },
  circle: { start: 42.50, end: 44.00, mark: 44.00 },
} as const;

/** Середина ПЕРВОЙ половины окна — до подмены состояний (`UNMATCHED_FRACTION`). */
function firstHalfMid(window: { start: number; end: number }): number {
  return window.start + (window.end - window.start) * 0.25;
}

/** Точка внутри второй половины окна — после подмены состояний. */
function secondHalfMid(window: { start: number; end: number }): number {
  return window.start + (window.end - window.start) * 0.75;
}

/** Стиль узла, который реально видит браузер. */
interface Signature {
  transform: string;
  opacity: string;
  filter: string;
  left: string;
}

async function openPreview(page: Page, seconds: number): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`/preview.html?fixture=transitions&t=${seconds}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1');
  expect(errors, 'на странице не должно быть ошибок').toEqual([]);
}

async function seek(page: Page, seconds: number): Promise<void> {
  await page.evaluate((t) => {
    (window as unknown as { __preview: { seek(s: number): void } }).__preview.seek(t);
  }, seconds);
}

async function signatureOf(page: Page, id: string): Promise<Signature> {
  return page.evaluate((elementId) => {
    const node = document.querySelector(`[data-id="${elementId}"]`);
    if (!(node instanceof HTMLElement)) throw new Error(`нет узла «${elementId}»`);
    const style = getComputedStyle(node);
    return { transform: style.transform, opacity: style.opacity, filter: style.filter, left: style.left };
  }, id);
}

async function seekAndSignature(page: Page, id: string, seconds: number): Promise<Signature> {
  await seek(page, seconds);
  return signatureOf(page, id);
}

/**
 * Горизонтальное смещение из матрицы транформации. Для `none` — ноль.
 * Тот же приём, что в `e2e/morph.spec.ts`.
 */
function translateX(matrix: string): number {
  if (matrix === 'none') return 0;
  const parts = matrix.slice(matrix.indexOf('(') + 1, -1).split(',').map(Number);
  return parts.length === 6 ? parts[4]! : 0;
}

/**
 * Накладка «Шторы»/«Круга» — единственный узел без `data-id` внутри сцены
 * (`addOverlay`, `morph.ts:356`). Ни `wipe`, ни `circle` не трогают ни один
 * элемент плана вовсе (см. `buildMorph`), поэтому у них нет иного способа
 * прочитать движение приёма, кроме как через саму накладку.
 */
async function overlayTransform(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const stage = document.querySelector('#stage-host > div');
    if (!stage) return null;
    const overlay = [...stage.children].find(
      (el) => el instanceof HTMLElement && el.dataset['id'] === undefined,
    );
    return overlay ? getComputedStyle(overlay).transform : null;
  });
}

test.describe('приёмы перехода: у каждого внутри окна что-то отличается от покоя', () => {
  /**
   * `TECHNIQUE_PROPS`: morph → x,y,scaleX,scaleY,rotate,opacity; slide → x;
   * оба выражаются в CSS `transform`, а состояния фикстуры дают им обоим
   * ненулевое смещение/масштаб (координаты `stays` меняются от слайда
   * к слайду, инвариант фикстуры).
   */
  test('morph: transform у "stays" внутри окна отличается от покоя', async ({ page }) => {
    await openPreview(page, 0);
    const rest = await seekAndSignature(page, 'stays', WINDOWS.morph.mark);
    const mid = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.morph));

    expect(rest.transform, 'на метке transform приведён к схемному (нет вращения/масштаба)').toBe('none');
    expect(mid.transform, 'внутри окна morph едет').not.toBe('none');
    expect(mid.transform).not.toBe(rest.transform);
  });

  test('slide: transform у "stays" внутри окна отличается от покоя', async ({ page }) => {
    await openPreview(page, 0);
    const rest = await seekAndSignature(page, 'stays', WINDOWS.slide.mark);
    const mid = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.slide));

    expect(rest.transform).toBe('none');
    expect(mid.transform, 'внутри окна slide "stays" тоже едет — роль moves').not.toBe('none');
  });

  /** `TECHNIQUE_PROPS.dissolve = ['opacity']`: единственное играемое свойство. */
  test('dissolve: opacity у "stays" внутри окна отличается от покоя', async ({ page }) => {
    await openPreview(page, 0);
    const restOpacity = Number((await seekAndSignature(page, 'stays', WINDOWS.dissolve.mark)).opacity);
    const midOpacity = Number((await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.dissolve))).opacity);

    expect(restOpacity).toBe(1);
    expect(midOpacity, 'внутри первой половины dissolve "stays" гаснет').toBeLessThan(1);
  });

  /** `TECHNIQUE_PROPS.scale = ['scale', 'opacity']`. */
  test('scale: transform и opacity у "stays" внутри окна отличаются от покоя', async ({ page }) => {
    await openPreview(page, 0);
    const rest = await seekAndSignature(page, 'stays', WINDOWS.scale.mark);
    const mid = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.scale));

    expect(rest.transform).toBe('none');
    expect(mid.transform, 'внутри окна scale "stays" масштабируется').not.toBe('none');
    expect(Number(mid.opacity), 'и одновременно гаснет').toBeLessThan(1);
  });

  /** `TECHNIQUE_PROPS.blur = ['filter', 'opacity']`. */
  test('blur: filter и opacity у "stays" внутри окна отличаются от покоя', async ({ page }) => {
    await openPreview(page, 0);
    const rest = await seekAndSignature(page, 'stays', WINDOWS.blur.mark);
    const mid = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.blur));

    expect(rest.filter).toBe('none');
    expect(mid.filter, 'внутри окна blur "stays" размывается').not.toBe('none');
    expect(Number(mid.opacity)).toBeLessThan(1);
  });

  /** `TECHNIQUE_PROPS.wipe = ['x']`, но играет накладка, а не элемент плана. */
  test('wipe: накладка внутри окна занимает промежуточное положение', async ({ page }) => {
    await openPreview(page, 0);
    await seek(page, WINDOWS.wipe.start + 0.01);
    const justStarted = translateX((await overlayTransform(page))!);
    await seek(page, firstHalfMid(WINDOWS.wipe));
    const mid = translateX((await overlayTransform(page))!);

    // Первая половина: штора едет от -stage.width (за левым краем) к 0
    // (полностью закрыла сцену). У самого начала окна она почти полностью
    // за кадром, к середине первой половины — заметно сместилась.
    expect(Math.abs(mid)).toBeLessThan(Math.abs(justStarted));
    expect(mid).not.toBe(justStarted);
  });

  /** `TECHNIQUE_PROPS.circle = ['scale']`, играет накладка. */
  test('circle: накладка внутри окна занимает промежуточный масштаб', async ({ page }) => {
    await openPreview(page, 0);
    await seek(page, WINDOWS.circle.start + 0.01);
    const justStarted = (await overlayTransform(page))!;
    await seek(page, firstHalfMid(WINDOWS.circle));
    const mid = (await overlayTransform(page))!;

    expect(mid, 'накладка "Круга" внутри окна меняет масштаб').not.toBe(justStarted);
  });
});

test.describe('cut: срез, а не движение', () => {
  test('за миллисекунды до метки и на метке — скачок, промежуточных значений нет', async ({ page }) => {
    await openPreview(page, 0);
    // Метка s-1 — 4.00 с (табл. §3), приём "cut". "stays" — самый надёжный
    // маркер: он есть на КАЖДОМ слайде фикстуры и меняет x на каждом шаге,
    // поэтому "до" и "после" метки гарантированно различимы.
    const justBefore = await seekAndSignature(page, 'stays', 3.999);
    const onMark = await seekAndSignature(page, 'stays', 4.00);

    // x "stays" на s-0 — 80px, на s-1 — 260px (см. фикстуру). Срез обязан
    // перебросить left мгновенно, без единого промежуточного значения.
    expect(justBefore.left).toBe('80px');
    expect(onMark.left).toBe('260px');

    // Мелкий обход самого перехода: ни одного значения, кроме двух крайних.
    const seen = new Set<string>();
    for (let ms = 3990; ms <= 4010; ms += 1) {
      const signature = await seekAndSignature(page, 'stays', ms / 1000);
      seen.add(signature.left);
    }
    expect([...seen].sort()).toEqual(['260px', '80px'].sort());
  });
});

test.describe('роль moves: совпавший элемент участвует в приёмах, двигающих сцену целиком', () => {
  /**
   * Журнал Сессии 22, §12.1: три приёма из восьми сначала пропускали
   * `moves` — элемент, присутствующий на ОБОИХ слайдах. Дефект не виден
   * ни на одной отдельной секунде скриншота: если "stays" не участвует,
   * он просто стоит в конечном боксе всё окно — и последний кадр остаётся
   * верным. Проверяется именно СЕРЕДИНА окна.
   */
  test('dissolve: "stays" стоит в СТАРОМ боксе в первой половине окна и в НОВОМ во второй', async ({ page }) => {
    await openPreview(page, 0);

    // "stays" на s-2 (старый слайд): x=440. На s-3 (новый слайд): x=620.
    const before = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.dissolve));
    expect(before.left, 'первая половина dissolve — старый бокс').toBe('440px');

    const after = await seekAndSignature(page, 'stays', secondHalfMid(WINDOWS.dissolve));
    expect(after.left, 'вторая половина dissolve — новый бокс').toBe('620px');
  });

  test('scale: "stays" стоит в СТАРОМ боксе в первой половине окна и в НОВОМ во второй', async ({ page }) => {
    await openPreview(page, 0);

    // "stays" на s-4: x=800. На s-5: x=980.
    const before = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.scale));
    expect(before.left).toBe('800px');

    const after = await seekAndSignature(page, 'stays', secondHalfMid(WINDOWS.scale));
    expect(after.left).toBe('980px');
  });

  test('wipe: "stays" стоит в СТАРОМ боксе в первой половине окна и в НОВОМ во второй', async ({ page }) => {
    await openPreview(page, 0);

    // "stays" на s-6: x=1160. На s-7: x=1340.
    const before = await seekAndSignature(page, 'stays', firstHalfMid(WINDOWS.wipe));
    expect(before.left).toBe('1160px');

    const after = await seekAndSignature(page, 'stays', secondHalfMid(WINDOWS.wipe));
    expect(after.left).toBe('1340px');
  });
});

test.describe('движение покадровое, а не скачком', () => {
  /**
   * Шаг мелкий и намеренно: на большом скачке времени движок форсирует
   * рендер, и реализация, применяющая конечное состояние скачком, выглядела
   * бы исправной (обжигались в S1, разбор — ADR-009). Шаг ~17 мс — кадр
   * при 60 Гц, тот же приём, что в `e2e/morph.spec.ts`.
   */
  test('morph: "stays" едет через много промежуточных положений', async ({ page }) => {
    await openPreview(page, 0);

    // Начинаем на 1 мс ПОЗЖЕ начала окна: ровно на границе `phaseAt` ещё
    // отдаёт `still` предыдущего слайда (оба конца окна открыты, `morph.ts:110`),
    // а его "left" — 260px, другой системы отсчёта, чем FLIP-смещение цели.
    // Захватить эту точку в тот же ряд — сравнивать смещение разных боксов.
    const startMs = Math.round(WINDOWS.morph.start * 1000) + 1;
    const endMs = Math.round(WINDOWS.morph.end * 1000);

    const shifts: number[] = [];
    for (let ms = startMs; ms <= endMs; ms += 17) {
      const signature = await seekAndSignature(page, 'stays', ms / 1000);
      shifts.push(translateX(signature.transform));
    }

    const distinct = new Set(shifts.map((value) => value.toFixed(2)));
    expect(distinct.size, 'переход обязан пройти через много промежуточных положений').toBeGreaterThan(15);

    const steps = shifts.slice(1).map((value, index) => Math.abs(value - shifts[index]!));
    const total = Math.abs(shifts[0]! - shifts[shifts.length - 1]!);
    // Ни один кадр не покрывает больше трети пройденного расстояния —
    // иначе это скачок, а не покадровая езда.
    expect(Math.max(...steps)).toBeLessThan(Math.max(total, 1) / 3);
  });

  /**
   * Первая половина `slide` (до подмены состояний на середине) — тоже
   * покадровая езда, а не скачок. Вторая половина сюда не берётся намеренно:
   * между половинами `slides.ts` меняет раскладку синхронно, и это
   * ЗАКОННЫЙ разрыв (`WHOLE_SCENE`, `morph.ts:192`), а не дефект.
   */
  test('slide: первая половина окна проходит через много промежуточных положений', async ({ page }) => {
    await openPreview(page, 0);

    const halfStartMs = Math.round(WINDOWS.slide.start * 1000);
    // Половина окна — до подмены состояний (UNMATCHED_FRACTION = 0.5).
    const halfEndMs = Math.round((WINDOWS.slide.start + (WINDOWS.slide.end - WINDOWS.slide.start) * 0.5) * 1000) - 20;

    const shifts: number[] = [];
    for (let ms = halfStartMs + 5; ms <= halfEndMs; ms += 17) {
      const signature = await seekAndSignature(page, 'stays', ms / 1000);
      shifts.push(translateX(signature.transform));
    }

    const distinct = new Set(shifts.map((value) => value.toFixed(2)));
    expect(distinct.size, 'первая половина slide обязана пройти через много промежуточных положений')
      .toBeGreaterThan(10);
  });
});

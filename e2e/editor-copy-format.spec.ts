/**
 * «Копировать форматирование» на полосе свойств (Сессия 39, натура снята
 * в Canva 14.08.2026 — «кисти» как таковой там нет, `docs/design/styles.md`
 * §5).
 *
 * Ловушка, названная заданием прямо: «вид совпал после копирования» верно
 * и при разовом копировании ЗНАЧЕНИЙ, и при живой связи через стиль —
 * различает их только ПРАВКА СТИЛЯ ПОСЛЕ применения. Отсюда первый тест
 * правит стиль напрямую через CSS-правило сцены (`.st-<id>`), тем же
 * приёмом, что `e2e/styles.spec.ts` — редактор рисует ОДНИМ рендером
 * с плеером (инвариант №5), лист стилей сцены у него тот же.
 */
import { expect, test, type Page } from '@playwright/test';
import { openLayers } from './panels.js';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

async function computedOf(
  page: Page,
  id: string,
  property: 'fontSize' | 'backgroundColor' | 'color',
): Promise<string> {
  return page.evaluate(
    ({ elementId, prop }) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      return getComputedStyle(node)[prop];
    },
    { elementId: id, prop: property },
  );
}

/** Правит стиль ОДНОЙ записью в правило — та же функция, что в styles.spec.ts. */
/**
 * Правит правило стиля прямо в листе БОЛЬШОЙ сцены.
 *
 * ⚠️ Лист выбирается по имени сцены, а не «первый попавшийся», и это
 * куплено настоящим случаем 20.08.2026. Плитки каталога получили внутри
 * себя настоящие снимки сцены (`ScenePreview`), и каждая такая сцена
 * заводит СВОЙ лист стилей — замер живой страницы: шесть листов
 * `sc1`…`sc6` при пяти плитках и одном холсте, все разведены приставкой
 * `[data-scene="scN"]`.
 *
 * Прибор брал первый лист и правил стиль ПЛИТКИ. Большая сцена не менялась,
 * тест падал «140px против 96px», и выглядело это как поломка живой связи
 * стилей — то есть прибор указывал на исправный продукт.
 *
 * Разведение приставкой — не новость, оно измерено проектом раньше:
 * «две сцены на странице разводятся приставкой контейнера, один
 * идентификатор стиля дал 21px и 22px порознь». Новым стало то, что сцен
 * на странице теперь много ВСЕГДА, а не в редком случае.
 */
async function editStyle(page: Page, styleId: string, props: Record<string, string>): Promise<void> {
  await page.evaluate(({ id, values }) => {
    const scene = document.querySelector<HTMLElement>('[data-testid="stage-scene"]');
    const sceneName = scene?.dataset['scene'] ?? scene?.getAttribute('data-scene');
    if (!sceneName) throw new Error('у большой сцены нет data-scene — лист не опознать');
    const sheets = [...document.styleSheets];
    const sheet = sheets.find(
      (s) => (s.ownerNode as HTMLElement | null)?.dataset?.['sceneStyles'] === sceneName,
    );
    if (!sheet) throw new Error(`Лист стилей сцены «${sceneName}» не найден: править нечего`);
    const rule = [...sheet.cssRules].find(
      (r) => (r as CSSStyleRule).selectorText?.includes(`.st-${id}`),
    ) as CSSStyleRule | undefined;
    if (!rule) throw new Error(`Правила для стиля «${id}» нет в листе сцены`);
    for (const [key, value] of Object.entries(values)) rule.style.setProperty(key, value);
  }, { id: styleId, values: props });
}

/**
 * Точка на экране внутри бокса узла — НЕ обязательно центр: `plate-1`
 * (фигура-подложка на весь слайд) в фикстуре `styles` целиком содержит
 * title/sub/note внутри своих границ, и центр её бокса физически совпадает
 * с боксом `sub` — клик «в центр plate-1» на самом деле бьёт по sub, который
 * лежит выше по слоям. `hRatio`/`vRatio` (0..1 от левого верхнего угла)
 * позволяют целиться в СВОБОДНУЮ от других элементов часть бокса.
 */
async function pointOnScreen(
  page: Page,
  id: string,
  hRatio = 0.5,
  vRatio = 0.5,
): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ elementId, h, v }) => {
      const node = document.querySelector<HTMLElement>(`[data-id="${elementId}"]`);
      if (!node) throw new Error(`нет узла ${elementId}`);
      const rect = node.getBoundingClientRect();
      return { x: rect.left + rect.width * h, y: rect.top + rect.height * v };
    },
    { elementId: id, h: hRatio, v: vRatio },
  );
}

/** Щелчок ПО СЦЕНЕ — только он проходит через перехват «формата в руке». */
async function clickOnCanvas(page: Page, id: string, hRatio = 0.5, vRatio = 0.5): Promise<void> {
  const point = await pointOnScreen(page, id, hRatio, vRatio);
  await page.mouse.click(point.x, point.y);
}

test.describe('копировать форматирование', () => {
  test('источник со стилем: приёмник попадает в ЖИВУЮ СВЯЗЬ — правка стиля катится к нему', async ({
    page,
  }) => {
    await openEditor(page, 'styles');
    await openLayers(page);

    // note идёт по «Тихому»: 40px, rgb(147, 164, 184) — до всякого копирования.
    expect(await computedOf(page, 'note', 'fontSize')).toBe('40px');

    // Источник — title, стоит на «Главном» (heading).
    await page.getByTestId('element-row-title').click();
    await expect(page.getByTestId('selection-readout')).toContainText('title');

    // «Копировать форматирование» уехало с полосы в блок «Расположение»
    // панели «Объект» (Сессия 48) — дверь та же, что у остальных органов.
    await page.getByTestId('propbar-more').click();
    const copyFormat = page.getByTestId('copy-format');
    await copyFormat.click();
    await expect(copyFormat).toHaveAttribute('aria-pressed', 'true');

    // Второй щелчок — по ДРУГОМУ элементу того же типа, на самой сцене.
    // Левый край note: подальше от возможных соседей по слоям (см. комментарий pointOnScreen).
    await clickOnCanvas(page, 'note', 0.1);

    // Промежуточная проверка: применение обязано было СОСТОЯТЬСЯ раньше,
    // чем проверяется откат/живая связь — иначе тест остаётся зелёным
    // при полностью отключённом копировании.
    await expect.poll(() => computedOf(page, 'note', 'fontSize')).toBe('96px');
    expect(await computedOf(page, 'note', 'color')).toBe('rgb(76, 141, 255)');
    await expect(copyFormat).toHaveAttribute('aria-pressed', 'false');

    // Различитель: правим САМ стиль «heading» напрямую (не через title) —
    // приёмник обязан поехать, будь это живая связь, а не штамп.
    await editStyle(page, 'heading', { 'font-size': '140px' });
    await expect.poll(() => computedOf(page, 'note', 'fontSize')).toBe('140px');
  });

  test('источник без стиля: копируются ЗНАЧЕНИЯ разово — правка источника ПОСЛЕ приёмника не касается', async ({
    page,
  }) => {
    await openEditor(page, 'styles');

    // note идёт по «Тихому»: 40px, rgb(147, 164, 184) — до всякого копирования.
    expect(await computedOf(page, 'note', 'fontSize')).toBe('40px');

    // Источник — свежевставленный текст: НЕТ styleId, только сырые значения
    // (`state/library.ts`: font-size 36px, color #9fb0c4).
    await page.getByTestId('rail-text').click();
    await page.getByTestId('insert-text').click();
    await expect(page.getByTestId('selection-readout')).toContainText('text-1');

    // «Копировать форматирование» уехало с полосы в блок «Расположение»
    // панели «Объект» (Сессия 48) — дверь та же, что у остальных органов.
    // Панель, раз открытая, остаётся открытой и ниже — второй клик по
    // «Ещё…» на строке ~150 нужен уже не для неё, а работает так же.
    await page.getByTestId('propbar-more').click();
    const copyFormat = page.getByTestId('copy-format');
    await copyFormat.click();
    await expect(copyFormat).toHaveAttribute('aria-pressed', 'true');

    // Левый край: свежевставленный text-1 ложится каскадом поверх правой
    // половины note (проверено прогоном) — клик в центр note попал бы в него.
    await clickOnCanvas(page, 'note', 0.1);

    // Промежуточная проверка: применение состоялось.
    await expect.poll(() => computedOf(page, 'note', 'fontSize')).toBe('36px');
    expect(await computedOf(page, 'note', 'color')).toBe('rgb(159, 176, 196)');

    // note остался на styleId «quiet» (формат-значения его не переводили) —
    // правка ИСТОЧНИКА (не quiet, не heading) приёмника не касается вовсе:
    // разовое копирование, а не связь.
    // propbar-more выше увёл дверь с «Слои» на «Объект» — открываем заново.
    await openLayers(page);
    await page.getByTestId('element-row-text-1').click();
    await page.getByTestId('propbar-more').click();
    // Полоса свойств ТОЖЕ показывает поле «Цвет» для текста (BAR_FIELD_KEYS) —
    // без области видимости getByLabel нашёл бы два узла и упал строгим
    // режимом (тот же класс дефекта, что и «Фон» темы против «Фон» стиля,
    // CLAUDE.md). Область — только панель «Объект».
    const colorField = page.getByTestId('inspector').getByLabel('Цвет', { exact: true });
    await colorField.evaluate((node, value) => {
      const el = node as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, '#00ff00');

    // Дать событию дойти и убедиться, что источник и правда поменялся —
    // иначе «приёмник не поехал» ничего не доказывает.
    await expect.poll(() => computedOf(page, 'text-1', 'color')).toBe('rgb(0, 255, 0)');
    expect(await computedOf(page, 'note', 'color'), 'разовая копия не обязана следовать за источником').toBe(
      'rgb(159, 176, 196)',
    );
  });

  test('тип источника и цели обязаны совпадать: клик по фигуре формат не тратит', async ({ page }) => {
    await openEditor(page, 'styles');
    await openLayers(page);

    const plateBefore = await computedOf(page, 'plate-1', 'backgroundColor');

    // Источник — title (text). Цель первого щелчка — plate-1 (shape).
    await page.getByTestId('element-row-title').click();
    // «Копировать форматирование» уехало с полосы в блок «Расположение»
    // панели «Объект» (Сессия 48) — дверь та же, что у остальных органов.
    await page.getByTestId('propbar-more').click();
    const copyFormat = page.getByTestId('copy-format');
    await copyFormat.click();

    // Нижняя часть plate-1: title/sub/note лежат ВЫШЕ по слоям и целиком
    // внутри бокса plate-1 (она подложка на весь слайд) — центр plate-1
    // физически совпадает с боксом sub. 0.9 по вертикали — зона НИЖЕ note,
    // свободная от текстовых элементов (проверено прогоном).
    await clickOnCanvas(page, 'plate-1', 0.5, 0.9);

    // Формат чужого типа НЕ применился — plate-1 не тронут, кнопка
    // осталась нажатой: формат всё ещё «в руке» и ждёт подходящую цель.
    expect(await computedOf(page, 'plate-1', 'backgroundColor'), 'фигура не могла принять текстовый формат').toBe(
      plateBefore,
    );
    await expect(copyFormat).toHaveAttribute('aria-pressed', 'true');

    // Второй, уже подходящий по типу щелчок — применяет, как обычно.
    await clickOnCanvas(page, 'note');
    await expect.poll(() => computedOf(page, 'note', 'fontSize')).toBe('96px');
    await expect(copyFormat).toHaveAttribute('aria-pressed', 'false');
  });
});

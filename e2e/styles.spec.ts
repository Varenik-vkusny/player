/**
 * Стили: живая связь и отцепление ПО СВОЙСТВУ, на живом рендере.
 *
 * Почему e2e, а не юнит. Предмет проверки — КАСКАД БРАУЗЕРА: правило класса
 * против инлайна, подстановка `var()`, порядок листов. Ни одного из трёх
 * в jsdom нет в том виде, в каком они работают у зрителя, и юнит-тест здесь
 * доказывал бы только то, что мы правильно записали строку.
 *
 * Почему не «применил стиль — вид совпал». Такой тест верен при ЛЮБОЙ
 * реализации применения, в том числе при штампе: он не отличает живую связь
 * от разового копирования значений. Различает их только ПРАВКА СТИЛЯ ПОСЛЕ
 * применения — и все проверки ниже построены вокруг неё.
 *
 * → docs/adr/ADR-029-styles.md, spikes/run-styles-cascade.mjs
 */
import { expect, test, type Page } from '@playwright/test';

/** Кегль и цвет элемента так, как их видит браузер. */
async function seen(page: Page, id: string): Promise<{ fontSize: string; color: string }> {
  return page.evaluate((elementId) => {
    const node = document.querySelector(`[data-id="${elementId}"]`);
    if (!node) throw new Error(`Элемента «${elementId}» нет на сцене`);
    const computed = getComputedStyle(node);
    return { fontSize: computed.fontSize, color: computed.color };
  }, id);
}

/**
 * Правит стиль ОДНОЙ записью в правило — ровно так, как это делает редактор.
 *
 * Возвращает селектор: если лист стилей сцены не найден, тест обязан упасть
 * здесь и громко, а не показать «значения не изменились» и списать это
 * на отсутствие живой связи.
 */
async function editStyle(
  page: Page,
  styleId: string,
  props: Record<string, string>,
): Promise<string> {
  return page.evaluate(({ id, values }) => {
    const sheets = [...document.styleSheets];
    const sheet = sheets.find((s) => (s.ownerNode as HTMLElement | null)?.dataset?.['sceneStyles']);
    if (!sheet) throw new Error('Лист стилей сцены не найден: править нечего');

    const rule = [...sheet.cssRules].find(
      (r) => (r as CSSStyleRule).selectorText?.includes(`.st-${id}`),
    ) as CSSStyleRule | undefined;
    if (!rule) throw new Error(`Правила для стиля «${id}» нет в листе сцены`);

    for (const [key, value] of Object.entries(values)) rule.style.setProperty(key, value);
    return rule.selectorText;
  }, { id: styleId, values: props });
}

/**
 * Страница предпросмотра, а не плеер: момент задаётся адресом и не зависит
 * от звука. Ровно то же основание, по которому на ней стоят скриншотные
 * тесты — картинка есть чистая функция от сцены и времени.
 */
async function openAt(page: Page, seconds: number): Promise<void> {
  await page.goto(`/preview.html?fixture=styles&t=${seconds}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

test.describe('стили на сцене', () => {
  test.beforeEach(async ({ page }) => {
    await openAt(page, 0);
  });

  test('правка стиля ведёт непотревоженный элемент и НЕ трогает отцепленный по этому свойству', async ({
    page,
  }) => {
    // Промежуточная проверка: отличие ДОЛЖНО существовать до правки.
    // Без неё тест остался бы зелёным при полностью отключённых стилях —
    // ровно тот дефект, что нашёлся в Сессии 33 на «Ctrl+Z убирает вставленное».
    const titleBefore = await seen(page, 'title');
    const subBefore = await seen(page, 'sub');
    expect(titleBefore.fontSize).toBe('96px');
    expect(subBefore.fontSize).toBe('48px');
    expect(subBefore.color).toBe(titleBefore.color);

    await editStyle(page, 'heading', { 'font-size': '140px' });

    const titleAfter = await seen(page, 'title');
    const subAfter = await seen(page, 'sub');

    expect(titleAfter.fontSize, 'непотревоженный элемент обязан поехать за стилем').toBe('140px');
    expect(subAfter.fontSize, 'отцепленный по кеглю обязан устоять').toBe('48px');
  });

  test('отцепление именно ПО СВОЙСТВУ: цвет у отцепленного по кеглю всё равно едет', async ({
    page,
  }) => {
    // Это и отличает отцепление по свойству от отцепления целиком. Слом:
    // выбрасывать элемент из стиля при любой ручной правке — тест покраснеет
    // здесь, а предыдущий останется зелёным.
    const before = await seen(page, 'sub');
    expect(before.color).toBe('rgb(76, 141, 255)');

    await editStyle(page, 'heading', { color: 'rgb(0, 200, 0)' });

    const after = await seen(page, 'sub');
    expect(after.color, 'цвет никто не отцеплял — он обязан ехать').toBe('rgb(0, 200, 0)');
    expect(after.fontSize, 'кегль отцеплён и остаётся своим').toBe('48px');
  });

  test('ссылка на роль темы разрешается, а без запаса элемент почернел бы', async ({ page }) => {
    // Роль объявлена: ссылка обязана дать цвет темы, а не запасной.
    const note = await seen(page, 'note');
    expect(note.color).toBe('rgb(147, 164, 184)');

    // Роли нет: запас держит. Измерено S14 — БЕЗ запаса здесь было бы
    // rgb(0,0,0), и базовое оформление сцены от этого не спасает.
    const withFallback = await page.evaluate(() => {
      const node = document.querySelector('[data-id="note"]') as HTMLElement;
      node.style.setProperty('color', 'var(--scene-nonexistent, #4c8dff)');
      const ok = getComputedStyle(node).color;
      node.style.setProperty('color', 'var(--scene-nonexistent)');
      const bare = getComputedStyle(node).color;
      node.style.removeProperty('color');
      return { ok, bare };
    });

    expect(withFallback.ok, 'запас обязан удержать цвет').toBe('rgb(76, 141, 255)');
    expect(withFallback.bare, 'без запаса ссылка проваливается молча').not.toBe('rgb(76, 141, 255)');
  });

  test('элемент идёт по РАЗНЫМ стилям на разных слайдах', async ({ page }) => {
    // Решение владельца 14.08.2026, ради которого ссылка легла в состояние
    // слайда. На первом слайде заголовок «Главный», на втором — «Тихий».
    const first = await seen(page, 'title');
    expect(first.fontSize).toBe('96px');

    await openAt(page, 2.2);

    const second = await seen(page, 'title');
    expect(second.fontSize, 'на втором слайде заголовок обязан стать Тихим').toBe('40px');
  });
});

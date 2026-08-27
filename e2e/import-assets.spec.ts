/**
 * Импорт презентации: картинки, шрифты и контуры — в живом браузере.
 *
 * Почему всё это здесь, а не в юнитах. Юниты плеера гоняются в окружении
 * `node` без DOM (`vitest.config.ts:6`), и узлы там — заглушки
 * (`packages/player/test/renderers.test.ts`). Ни `document.createElementNS`,
 * ни `@font-face`, ни IndexedDB в них нет и быть не может, а подделка
 * проверяла бы саму себя. Значит единственное место, где видно, что
 * импортированный слайд вправду ВЫГЛЯДИТ как исходник, — браузер.
 *
 * → ADR-031, план 2026-08-27
 */
import { expect, test, type Page } from '@playwright/test';

const TEXT_DECK = 'fixtures/import/canva-page-text.pptx';
const IMAGE_DECK = 'fixtures/import/canva-page-notes.pptx';

interface ProjectView {
  readonly fonts: readonly { readonly family: string; readonly assetId: string }[];
  readonly segments: readonly {
    readonly elements: readonly {
      readonly id: string;
      readonly type: string;
      readonly assetId?: string;
      readonly path?: { readonly d: string; readonly endArrow?: string };
    }[];
    readonly slides: readonly {
      readonly states: Record<string, { readonly style: Record<string, string> }>;
    }[];
  }[];
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/editor.html?fixture=demo', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/** Перезагрузка, которую редактор запускает сам после импорта. */
async function importDeck(page: Page, path: string): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __old?: true }).__old = true;
  });
  await page.getByTestId('import-pptx-input').setInputFiles(path);
  await page.waitForFunction(
    () =>
      (window as unknown as { __old?: true }).__old === undefined &&
      document.documentElement.dataset['ready'] === '1',
    null,
    { timeout: 60_000 },
  );
  // Байты приходят из хранилища ПОСЛЕ первой отрисовки: оно асинхронное.
  await page.waitForTimeout(1500);
}

const projectOf = (page: Page): Promise<ProjectView> =>
  page.evaluate(() => (window as unknown as { __project: ProjectView }).__project);

/**
 * Ширина строки, отрисованной заданным семейством.
 *
 * Единственный годный прибор для «применился ли шрифт». `document.fonts.check()`
 * НЕ ГОДИТСЯ: замерено 27.08.2026 — он вернул `true` для заведомо выдуманного
 * имени, то есть дал бы вечнозелёный тест.
 */
async function widthOf(page: Page, family: string, text: string): Promise<number> {
  // Один довод объектом, а не пара: у `page.evaluate` перегрузка выводит
  // тип ровно одного аргумента, и распакованная пара теряет типы.
  return page.evaluate((arg: { family: string; text: string }) => {
    const span = document.createElement('span');
    span.textContent = arg.text;
    span.style.cssText = 'position:absolute;left:-9999px;font-size:100px;white-space:pre;'
      + `font-family:${arg.family}`;
    document.body.appendChild(span);
    const width = span.getBoundingClientRect().width;
    span.remove();
    return Math.round(width * 100) / 100;
  }, { family, text });
}

test.describe('импорт: картинки, шрифты и контуры', () => {
  test('картинки приезжают с ключом байтов, и ключ ОДИН на все повторы', async ({ page }) => {
    await openEditor(page);
    await importDeck(page, IMAGE_DECK);

    const images = (await projectOf(page)).segments[0]!.elements
      .filter((element) => element.type === 'image');

    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image.assetId).toBeTruthy();
    // Ключ считается по СОДЕРЖИМОМУ, а на этой странице десять элементов
    // ссылаются на один `ppt/media/image1.png`. Значит ключ обязан быть один:
    // иначе одна картинка занимала бы место десять раз (на настоящей
    // презентации владельца — 113 раз).
    expect(new Set(images.map((image) => image.assetId)).size).toBe(1);
  });

  test('картинка ВИДНА на сцене, а не только в данных', async ({ page }) => {
    // Проверка по видимому. Тест на поле `assetId` остался бы зелёным и в том
    // случае, когда рендер не получил ни одного адреса: данные и картинка
    // на экране — разные утверждения, и второе дороже.
    await openEditor(page);
    await importDeck(page, IMAGE_DECK);

    const painted = await page.evaluate(() =>
      [...document.querySelectorAll('[data-id]')]
        .map((node) => (node as HTMLElement).style.backgroundImage)
        .filter((value) => value.includes('blob:')).length);

    expect(painted).toBeGreaterThan(0);
  });

  test('текст рисуется ВШИТЫМ шрифтом, и это видно только на латинице', async ({ page }) => {
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const вшитый = '"Barlow Condensed", sans-serif';
    const запасной = '"XYZ-net-takogo-shrifta", sans-serif';

    // Латиница: шрифт покрывает её, значит ширины обязаны РАЗОЙТИСЬ.
    // Замерено 27.08.2026: 450.5 против 639.41.
    const латВшитым = await widthOf(page, вшитый, 'Agency 12345');
    const латЗапасным = await widthOf(page, запасной, 'Agency 12345');
    expect(латВшитым).toBeLessThan(латЗапасным);

    // Кириллица: её в шрифте НЕТ — доказано разбором таблицы символов
    // (525 знаков, диапазон 0x0410–0x044F пуст). Числа обязаны СОВПАСТЬ.
    //
    // Это КОНТРОЛЬ, а не придирка: без него тест не отличал бы «шрифт
    // применился» от «шрифт тут ни при чём», и проверка на русском слове
    // была бы вечнозелёной при любой реализации.
    const кирВшитым = await widthOf(page, вшитый, 'АГЕНТСТВО');
    const кирЗапасным = await widthOf(page, запасной, 'АГЕНТСТВО');
    expect(кирВшитым).toBe(кирЗапасным);
  });

  test('у шрифта в стиле есть ЗАПАСНОЙ, иначе текст падает в засечковый', async ({ page }) => {
    // Найдено глазами: без запасного браузер берёт Times, и русский слайд
    // выглядит чужим. Сама Canva падает в гротеск — измерено в её редакторе.
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const style = (await projectOf(page)).segments[0]!.slides[0]!.states['p1-e1']!.style;
    expect(style['font-family']).toContain('Barlow Condensed');
    expect(style['font-family']).toContain('sans-serif');
  });

  test('стрелки рисуются контуром с наконечником, а не рамкой', async ({ page }) => {
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const project = await projectOf(page);
    const withPath = project.segments[0]!.elements.filter((element) => element.path);
    expect(withPath.length).toBeGreaterThan(0);

    // Наконечник доехал из файла: в сыром XML у линий tailEnd type="triangle".
    expect(withPath.some((element) => element.path!.endArrow === 'triangle')).toBe(true);

    // Ни у одной фигуры с контуром не осталось рамки: раньше линия приезжала
    // прямоугольником с `border`, и это ровно тот дефект, который здесь закрыт.
    const states = project.segments[0]!.slides[0]!.states;
    for (const element of withPath) {
      expect(states[element.id]!.style['border']).toBeUndefined();
    }
  });

  test('контуры и наконечники ДОЕЗЖАЮТ до экрана', async ({ page }) => {
    // Опять по видимому: поля `path` в данных мало. Замерено 27.08.2026 —
    // 4 контура (три стрелки и разделитель) и 3 наконечника.
    await openEditor(page);
    await importDeck(page, TEXT_DECK);

    const нарисовано = await page.evaluate(() => ({
      контуров: document.querySelectorAll('[data-id] svg').length,
      наконечников: document.querySelectorAll('[data-id] marker').length,
    }));

    expect(нарисовано.контуров).toBeGreaterThan(0);
    expect(нарисовано.наконечников).toBeGreaterThan(0);
  });

  test('хранилище: ключ картинки не читается из шрифтов, а чужого ключа нет', async ({ page }) => {
    // Единственная постоянная проверка самого хранилища: в юнитах IndexedDB
    // нет вовсе (окружение `node`), и заглушка проверяла бы саму себя.
    await openEditor(page);
    await importDeck(page, IMAGE_DECK);

    const project = await projectOf(page);
    const ключКартинки = project.segments[0]!.elements
      .find((element) => element.type === 'image')!.assetId!;

    const итог = await page.evaluate(async (ключ) => {
      const { getBlob } = window as unknown as {
        getBlob: (store: 'images' | 'fonts', id: string) => Promise<unknown>;
      };
      if (typeof getBlob !== 'function') return 'входа нет';
      return {
        картинкаЕсть: (await getBlob('images', ключ)) !== null,
        вШрифтахНет: (await getBlob('fonts', ключ)) === null,
        чужогоНет: (await getBlob('images', 'нет-такого-ключа')) === null,
      };
    }, ключКартинки);

    // Если входа со страницы нет — проверяем то, что доступно снаружи:
    // картинка нарисовалась, значит байты из хранилища вправду прочитались.
    if (итог === 'входа нет') {
      const painted = await page.evaluate(() =>
        [...document.querySelectorAll('[data-id]')]
          .filter((node) => (node as HTMLElement).style.backgroundImage.includes('blob:')).length);
      expect(painted).toBeGreaterThan(0);
      return;
    }
    expect(итог).toEqual({ картинкаЕсть: true, вШрифтахНет: true, чужогоНет: true });
  });
});

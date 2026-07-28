/**
 * ScenePreview: сцена на заданном моменте, без звука.
 *
 * Тест закрывает две вещи, которые иначе всплыли бы поздно и тихо.
 *
 * Первая — фикстуры без аудиофайла. У minimal.json, two-gates.json и
 * edge-cases.json поля audio.src ведут в никуда: этих файлов на диске нет,
 * и схема такого не ловит. Через класс Player их не открыть, а показать
 * картинку на секунде T звук и не требуется. Если ScenePreview когда-нибудь
 * начнёт трогать дорожку, три фикстуры из пяти перестанут открываться.
 *
 * Вторая — точечное обновление узла. applyElement приводит узел к состоянию
 * из схемы и стирает всё, что накрутил таймлайн. В demo.json у элементов
 * в схеме стоит opacity: 0, а видимыми их делает анимация, поэтому наивная
 * реализация гасила бы элемент ровно в тот момент, когда автор берёт его
 * мышкой. Здесь это проверяется измерением, а не рассуждением.
 */
import { expect, test, type Page } from '@playwright/test';

interface PreviewHandle {
  seek(seconds: number): void;
  updateElement(element: Record<string, unknown>): void;
  readonly nodes: ReadonlyMap<string, HTMLElement>;
  readonly segment: { scene: { elements: Record<string, unknown>[] } };
}

/** Открывает оснастку и возвращает ошибки страницы: пустой список — часть проверки. */
async function openPreview(page: Page, fixture: string, t: number): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(`/preview.html?fixture=${fixture}&t=${t}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
  return errors;
}

test.describe('ScenePreview: картинка на моменте без звука', () => {
  test('фикстура без аудиофайла на диске всё равно показывает сцену', async ({ page }) => {
    // У minimal.json audio.src = /audio/minimal.mp3, которого не существует.
    const errors = await openPreview(page, 'minimal', 0);
    expect(errors, 'предпросмотр не должен трогать дорожку').toEqual([]);

    await expect(page.locator('#stage-host > div > .scene-el')).toHaveCount(1);
  });

  test('все пять эталонных фикстур открываются предпросмотром', async ({ page }) => {
    for (const fixture of ['minimal', 'two-gates', 'edge-cases', 'demo', 'e2e']) {
      const errors = await openPreview(page, fixture, 0);
      expect(errors, `фикстура ${fixture} не открылась чисто`).toEqual([]);
      const count = await page.locator('#stage-host > div > .scene-el').count();
      expect(count, `у фикстуры ${fixture} не построилась сцена`).toBeGreaterThan(0);
    }
  });

  test('элемента нет на экране до его анимации появления', async ({ page }) => {
    // Дефект, найденный этой страховкой в первый же день. У карточки
    // в two-gates.json кью «opacity 0 → 1» на восьмой секунде, а в стиле
    // прозрачность не задана. Раньше она была видна все восемь секунд,
    // на 8.000 гасла и лишь потом проявлялась.
    //
    // Время двигается покадрово, а не скачком, и это существенно: при
    // большом скачке anime.js форсирует рендер, и сломанная реализация
    // выглядела бы исправной. Разница между этими двумя способами
    // проверки и есть то, на чём легко обмануться.
    await openPreview(page, 'two-gates', 0);

    const samples = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      const card = preview.nodes.get('card');
      if (!card) throw new Error('на сцене нет элемента card');

      const seen: Record<string, string> = {};
      const checkpoints = new Map([[0, 'старт'], [240, 'середина'], [479, 'перед кью']]);
      for (let frame = 0; frame <= 479; frame++) {
        preview.seek((frame * 16.7) / 1000);
        const label = checkpoints.get(frame);
        if (label) seen[label] = card.style.opacity;
      }
      return seen;
    });

    expect(samples['старт'], 'на нулевом кадре карточки уже не должно быть видно').toBe('0');
    expect(samples['середина']).toBe('0');
    expect(samples['перед кью'], 'до самого старта кью карточка обязана быть скрыта').toBe('0');
  });

  test('картинка на моменте не зависит от того, откуда к нему пришли', async ({ page }) => {
    // Свойство, без которого редактор невозможен: автор таскает головку
    // по дорожке в обе стороны и обязан видеть одно и то же на одной
    // и той же секунде. Наивная реализация это нарушала — после перемотки
    // с 9.0 на 4.0 карточка оставалась непрозрачной, хотя её анимация
    // начинается только на 8.0.
    await openPreview(page, 'two-gates', 0);

    const [forward, backward] = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      const read = (): Record<string, string> => {
        const out: Record<string, string> = {};
        for (const [id, node] of preview.nodes) {
          out[id] = `${node.style.opacity}|${node.style.transform}`;
        }
        return out;
      };

      preview.seek(4);
      const fromStart = read();

      preview.seek(20);
      preview.seek(4);
      const fromEnd = read();

      return [fromStart, fromEnd];
    });

    expect(backward, 'приход назад дал другую картинку, чем приход вперёд').toEqual(forward);
  });

  test('updateElement двигает элемент и не гасит его анимацию', async ({ page }) => {
    // t = 5 с: анимация c-title (слово №0, длительность 700 мс) давно доиграла,
    // то есть title обязан быть видимым, хотя в схеме у него opacity: 0.
    const errors = await openPreview(page, 'demo', 5);
    expect(errors).toEqual([]);

    const before = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      const node = preview.nodes.get('title');
      if (!node) throw new Error('на сцене нет элемента title');
      return { left: node.style.left, opacity: node.style.opacity };
    });
    expect(before.left).toBe('140px');
    expect(before.opacity, 'до правки анимация уже вывела title в единицу').toBe('1');

    const after = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      const element = preview.segment.scene.elements.find((e) => e['id'] === 'title');
      if (!element) throw new Error('в сегменте нет элемента title');
      preview.updateElement({ ...element, x: 400, y: 200 });
      const node = preview.nodes.get('title');
      if (!node) throw new Error('узел title исчез после обновления');
      return { left: node.style.left, top: node.style.top, opacity: node.style.opacity };
    });

    expect(after.left, 'элемент обязан переехать').toBe('400px');
    expect(after.top).toBe('200px');
    expect(after.opacity, 'элемент не должен гаснуть при перетаскивании').toBe('1');
  });

  test('узлы переживают точечное обновление: таймлайн не остаётся с мусором', async ({ page }) => {
    // renderScene пересоздаёт узлы, и таймлайн после неё ссылается на
    // выброшенные. updateElement обязан работать по тому же узлу.
    await openPreview(page, 'demo', 5);

    const sameNode = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      const element = preview.segment.scene.elements.find((e) => e['id'] === 'title');
      if (!element) throw new Error('в сегменте нет элемента title');
      const nodeBefore = preview.nodes.get('title');
      preview.updateElement({ ...element, x: 300 });
      return nodeBefore === preview.nodes.get('title') && nodeBefore?.isConnected === true;
    });

    expect(sameNode, 'узел обязан остаться тем же и остаться в документе').toBe(true);
  });

  test('момент за пределами дорожки падает громко', async ({ page }) => {
    await openPreview(page, 'demo', 0);
    const message = await page.evaluate(() => {
      const preview = (window as unknown as { __preview: PreviewHandle }).__preview;
      try {
        preview.seek(-1);
        return 'ошибки не было';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(message).toContain('Некорректный момент');
  });
});

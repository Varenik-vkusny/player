/**
 * Достижимость органов управления сцены (Сессия 34).
 *
 * Тест на КЛАСС дефекта, а не на четыре случая. Класс такой: орган
 * управления нарисован, автор его ВИДИТ, а нажатие достаётся другому узлу.
 * За три сессии он проявился четырежды — ручка поворота уходила за верх
 * области холста (С33), захват указателя съедал клик по кнопкам панели
 * масштаба (С32), метка гейта пряталась под меткой слайда (С7), кликабельная
 * сцена перехватывала кнопки ответа в гейте (С15).
 *
 * Почему обычные тесты его не ловят: состояние в коде ВЕРНОЕ. Обработчик
 * висит, значение меняется, `toBeVisible()` зелёный, `toBeEnabled()` зелёный.
 * Не доходит только нажатие, и не доходит МОЛЧА — ни ошибки, ни
 * предупреждения. Проверка «вызвался ли обработчик» зелена по определению:
 * её вызывают в обход того самого слоя, который и ломается.
 *
 * Единственная проверка, которая ловит класс целиком, — спросить у браузера
 * `document.elementFromPoint` в центре органа и потребовать, чтобы ответом
 * был он сам. Это ровно тот вопрос, на который отвечает указатель автора.
 *
 * ЧТО ДОЛЖНО СЛОМАТЬСЯ, ЧТОБЫ ТЕСТ ПОКРАСНЕЛ — измерено ДО его написания,
 * на коде до починки: восемь ручек размера отдавали `div.ed-grip`, а ручка
 * поворота отдавала `div.ed-propbar`. То есть тест обязан был дать ровно
 * одно красное, и дал. Слом для перепроверки: вернуть `.ed-grip-rotate`
 * на `top: -26px` в `styles.ts`.
 */
import { expect, test, type Page } from '@playwright/test';

async function openEditor(page: Page, fixture: string): Promise<void> {
  await page.goto(`/editor.html?fixture=${fixture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset['ready'] === '1', null, {
    timeout: 30_000,
  });
}

/**
 * Восемь ручек размера, ручка поворота и три органа панели масштаба.
 * Список задан ЯВНО, а не собран запросом по классу: перечисление —
 * это и есть предмет проверки. Собери его запросом, и пропавший орган
 * не сделает тест красным, он просто выпадет из обхода.
 */
const GRIPS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rotate'] as const;
const ZOOM_CONTROLS = ['zoom-out', 'zoom-select', 'zoom-in'] as const;
const CONTROL_COUNT = GRIPS.length + ZOOM_CONTROLS.length;

interface Reach {
  name: string;
  /** Что отдал `elementFromPoint` в центре органа. */
  hit: string;
  reachable: boolean;
}

/**
 * Оба случая обхода — не для полноты, а потому что они идут по РАЗНЫМ веткам
 * выбора места для ручки поворота (`rotateSide` в `Overlay.tsx`), и замер
 * это подтвердил:
 *
 *   two-gates/question — рамка на 55.5 от верха полотна, ручка встаёт СВЕРХУ;
 *   demo/bg           — элемент во весь экран, рамка на 0.0, снизу тоже нет
 *                       места (ручка уезжала на `div.ed-zoom-strip`), ручка
 *                       встаёт ВНУТРИ.
 *
 * На одном лишь `question` тест был бы зелёным при полностью выключенном
 * переносе: там ручка помещается сверху и без него. Проверено — именно так
 * и вышло на первой попытке слома.
 */
const CASES = [
  { fixture: 'two-gates', element: 'question', knownUnreachable: [] },
  {
    fixture: 'demo',
    element: 'bg',
    /**
     * ДЕФЕКТ СЕССИИ 34 ЗАКРЫТ В СЕССИИ 36. Список опустел ЗАКОННО.
     *
     * Было: у элемента во весь экран нижний край рамки совпадал с нижним
     * краем области холста, ручки стоят ЦЕНТРОМ на краю (`margin: -5px`),
     * и точка ровно на границе доставалась соседу — `elementFromPoint`
     * отдавал `div.ed-zoom-strip`. Фон нельзя было потянуть за низ, молча.
     *
     * Стало: вокруг сцены есть зазор (`STAGE_GAP_X`/`STAGE_GAP_Y` в
     * `stage/zoom.ts`), её край с краем области больше не совпадает.
     * Числа сняты с живой Canva 12.08.2026 —
     * `docs/research/2026-08-12-canva-stage-gap.md`.
     *
     * Пустой список здесь НЕ выключает проверку: любая новая непопадаемая
     * ручка вернёт его непустым и сделает тест красным. Откат зазора
     * покрасит его первым — тремя именами, что были здесь записаны.
     */
    knownUnreachable: [],
  },
] as const;

for (const { fixture, element, knownUnreachable } of CASES) {
  test(`каждый орган управления сцены достаётся указателю: ${fixture}/${element}`, async ({
    page,
  }) => {
  await openEditor(page, fixture);

  // На первом слайде эталонных фикстур виден ОДИН элемент (грабля С33).
  // Тело элемента ловит контейнер сцены, а не сам узел, поэтому выделяем
  // настоящим кликом мыши по координатам, а не `locator.click()`.
  const center = await page.evaluate((elementId) => {
    const node = document.querySelector(`.ed-stage-scroll [data-id="${elementId}"]`);
    if (!node) throw new Error(`нет узла ${elementId} на первом слайде`);
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, element);
  await page.mouse.click(center.x, center.y);

  // ПРЕДЫДУЩИЙ ШАГ СОСТОЯЛСЯ. Без этой проверки тест остаётся зелёным при
  // пропавшем выделении: обходить будет нечего, непопадаемых органов ноль,
  // число сойдётся. Ровно так декоративным оказался e2e на отмену в С33 §9.
  await expect(page.getByTestId('selection-frame')).toBeVisible();
  await expect(page.locator('.ed-frame .ed-grip')).toHaveCount(GRIPS.length);

  const report = await page.evaluate(
    ({ grips, zoomControls }) => {
      const label = (node: Element | null): string => {
        if (!node) return 'null';
        const cls = String((node as HTMLElement).className).trim().split(/\s+/).filter(Boolean);
        return node.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : '');
      };

      const measure = (name: string, node: Element | null): Reach => {
        if (!node) return { name, hit: 'органа нет в разметке', reachable: false };
        const rect = node.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { name, hit: 'нулевой размер', reachable: false };
        }
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return { name, hit: label(hit), reachable: hit === node };
      };

      interface Reach {
        name: string;
        hit: string;
        reachable: boolean;
      }

      const out: Reach[] = [];
      for (const grip of grips) {
        out.push(measure(`ручка ${grip}`, document.querySelector(`[data-grip="${grip}"]`)));
      }
      for (const id of zoomControls) {
        out.push(measure(`масштаб ${id}`, document.querySelector(`[data-testid="${id}"]`)));
      }
      return out;
    },
    { grips: [...GRIPS], zoomControls: [...ZOOM_CONTROLS] },
  );

  // Обход состоялся целиком: пустой или укороченный список органов дал бы
  // ноль непопадаемых и зелёный тест при полностью сломанном редакторе.
  expect(report).toHaveLength(CONTROL_COUNT);

  const unreachable = (report as Reach[]).filter((entry) => !entry.reachable);
  const details = unreachable
    .map((entry) => `${entry.name}: нажатие достаётся ${entry.hit}`)
    .join('\n');

  expect(unreachable.map((entry) => entry.name).sort(), details).toEqual(
    [...knownUnreachable].sort(),
  );
  });
}

/**
 * Достижимость — ещё не работа. Здесь ручка поворота действительно поворачивает.
 *
 * Такого теста не существовало вовсе: Сессия 33 назвала это вслух — «задать
 * поворот жестом в тесте нельзя, ручка недостижима», — и поэтому дефект мог
 * жить сколько угодно. Поворот через числовое поле панели свойств работал
 * всё это время, и любая проверка через него была бы зелёной.
 *
 * Угол проверяется ДВАЖДЫ и по-разному. Число из проекта могло бы совпасть
 * при неверной отрисовке, а размеры отрисованного бокса — при неверной записи
 * в проект. Вместе они не сходятся случайно: повёрнутый на 90 градусов бокс
 * обязан обменять на экране ширину с высотой.
 */
test('ручка поворота действительно поворачивает объект', async ({ page }) => {
  await openEditor(page, 'two-gates');

  const center = await page.evaluate(() => {
    const node = document.querySelector('.ed-stage-scroll [data-id="question"]');
    if (!node) throw new Error('нет узла question');
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(center.x, center.y);

  const before = await page.evaluate(() => {
    const frame = document.querySelector('.ed-frame')!.getBoundingClientRect();
    const node = document.querySelector('[data-id="question"]')!.getBoundingClientRect();
    const grip = document.querySelector('[data-grip="rotate"]')!.getBoundingClientRect();
    return {
      frameCenter: { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 },
      grip: { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2 },
      node: { width: node.width, height: node.height },
    };
  });

  // Ручка стоит на расстоянии R от центра рамки. Ведём её по той же окружности
  // на четверть оборота — вправо, на высоту центра. Радиус сохраняется, чтобы
  // проверялся именно угол, а не случайное попадание.
  const radius = Math.hypot(
    before.grip.x - before.frameCenter.x,
    before.grip.y - before.frameCenter.y,
  );
  const target = { x: before.frameCenter.x + radius, y: before.frameCenter.y };

  await page.mouse.move(before.grip.x, before.grip.y);
  await page.mouse.down();
  // Несколько промежуточных шагов: настоящий жест, а не телепорт указателя.
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(
      before.grip.x + ((target.x - before.grip.x) * step) / 8,
      before.grip.y + ((target.y - before.grip.y) * step) / 8,
    );
  }
  await page.mouse.up();

  const rotation = await page.evaluate(() => {
    const project = (window as unknown as {
      __project: { segments: { slides: { states: Record<string, { rotation: number }> }[] }[] };
    }).__project;
    return project.segments[0]!.slides[0]!.states['question']!.rotation;
  });

  // Знак задаёт `angleTo`, и сверять его здесь значило бы переписать формулу
  // продукта в тест. Проверяется ЧЕТВЕРТЬ ОБОРОТА в любую сторону.
  const normalized = ((rotation % 360) + 360) % 360;
  const quarterTurn = Math.min(Math.abs(normalized - 90), Math.abs(normalized - 270));
  expect(quarterTurn, `поворот вышел ${rotation} градусов`).toBeLessThan(5);

  // И то же самое — глазами браузера: бокс обменял ширину с высотой.
  const after = await page.evaluate(
    () => document.querySelector('[data-id="question"]')!.getBoundingClientRect(),
  );
  expect(after.width).toBeCloseTo(before.node.height, 0);
  expect(after.height).toBeCloseTo(before.node.width, 0);
});
